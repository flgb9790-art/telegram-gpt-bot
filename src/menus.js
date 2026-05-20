import { Markup } from "telegraf";
import { WEBAPP_BASE_URL } from "./config.js";

export const BTN_CHAT = "💬 Чат GPT";
export const BTN_IMAGE = "🎨 Генерация изображения";
export const BTN_PROFILE = "⚙️ Профиль";
export const BTN_SETTINGS = "⚙️ Настройки";
export const BTN_MAIN_MENU = "🏠 Главное меню";

export function getMainMenuKeyboard() {
  return Markup.keyboard(
    [
      [Markup.button.text(BTN_CHAT), Markup.button.text(BTN_IMAGE)],
      [Markup.button.webApp(BTN_PROFILE, `${WEBAPP_BASE_URL}/profile.html`)]
    ],
    { columns: 2 }
  )
    .resize()
    .persistent();
}

export function getChatModeKeyboard(telegramId) {
  return Markup.keyboard([
    [
      Markup.button.webApp(
        BTN_SETTINGS,
        `${WEBAPP_BASE_URL}/settings.html?telegram_id=${encodeURIComponent(String(telegramId))}`
      )
    ],
    [Markup.button.text(BTN_MAIN_MENU)]
  ])
    .resize()
    .persistent();
}

export function getProfileKeyboard(telegramId) {
  return Markup.keyboard([
    [
      Markup.button.webApp(
        BTN_PROFILE,
        `${WEBAPP_BASE_URL}/profile.html?telegram_id=${encodeURIComponent(String(telegramId))}`
      )
    ]
  ])
    .resize()
    .persistent();
}
