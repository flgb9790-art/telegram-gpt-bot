import { Markup } from "telegraf";
import { WEBAPP_BASE_URL } from "./config.js";

export function getMainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("💬 Чат GPT", "menu_chat")],
    [Markup.button.callback("🎨 Генерация изображения", "menu_image")],
    [Markup.button.webApp("⚙️ Профиль", `${WEBAPP_BASE_URL}/profile.html`)]
  ]);
}

export function getChatModeKeyboard(telegramId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.webApp(
        "⚙️ Настройки",
        `${WEBAPP_BASE_URL}/settings.html?telegram_id=${encodeURIComponent(String(telegramId))}`
      )
    ],
    [Markup.button.callback("↩️ В меню", "menu_main")]
  ]);
}

export function getProfileKeyboard(telegramId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.webApp(
        "⚙️ Открыть профиль",
        `${WEBAPP_BASE_URL}/profile.html?telegram_id=${encodeURIComponent(String(telegramId))}`
      )
    ]
  ]);
}
