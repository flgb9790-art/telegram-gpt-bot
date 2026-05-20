import { Markup, Telegraf } from "telegraf";
import { TELEGRAM_BOT_TOKEN, WEBAPP_BASE_URL } from "./config.js";
import {
  addChatMessage,
  createNewChat,
  ensureActiveChatForUser,
  getChatMessages,
  getOrCreateUser,
  updateUserMode,
  incrementGptUsage,
  incrementImageUsage,
  getUserByTelegramId,
  resetDailyUsageIfNeeded,
  setActiveChat,
  setChatTitle,
  setUserTextModel
} from "./db.js";
import {
  canGenerateImage,
  canUseGpt,
  canUseTextModel,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_TEXT_MODEL,
  IMAGE_MODEL_FALLBACKS,
  TEXT_MODEL_FALLBACKS,
  getUserLimits
} from "./limits.js";
import { openai } from "./openai.js";
import {
  BTN_CHAT,
  BTN_IMAGE,
  BTN_MAIN_MENU,
  BTN_NEW_CHAT,
  BTN_PROFILE,
  getChatModeKeyboard,
  getMainMenuKeyboard,
  getProfileKeyboard
} from "./menus.js";

function extractOutputText(response) {
  if (response?.output_text) {
    return response.output_text;
  }

  if (Array.isArray(response?.output)) {
    const textParts = [];
    for (const item of response.output) {
      if (Array.isArray(item?.content)) {
        for (const part of item.content) {
          if (part?.type === "output_text" && part?.text) {
            textParts.push(part.text);
          }
        }
      }
    }
    if (textParts.length > 0) {
      return textParts.join("\n");
    }
  }

  return null;
}

export const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

function shouldTryAnotherModel(error) {
  const status = Number(error?.status);
  return status === 400 || status === 403 || status === 404;
}

function uniqueModels(models) {
  return [...new Set(models.filter(Boolean))];
}

function buildResponseInput(messages, messageText) {
  const contextMessages = messages.slice(-12);
  const contextBlock = contextMessages
    .map((msg) => `${msg.role === "assistant" ? "Ассистент" : "Пользователь"}: ${msg.content}`)
    .join("\n\n");

  return contextBlock
    ? `${contextBlock}\n\nПользователь: ${messageText}`
    : `Пользователь: ${messageText}`;
}

async function sendResponseWithFullViewButton(ctx, telegramId, chatId, fullText) {
  const maxChunk = 3500;
  if (fullText.length <= maxChunk) {
    await ctx.reply(fullText);
    return;
  }

  const preview = `${fullText.slice(0, maxChunk)}\n\n...Ответ обрезан для Telegram.`;
  await ctx.reply(
    preview,
    Markup.inlineKeyboard([
      [
        Markup.button.webApp(
          "📖 Показать весь ответ",
          `${WEBAPP_BASE_URL}/chat.html?telegram_id=${encodeURIComponent(String(telegramId))}&chat_id=${encodeURIComponent(String(chatId))}`
        )
      ]
    ])
  );
}

