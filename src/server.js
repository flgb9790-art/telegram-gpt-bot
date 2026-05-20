import express from "express";
import { openai } from "./openai.js";
import { PRO_PRICE_STARS, PRO_TEST_IMAGE_TOKENS_BONUS } from "./config.js";
import {
  addImageTokensAtomic,
  createNewChat,
  ensureActiveChatForUser,
  getChatById,
  getChatMessages,
  getRecentTokenTransactions,
  getOrCreateUserFromData,
  getUserChats,
  getUserByTelegramId,
  resetDailyUsageIfNeeded,
  setActiveChat,
  setSubscriptionPlan,
  setUserImageModel,
  setUserTextModel
} from "./db.js";
import {
  IMAGE_GENERATION_COST_TOKENS,
  IMAGE_MODELS,
  TEXT_MODELS,
  canUseImageModel,
  canUseTextModel,
  getUserLimits
} from "./limits.js";

let modelsCache = { items: TEXT_MODELS, fetchedAt: 0 };

function prettyModelLabel(id) {
  return id
    .replace(/^gpt-/, "GPT-")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function getApiTextModels() {
  const now = Date.now();
  if (now - modelsCache.fetchedAt < 10 * 60 * 1000) {
    return modelsCache.items;
  }

  try {
    const list = await openai.models.list();
    const discovered = (list?.data || [])
      .map((item) => item.id)
      .filter((id) => id.startsWith("gpt-"))
      .filter((id) => !/(image|audio|tts|transcribe|realtime)/i.test(id))
      .map((id) => ({ id, label: prettyModelLabel(id) }));

    const mergedMap = new Map();
    for (const model of [...TEXT_MODELS, ...discovered]) {
      mergedMap.set(model.id, model);
    }
    const merged = [...mergedMap.values()].sort((a, b) => a.id.localeCompare(b.id));
    modelsCache = { items: merged, fetchedAt: now };
    return merged;
  } catch (error) {
    console.error("Не удалось получить список моделей из OpenAI API:", error);
    modelsCache = { items: TEXT_MODELS, fetchedAt: now };
    return TEXT_MODELS;
  }
}

export function createServer() {
  const app = express();

  app.use(express.json());
  app.use(express.static("public"));

  app.get("/health", (req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/profile", async (req, res) => {
    try {
      const telegramId = String(req.query.telegram_id || "");
      if (!telegramId) {
        return res.status(400).json({ error: "telegram_id обязателен" });
      }

      let user =
        getUserByTelegramId(telegramId) ||
        getOrCreateUserFromData({ telegramId, username: null, firstName: null });
      user = resetDailyUsageIfNeeded(user);
      const textModels = await getApiTextModels();

      const limits = getUserLimits(user);
      const activeChat = ensureActiveChatForUser(user);
      return res.json({
        telegram_id: user.telegram_id,
        username: user.username,
        first_name: user.first_name,
        selected_text_model: user.selected_text_model,
        selected_image_model: user.selected_image_model,
        image_tokens_balance: Number(user.image_tokens_balance || 0),
        subscription_plan: limits.plan,
        active_chat_id: activeChat.id,
        usage: {
          gpt_messages_today: user.gpt_messages_today,
          images_today: user.images_today
        },
        limits: {
          gpt_messages_per_day: limits.gptMessagesPerDay,
          images_per_day: limits.imagesPerDay,
          allowed_text_models: limits.allowedTextModels,
          allowed_image_models: limits.allowedImageModels
        },
        models: {
          text: textModels,
          image: IMAGE_MODELS
        },
        tokenomics: {
          image_generation_cost_tokens: IMAGE_GENERATION_COST_TOKENS,
          pro_price_stars: PRO_PRICE_STARS
        },
        recent_token_transactions: getRecentTokenTransactions(telegramId, 10)
      });
    } catch (error) {
      console.error("Ошибка /api/profile:", error);
      return res.status(500).json({ error: "Не удалось загрузить профиль" });
    }
  });

  app.post("/api/settings/model", async (req, res) => {
    try {
      const telegramId = String(req.body.telegram_id || "");
      const selectedModel = String(req.body.selected_text_model || "");

      if (!telegramId || !selectedModel) {
        return res
          .status(400)
          .json({ error: "telegram_id и selected_text_model обязательны" });
      }

      let user =
        getUserByTelegramId(telegramId) ||
        getOrCreateUserFromData({ telegramId, username: null, firstName: null });
      user = resetDailyUsageIfNeeded(user);

      const apiModels = await getApiTextModels();
      if (!/^gpt-/i.test(selectedModel) || !apiModels.some((model) => model.id === selectedModel)) {
        return res.status(400).json({ error: "Модель не найдена в текущем API" });
      }

      if (!canUseTextModel(user, selectedModel)) {
        return res
          .status(403)
          .json({ error: "Эта модель доступна только по подписке" });
      }

      const updatedUser = setUserTextModel(telegramId, selectedModel);
      return res.json({
        success: true,
        message: "Модель сохранена",
        selected_text_model: updatedUser.selected_text_model
      });
    } catch (error) {
      console.error("Ошибка /api/settings/model:", error);
      return res.status(500).json({ error: "Не удалось сохранить модель" });
    }
  });

  app.post("/api/settings/image-model", (req, res) => {
    try {
      const telegramId = String(req.body.telegram_id || "");
      const selectedModel = String(req.body.selected_image_model || "");
      if (!telegramId || !selectedModel) {
        return res
          .status(400)
          .json({ error: "telegram_id и selected_image_model обязательны" });
      }

      let user =
        getUserByTelegramId(telegramId) ||
        getOrCreateUserFromData({ telegramId, username: null, firstName: null });
      user = resetDailyUsageIfNeeded(user);

      if (!IMAGE_MODELS.some((model) => model.id === selectedModel)) {
        return res.status(400).json({ error: "Неизвестная модель изображений" });
      }

      if (!canUseImageModel(user, selectedModel)) {
        return res.status(403).json({ error: "Эта модель изображения доступна только по подписке" });
      }

      const updatedUser = setUserImageModel(telegramId, selectedModel);
      return res.json({
        success: true,
        message: "Модель изображений сохранена",
        selected_image_model: updatedUser.selected_image_model
      });
    } catch (error) {
      console.error("Ошибка /api/settings/image-model:", error);
      return res.status(500).json({ error: "Не удалось сохранить модель изображений" });
    }
  });

  app.get("/api/chats", (req, res) => {
    try {
      const telegramId = String(req.query.telegram_id || "");
      if (!telegramId) {
        return res.status(400).json({ error: "telegram_id обязателен" });
      }

      const user =
        getUserByTelegramId(telegramId) ||
        getOrCreateUserFromData({ telegramId, username: null, firstName: null });
      const activeChat = ensureActiveChatForUser(user);
      const chats = getUserChats(telegramId);
      return res.json({ chats, active_chat_id: activeChat.id });
    } catch (error) {
      console.error("Ошибка /api/chats:", error);
      return res.status(500).json({ error: "Не удалось получить историю чатов" });
    }
  });

  app.post("/api/chats/new", (req, res) => {
    try {
      const telegramId = String(req.body.telegram_id || "");
      if (!telegramId) {
        return res.status(400).json({ error: "telegram_id обязателен" });
      }

      const user =
        getUserByTelegramId(telegramId) ||
        getOrCreateUserFromData({ telegramId, username: null, firstName: null });
      const model = user.selected_text_model || "gpt-4.1-mini";
      const chat = createNewChat(telegramId, model, "Новый чат");
      setActiveChat(telegramId, chat.id);
      return res.json({ success: true, chat });
    } catch (error) {
      console.error("Ошибка /api/chats/new:", error);
      return res.status(500).json({ error: "Не удалось создать новый чат" });
    }
  });

  app.post("/api/chats/select", (req, res) => {
    try {
      const telegramId = String(req.body.telegram_id || "");
      const chatId = Number(req.body.chat_id);
      if (!telegramId || !chatId) {
        return res.status(400).json({ error: "telegram_id и chat_id обязательны" });
      }

      const chat = getChatById(chatId);
      if (!chat || String(chat.telegram_id) !== telegramId) {
        return res.status(404).json({ error: "Чат не найден" });
      }

      setActiveChat(telegramId, chatId);
      return res.json({ success: true, active_chat_id: chatId });
    } catch (error) {
      console.error("Ошибка /api/chats/select:", error);
      return res.status(500).json({ error: "Не удалось выбрать чат" });
    }
  });

  app.get("/api/chats/:chatId/messages", (req, res) => {
    try {
      const telegramId = String(req.query.telegram_id || "");
      const chatId = Number(req.params.chatId);
      if (!telegramId || !chatId) {
        return res.status(400).json({ error: "telegram_id обязателен" });
      }

      const chat = getChatById(chatId);
      if (!chat || String(chat.telegram_id) !== telegramId) {
        return res.status(404).json({ error: "Чат не найден" });
      }

      const messages = getChatMessages(chatId);
      return res.json({ chat, messages });
    } catch (error) {
      console.error("Ошибка /api/chats/:chatId/messages:", error);
      return res.status(500).json({ error: "Не удалось загрузить сообщения чата" });
    }
  });

  app.post("/api/subscription/demo-upgrade", (req, res) => {
    try {
      const telegramId = String(req.body.telegram_id || "");
      if (!telegramId) {
        return res.status(400).json({ error: "telegram_id обязателен" });
      }

      if (PRO_PRICE_STARS <= 0) {
        getOrCreateUserFromData({ telegramId, username: null, firstName: null });
        const updatedUser = setSubscriptionPlan(telegramId, "pro");
        if (PRO_TEST_IMAGE_TOKENS_BONUS > 0) {
          addImageTokensAtomic(telegramId, PRO_TEST_IMAGE_TOKENS_BONUS, "pro_bonus", {
            source: "demo_upgrade"
          });
        }
        return res.json({
          success: true,
          message:
            "Тестовый режим: стоимость Pro = 0 Stars. Подписка активирована без оплаты.",
          subscription_plan: updatedUser.subscription_plan
        });
      }

      // TODO: Подключить реальную оплату Telegram Stars (sendInvoice / successful_payment).
      return res.json({
        success: true,
        message:
          "Оплата через Telegram Stars пока не подключена в этом билде. Для теста можно поставить PRO_PRICE_STARS=0.",
        subscription_plan: "free"
      });
    } catch (error) {
      console.error("Ошибка /api/subscription/demo-upgrade:", error);
      return res.status(500).json({ error: "Не удалось обновить тариф" });
    }
  });

  app.get("/api/tokens/transactions", (req, res) => {
    try {
      const telegramId = String(req.query.telegram_id || "");
      const limit = Number(req.query.limit || 20);
      if (!telegramId) {
        return res.status(400).json({ error: "telegram_id обязателен" });
      }

      const user =
        getUserByTelegramId(telegramId) ||
        getOrCreateUserFromData({ telegramId, username: null, firstName: null });

      return res.json({
        telegram_id: user.telegram_id,
        image_tokens_balance: Number(user.image_tokens_balance || 0),
        items: getRecentTokenTransactions(telegramId, Math.max(1, Math.min(limit, 100)))
      });
    } catch (error) {
      console.error("Ошибка /api/tokens/transactions:", error);
      return res.status(500).json({ error: "Не удалось загрузить транзакции токенов" });
    }
  });

  return app;
}
