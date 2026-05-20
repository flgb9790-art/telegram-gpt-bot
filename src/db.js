import Database from "better-sqlite3";
import { OWNER_TELEGRAM_ID } from "./config.js";
import { DEFAULT_IMAGE_TOKENS_BALANCE, IMAGE_GENERATION_COST_TOKENS } from "./limits.js";

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
    image_tokens_balance INTEGER DEFAULT 10,
    usage_date TEXT,
    created_at TEXT,
    updated_at TEXT
  )
`);

const userColumns = db.prepare("PRAGMA table_info(users)").all();
if (!userColumns.some((column) => column.name === "active_chat_id")) {
  db.exec("ALTER TABLE users ADD COLUMN active_chat_id INTEGER");
}
if (!userColumns.some((column) => column.name === "image_tokens_balance")) {
  db.exec("ALTER TABLE users ADD COLUMN image_tokens_balance INTEGER DEFAULT 10");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT NOT NULL,
    title TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
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

const decrementImageTokensStmt = db.prepare(`
  UPDATE users
  SET image_tokens_balance = MAX(0, image_tokens_balance - ?), updated_at = ?
  WHERE telegram_id = ?
`);

const setImageTokensStmt = db.prepare(`
  UPDATE users
  SET image_tokens_balance = ?, updated_at = ?
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

const updateActiveChatStmt = db.prepare(`
  UPDATE users
  SET active_chat_id = ?, updated_at = ?
  WHERE telegram_id = ?
`);

const createChatStmt = db.prepare(`
  INSERT INTO chats (telegram_id, title, model, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
`);

const selectChatByIdStmt = db.prepare(`
  SELECT *
  FROM chats
  WHERE id = ?
`);

const selectUserChatsStmt = db.prepare(`
  SELECT *
  FROM chats
  WHERE telegram_id = ?
  ORDER BY updated_at DESC
`);

const updateChatUpdatedAtStmt = db.prepare(`
  UPDATE chats
  SET updated_at = ?
  WHERE id = ?
`);

const setChatTitleStmt = db.prepare(`
  UPDATE chats
  SET title = ?, updated_at = ?
  WHERE id = ?
`);

const createMessageStmt = db.prepare(`
  INSERT INTO messages (chat_id, role, content, created_at)
  VALUES (?, ?, ?, ?)
`);

const selectChatMessagesStmt = db.prepare(`
  SELECT id, chat_id, role, content, created_at
  FROM messages
  WHERE chat_id = ?
  ORDER BY id ASC
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

  if (!user.active_chat_id) {
    const chat = createNewChat(id, user.selected_text_model || "gpt-4.1-mini");
    updateActiveChatStmt.run(chat.id, nowIso(), id);
    user = getUserByTelegramId(id);
  }

  if (user.image_tokens_balance === null || user.image_tokens_balance === undefined) {
    setImageTokensStmt.run(DEFAULT_IMAGE_TOKENS_BALANCE, nowIso(), id);
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

export function chargeImageGeneration(telegramId, cost = IMAGE_GENERATION_COST_TOKENS) {
  decrementImageTokensStmt.run(Number(cost), nowIso(), String(telegramId));
  return getUserByTelegramId(telegramId);
}

export function addImageTokens(telegramId, amount) {
  const user = getUserByTelegramId(telegramId);
  const nextValue = Math.max(0, Number(user?.image_tokens_balance || 0) + Number(amount || 0));
  setImageTokensStmt.run(nextValue, nowIso(), String(telegramId));
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

export function createNewChat(telegramId, model, title = "Новый чат") {
  const now = nowIso();
  const result = createChatStmt.run(String(telegramId), title, model, now, now);
  return selectChatByIdStmt.get(result.lastInsertRowid);
}

export function getChatById(chatId) {
  return selectChatByIdStmt.get(Number(chatId));
}

export function getUserChats(telegramId) {
  return selectUserChatsStmt.all(String(telegramId));
}

export function setActiveChat(telegramId, chatId) {
  updateActiveChatStmt.run(Number(chatId), nowIso(), String(telegramId));
  return getUserByTelegramId(telegramId);
}

export function ensureActiveChatForUser(user) {
  if (user?.active_chat_id) {
    const existing = getChatById(user.active_chat_id);
    if (existing && String(existing.telegram_id) === String(user.telegram_id)) {
      return existing;
    }
  }

  const chat = createNewChat(user.telegram_id, user.selected_text_model || "gpt-4.1-mini");
  setActiveChat(user.telegram_id, chat.id);
  return chat;
}

export function addChatMessage(chatId, role, content) {
  const now = nowIso();
  createMessageStmt.run(Number(chatId), role, String(content), now);
  updateChatUpdatedAtStmt.run(now, Number(chatId));
}

export function getChatMessages(chatId) {
  return selectChatMessagesStmt.all(Number(chatId));
}

export function setChatTitle(chatId, title) {
  setChatTitleStmt.run(String(title), nowIso(), Number(chatId));
  return getChatById(chatId);
}

export function getCurrentUsageDate() {
  return currentUsageDate();
}

export { db };