async function generateTextWithFallback({ messageText, user }) {
  const limits = getUserLimits(user);
  const requestedModel = user.selected_text_model || DEFAULT_TEXT_MODEL;
  const allowedModels = limits.allowedTextModels;
  const preferredModel = canUseTextModel(user, requestedModel) ? requestedModel : DEFAULT_TEXT_MODEL;
  const candidates = uniqueModels([
    preferredModel,
    ...TEXT_MODEL_FALLBACKS.filter((model) => !allowedModels || allowedModels.includes(model))
  ]);

  let lastError = null;
  for (const model of candidates) {
    try {
      const response = await openai.responses.create({
        model,
        input: messageText,
        instructions:
          "Ты полезный Telegram GPT-бот. Отвечай понятно, структурированно и без лишней воды."
      });
      return { model, response };
    } catch (error) {
      lastError = error;
      if (!shouldTryAnotherModel(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Не удалось получить ответ ни от одной модели");
}

async function generateImageWithFallback({ prompt, requestedModel }) {
  const candidates = uniqueModels([requestedModel, ...IMAGE_MODEL_FALLBACKS, DEFAULT_IMAGE_MODEL]);
  let lastError = null;

  for (const model of candidates) {
    try {
      const imageResp = await openai.images.generate({
        model,
        prompt,
        size: "1024x1024"
      });
      return { model, imageResp };
    } catch (error) {
      lastError = error;
      if (!shouldTryAnotherModel(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Не удалось сгенерировать изображение ни одной моделью");
}

bot.start(async (ctx) => {
  try {
    getOrCreateUser(ctx);
    await ctx.reply("Привет! Выбери действие в меню:", getMainMenuKeyboard());
  } catch (error) {
    console.error("Ошибка в /start:", error);
    await ctx.reply("Не удалось запустить бота. Попробуй позже.");
  }
});

bot.command("menu", async (ctx) => {
  try {
    getOrCreateUser(ctx);
    await ctx.reply("Главное меню:", getMainMenuKeyboard());
  } catch (error) {
    console.error("Ошибка в /menu:", error);
    await ctx.reply("Не удалось открыть меню. Попробуй позже.");
  }
});

bot.command("profile", async (ctx) => {
  try {
    const user = getOrCreateUser(ctx);
    await ctx.reply("Открой профиль в Mini App:", getProfileKeyboard(user.telegram_id));
  } catch (error) {
    console.error("Ошибка в /profile:", error);
    await ctx.reply("Не удалось открыть профиль. Попробуй позже.");
  }
});

async function openMainMenu(ctx) {
  try {
    const user = getOrCreateUser(ctx);
    updateUserMode(user.telegram_id, "main_menu");
    await ctx.reply("Главное меню:", getMainMenuKeyboard());
  } catch (error) {
    console.error("Ошибка при переходе в меню:", error);
    await ctx.reply("Не удалось открыть меню. Попробуй позже.");
  }
}

async function enableChatMode(ctx) {
  try {
    const user = getOrCreateUser(ctx);
    ensureActiveChatForUser(user);
    updateUserMode(user.telegram_id, "chat");
    await ctx.reply(
      "Режим чата включен. Напиши сообщение, и я отвечу через GPT.",
      getChatModeKeyboard(user.telegram_id)
    );
  } catch (error) {
    console.error("Ошибка при включении чата:", error);
    await ctx.reply("Не удалось включить режим чата.");
  }
}

async function startNewChat(ctx) {
  try {
    const user = getOrCreateUser(ctx);
    const model = user.selected_text_model || DEFAULT_TEXT_MODEL;
    const chat = createNewChat(user.telegram_id, model, "Новый чат");
    setActiveChat(user.telegram_id, chat.id);
    updateUserMode(user.telegram_id, "chat");
    await ctx.reply(
      `Новый чат создан. Используется модель ${model}.\nНапиши свой запрос.`,
      getChatModeKeyboard(user.telegram_id)
    );
  } catch (error) {
    console.error("Ошибка создания нового чата:", error);
    await ctx.reply("Не удалось создать новый чат.");
  }
}

async function enableImageMode(ctx) {
  try {
    let user = getOrCreateUser(ctx);
    user = resetDailyUsageIfNeeded(user);
    if (!canGenerateImage(user)) {
      await ctx.reply(
        "Лимит генерации изображений на сегодня закончился. Открой профиль, чтобы купить Pro."
      );
      return;
    }

    updateUserMode(user.telegram_id, "image_generation");
    await ctx.reply(
      "Опиши изображение, которое хочешь сгенерировать. Сейчас используется GPT Image."
    );
  } catch (error) {
    console.error("Ошибка при включении генерации:", error);
    await ctx.reply("Не удалось включить режим генерации.");
  }
}

bot.hears(BTN_CHAT, enableChatMode);
bot.hears(BTN_IMAGE, enableImageMode);
bot.hears(BTN_NEW_CHAT, startNewChat);
bot.hears(BTN_MAIN_MENU, openMainMenu);
bot.hears(BTN_PROFILE, async (ctx) => {
  const user = getOrCreateUser(ctx);
  await ctx.reply("Открываю профиль:", getProfileKeyboard(user.telegram_id));
});

bot.on("text", async (ctx) => {
  const messageText = ctx.message?.text?.trim();
  if (!messageText) {
    return;
  }

  if (messageText.startsWith("/")) {
    return;
  }

  let user;
  try {
    user = getOrCreateUser(ctx);
    user = resetDailyUsageIfNeeded(user);
  } catch (error) {
    console.error("Ошибка получения пользователя:", error);
    await ctx.reply("Не удалось обработать сообщение. Попробуй позже.");
    return;
  }

  if (user.mode === "image_generation") {
    if (!canGenerateImage(user)) {
      await ctx.reply(
        "Лимит генерации изображений на сегодня закончился. Открой профиль, чтобы купить Pro."
      );
      updateUserMode(user.telegram_id, "main_menu");
      return;
    }

    const imageModel = user.selected_image_model || DEFAULT_IMAGE_MODEL;
    try {
      const { imageResp } = await generateImageWithFallback({
        prompt: messageText,
        requestedModel: imageModel
      });

      const b64 = imageResp?.data?.[0]?.b64_json;
      if (!b64) {
        throw new Error("Ответ API не содержит b64_json");
      }

      const imageBuffer = Buffer.from(b64, "base64");
      await ctx.replyWithPhoto({ source: imageBuffer });
      incrementImageUsage(user.telegram_id);
      updateUserMode(user.telegram_id, "chat");
      await ctx.reply("Готово! Теперь ты снова в режиме чата.", getChatModeKeyboard(user.telegram_id));
      return;
    } catch (error) {
      console.error("Ошибка генерации изображения:", error);
      await ctx.reply(
        "Не удалось сгенерировать изображение. Возможно, модель недоступна на этом API-аккаунте."
      );
      updateUserMode(user.telegram_id, "chat");
      return;
    }
  }

  if (user.mode === "chat") {
    if (!canUseGpt(user)) {
      await ctx.reply("Лимит GPT-сообщений на сегодня закончился. Открой профиль, чтобы купить Pro.");
      return;
    }

    try {
      const requestedModel = user.selected_text_model || DEFAULT_TEXT_MODEL;
      const effectiveModel = canUseTextModel(user, requestedModel) ? requestedModel : DEFAULT_TEXT_MODEL;
      if (effectiveModel !== requestedModel) {
        setUserTextModel(user.telegram_id, effectiveModel);
      }

      const activeChat = ensureActiveChatForUser(user);
      const previousMessages = getChatMessages(activeChat.id);
      addChatMessage(activeChat.id, "user", messageText);
      if (previousMessages.length === 0 && activeChat.title === "Новый чат") {
        setChatTitle(activeChat.id, messageText.slice(0, 48));
      }

      const typingInterval = setInterval(() => {
        ctx.sendChatAction("typing").catch(() => {});
      }, 4000);
      let waitMessage;
      try {
        waitMessage = await ctx.reply("GPT печатает...");
        await ctx.sendChatAction("typing");
      } catch (_error) {
        // Если не удалось отправить статусное сообщение, продолжаем без него.
      }

      let model;
      let response;
      try {
        const modelInput = buildResponseInput(previousMessages, messageText);
        const result = await generateTextWithFallback({
          messageText: modelInput,
          user: { ...user, selected_text_model: effectiveModel }
        });
        model = result.model;
        response = result.response;
      } finally {
        clearInterval(typingInterval);
        if (waitMessage?.message_id) {
          await ctx.deleteMessage(waitMessage.message_id).catch(() => {});
        }
      }

      if (model !== effectiveModel) {
        setUserTextModel(user.telegram_id, model);
      }

      const text = extractOutputText(response);
      if (!text) {
        throw new Error("Пустой ответ от модели");
      }

      addChatMessage(activeChat.id, "assistant", text);
      await sendResponseWithFullViewButton(ctx, user.telegram_id, activeChat.id, text);
      incrementGptUsage(user.telegram_id);
      return;
    } catch (error) {
      console.error("Ошибка GPT-ответа:", error);
      await ctx.reply(
        "Не удалось получить ответ от модели. Возможно, выбранная модель недоступна для этого API-ключа."
      );
      return;
    }
  }

  const freshUser = getUserByTelegramId(user.telegram_id);
  const limits = getUserLimits(freshUser);
  await ctx.reply(
    `Сначала выбери режим в меню. Твой тариф: ${limits.plan === "owner" ? "Owner" : limits.plan.toUpperCase()}.`,
    getMainMenuKeyboard()
  );
});

bot.catch((error, ctx) => {
  console.error("Глобальная ошибка Telegraf:", error);
  ctx.reply("Произошла ошибка. Попробуй еще раз позже.").catch(() => {});
});
