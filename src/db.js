import Database from "better-sqlite3";
import { OWNER_TELEGRAM_ID } from "./config.js";

const db = new Database("bot.db");

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id TEXT PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    selected_text_model TEXT DEFAULT 'gpt-4.1-mini',
    selected_image_model TEXT DEFAULT 'gpt-image-1',
    mode TEXT DEFAULT 'main_menu',
    subscription_plan TEXT DEFAULT 'free',
    gpt_messages_today INTEGER DEFAULT 0,
    images_today INTEGER DEFAULT 0,
    usage_date TEXT,
    created_at TEXT,
    updated_at TEXT
  )
`);

const selectUserStmt = db.prepare(`
  SELECT *
  FROM users
  WHERE telegram_id = ?
`);

const insertUserStmt = db.prepare(`
  INSERT INTO users (
    telegram_id,
    username,
    first_name,
    selected_text_model,
    selected_image_model,
    mode,
    subscription_plan,
    gpt_messages_today,
    images_today,
    usage_date,
    created_at,
    updated_at
  ) VALUES (?, ?, ?, 'gpt-4.1-mini', 'gpt-image-1', 'main_menu', 'free', 0, 0, ?, ?, ?)
`);

const updateIdentityStmt = db.prepare(`
  UPDATE users
  SET username = ?, first_name = ?, updated_at = ?
  WHERE telegram_id = ?
`);

const updateModeStmt = db.prepare(`
  UPDATE users
  SET mode = ?, updated_at = ?
  WHERE telegram_id = ?
`);

const updateTextModelStmt = db.prepare(`
  UPDATE users
  SET selected_text_model = ?, updated_at = ?
  WHERE telegram_id = ?
`);

const updateImageModelStmt = db.prepare(`
  UPDATE users
  SET selected_image_model = ?, updated_at = ?
  WHERE telegram_id = ?
`);

const incrementGptStmt = db.prepare(`
  UPDATE users
  SET gpt_messages_today = gpt_messages_today + 1, updated_at = ?
  WHERE telegram_id = ?
`);

const incrementImageStmt = db.prepare(`
  UPDATE users
  SET images_today = images_today + 1, updated_at = ?
  WHERE telegram_id = ?
`);

const resetUsageStmt = db.prepare(`
  UPDATE users
  SET gpt_messages_today = 0, images_today = 0, usage_date = ?, updated_at = ?
  WHERE telegram_id = ?
`);

const updatePlanStmt = db.prepare(`
  UPDATE users
  SET subscription_plan = ?, updated_at = ?
  WHERE telegram_id = ?
`);

function nowIso() {
  return new Date().toISOString();
}

function currentUsageDate() {
  return new Date().toISOString().slice(0, 10);
}

export function isOwner(telegramId) {
  return String(telegramId) === OWNER_TELEGRAM_ID;
}

export function getUserByTelegramId(telegramId) {
  return selectUserStmt.get(String(telegramId));
}

export function getOrCreateUserFromData({ telegramId, username = null, firstName = null }) {
  const id = String(telegramId);
  let user = getUserByTelegramId(id);
  const now = nowIso();
  const usageDate = currentUsageDate();

  if (!user) {
    insertUserStmt.run(id, username, firstName, usageDate, now, now);
    user = getUserByTelegramId(id);
  } else if (user.username !== username || user.first_name !== firstName) {
    updateIdentityStmt.run(username, firstName, now, id);
    user = getUserByTelegramId(id);
  }

  return resetDailyUsageIfNeeded(user);
}

export function getOrCreateUser(ctx) {
  if (!ctx?.from?.id) {
    throw new Error("Невозможно определить Telegram ID пользователя");
  }

  return getOrCreateUserFromData({
    telegramId: ctx.from.id,
    username: ctx.from.username || null,
    firstName: ctx.from.first_name || null
  });
}

export function updateUserMode(telegramId, mode) {
  updateModeStmt.run(mode, nowIso(), String(telegramId));
  return getUserByTelegramId(telegramId);
}

export function setUserTextModel(telegramId, model) {
  updateTextModelStmt.run(model, nowIso(), String(telegramId));
  return getUserByTelegramId(telegramId);
}

export function setUserImageModel(telegramId, model) {
  updateImageModelStmt.run(model, nowIso(), String(telegramId));
  return getUserByTelegramId(telegramId);
}

export function incrementGptUsage(telegramId) {
  incrementGptStmt.run(nowIso(), String(telegramId));
  return getUserByTelegramId(telegramId);
}

export function incrementImageUsage(telegramId) {
  incrementImageStmt.run(nowIso(), String(telegramId));
  return getUserByTelegramId(telegramId);
}

export function resetDailyUsageIfNeeded(user) {
  if (!user) {
    return null;
  }

  const today = currentUsageDate();
  if (user.usage_date !== today) {
    resetUsageStmt.run(today, nowIso(), String(user.telegram_id));
    return getUserByTelegramId(user.telegram_id);
  }

  return user;
}

export function setSubscriptionPlan(telegramId, plan) {
  updatePlanStmt.run(plan, nowIso(), String(telegramId));
  return getUserByTelegramId(telegramId);
}

export function getCurrentUsageDate() {
  return currentUsageDate();
}

export { db };
