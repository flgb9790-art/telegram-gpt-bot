import { Telegraf } from "telegraf";
import { TELEGRAM_BOT_TOKEN } from "./config.js";
import {
  getOrCreateUser,
  updateUserMode,
  incrementGptUsage,
  incrementImageUsage,
  getUserByTelegramId,
  resetDailyUsageIfNeeded,
  setUserTextModel
} from "./db.js";
import { canGenerateImage, canUseGpt, canUseTextModel, getUserLimits } from "./limits.js";
import { openai } from "./openai.js";
import { getChatModeKeyboard, getMainMenuKeyboard, getProfileKeyboard } from "./menus.js";

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

bot.action("menu_main", async (ctx) => {
  try {
    const user = getOrCreateUser(ctx);
    updateUserMode(user.telegram_id, "main_menu");
    await ctx.answerCbQuery();
    await ctx.reply("Главное меню:", getMainMenuKeyboard());
  } catch (error) {
    console.error("Ошибка при переходе в меню:", error);
    await ctx.answerCbQuery("Ошибка");
  }
});

bot.action("menu_chat", async (ctx) => {
  try {
    const user = getOrCreateUser(ctx);
    updateUserMode(user.telegram_id, "chat");
    await ctx.answerCbQuery();
    await ctx.reply(
      "Режим чата включен. Напиши сообщение, и я отвечу через GPT.",
      getChatModeKeyboard(user.telegram_id)
    );
  } catch (error) {
    console.error("Ошибка при включении чата:", error);
    await ctx.answerCbQuery("Не удалось включить режим чата");
  }
});

bot.action("menu_image", async (ctx) => {
  try {
    let user = getOrCreateUser(ctx);
    user = resetDailyUsageIfNeeded(user);
    if (!canGenerateImage(user)) {
      await ctx.answerCbQuery();
      await ctx.reply(
        "Лимит генерации изображений на сегодня закончился. Открой профиль, чтобы купить Pro."
      );
      return;
    }

    updateUserMode(user.telegram_id, "image_generation");
    await ctx.answerCbQuery();
    await ctx.reply(
      "Опиши изображение, которое хочешь сгенерировать. Сейчас используется GPT Image 2."
    );
  } catch (error) {
    console.error("Ошибка при включении генерации:", error);
    await ctx.answerCbQuery("Не удалось включить режим генерации");
  }
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

    const imageModel = user.selected_image_model || "gpt-image-2";
    try {
      const imageResp = await openai.images.generate({
        model: imageModel,
        prompt: messageText,
        size: "1024x1024"
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
      const requestedModel = user.selected_text_model || "gpt-5-mini";
      const effectiveModel = canUseTextModel(user, requestedModel) ? requestedModel : "gpt-5-nano";
      if (effectiveModel !== requestedModel) {
        setUserTextModel(user.telegram_id, effectiveModel);
      }

      const response = await openai.responses.create({
        model: effectiveModel,
        input: messageText,
        instructions:
          "Ты полезный Telegram GPT-бот. Отвечай понятно, структурированно и без лишней воды."
      });

      const text = extractOutputText(response);
      if (!text) {
        throw new Error("Пустой ответ от модели");
      }

      await ctx.reply(text);
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
