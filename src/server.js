import express from "express";
import {
  getOrCreateUserFromData,
  getUserByTelegramId,
  resetDailyUsageIfNeeded,
  setSubscriptionPlan,
  setUserTextModel
} from "./db.js";
import { TEXT_MODELS, canUseTextModel, getUserLimits } from "./limits.js";

export function createServer() {
  const app = express();

  app.use(express.json());
  app.use(express.static("public"));

  app.get("/health", (req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/profile", (req, res) => {
    try {
      const telegramId = String(req.query.telegram_id || "");
      if (!telegramId) {
        return res.status(400).json({ error: "telegram_id обязателен" });
      }

      let user =
        getUserByTelegramId(telegramId) ||
        getOrCreateUserFromData({ telegramId, username: null, firstName: null });
      user = resetDailyUsageIfNeeded(user);

      const limits = getUserLimits(user);
      return res.json({
        telegram_id: user.telegram_id,
        username: user.username,
        first_name: user.first_name,
        selected_text_model: user.selected_text_model,
        selected_image_model: user.selected_image_model,
        subscription_plan: limits.plan,
        usage: {
          gpt_messages_today: user.gpt_messages_today,
          images_today: user.images_today
        },
        limits: {
          gpt_messages_per_day: limits.gptMessagesPerDay,
          images_per_day: limits.imagesPerDay,
          allowed_text_models: limits.allowedTextModels
        },
        models: {
          text: TEXT_MODELS
        }
      });
    } catch (error) {
      console.error("Ошибка /api/profile:", error);
      return res.status(500).json({ error: "Не удалось загрузить профиль" });
    }
  });

  app.post("/api/settings/model", (req, res) => {
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

      if (!TEXT_MODELS.some((model) => model.id === selectedModel)) {
        return res.status(400).json({ error: "Неизвестная модель" });
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

  app.post("/api/subscription/demo-upgrade", (req, res) => {
    try {
      const telegramId = String(req.body.telegram_id || "");
      if (!telegramId) {
        return res.status(400).json({ error: "telegram_id обязателен" });
      }

      getOrCreateUserFromData({ telegramId, username: null, firstName: null });
      // TODO: Подключить реальную оплату (Telegram Payments / Telegram Stars) перед продом.
      const updatedUser = setSubscriptionPlan(telegramId, "pro");
      return res.json({
        success: true,
        message: "Оплата пока в тестовом режиме",
        subscription_plan: updatedUser.subscription_plan
      });
    } catch (error) {
      console.error("Ошибка /api/subscription/demo-upgrade:", error);
      return res.status(500).json({ error: "Не удалось обновить тариф" });
    }
  });

  return app;
}
