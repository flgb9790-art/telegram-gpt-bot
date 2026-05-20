import dotenv from "dotenv";

dotenv.config();

const requiredEnv = [
  "TELEGRAM_BOT_TOKEN",
  "OPENAI_API_KEY",
  "OWNER_TELEGRAM_ID",
  "WEBAPP_BASE_URL"
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Отсутствует обязательная переменная окружения: ${key}`);
  }
}

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const OWNER_TELEGRAM_ID = String(process.env.OWNER_TELEGRAM_ID);
const rawWebappBaseUrl = process.env.WEBAPP_BASE_URL.trim();
const normalizedWebappBaseUrl = /^https?:\/\//i.test(rawWebappBaseUrl)
  ? rawWebappBaseUrl
  : `https://${rawWebappBaseUrl}`;
export const WEBAPP_BASE_URL = normalizedWebappBaseUrl.replace(/\/$/, "");
export const PORT = Number(process.env.PORT || 3000);
export const PRO_PRICE_STARS = Number(process.env.PRO_PRICE_STARS || 0);
export const PRO_TEST_IMAGE_TOKENS_BONUS = Number(process.env.PRO_TEST_IMAGE_TOKENS_BONUS || 100);
