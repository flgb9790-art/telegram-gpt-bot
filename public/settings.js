const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.MainButton.hide();
}

function getTelegramId() {
  const fromInitData = tg?.initDataUnsafe?.user?.id;
  if (fromInitData) {
    return String(fromInitData);
  }

  const params = new URLSearchParams(window.location.search);
  return params.get("telegram_id");
}

function setStatus(message, type = "success") {
  const statusEl = document.getElementById("status");
  statusEl.textContent = message;
  statusEl.className = `status ${type === "error" ? "status-error" : "status-success"}`;
}

let loadedProfile = null;
let loadedChats = [];
let activeChatId = null;

function renderModelSelect(profile) {
  const select = document.getElementById("model-select");
  const hint = document.getElementById("model-hint");
  select.innerHTML = "";

  for (const model of profile.models.text) {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = `${model.label} (${model.id})`;
    const allowed =
      !Array.isArray(profile.limits.allowed_text_models) ||
      profile.limits.allowed_text_models.includes(model.id);
    option.disabled = !allowed;
    if (!allowed) {
      option.textContent += " • только Pro";
    }
    if (profile.selected_text_model === model.id) {
      option.selected = true;
    }
    select.appendChild(option);
  }

  hint.textContent = `Текущий тариф: ${profile.subscription_plan.toUpperCase()}. На Free доступны базовые модели.`;
}

function renderChatSelect(chats, selectedChatId) {
  const chatSelect = document.getElementById("chat-select");
  const chatHint = document.getElementById("chat-hint");
  chatSelect.innerHTML = "";

  for (const chat of chats) {
    const option = document.createElement("option");
    option.value = String(chat.id);
    option.textContent = `${chat.title} (${chat.model})`;
    if (Number(chat.id) === Number(selectedChatId)) {
      option.selected = true;
    }
    chatSelect.appendChild(option);
  }

  chatHint.textContent = chats.length
    ? `Всего чатов: ${chats.length}. Выбери нужный для продолжения диалога.`
    : "Чатов пока нет.";
}

async function saveModel(telegramId, modelId) {
  const resp = await fetch("/api/settings/model", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      telegram_id: telegramId,
      selected_text_model: modelId
    })
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || "Не удалось сохранить модель");
  }
  return data;
}

async function saveActiveChat(telegramId, chatId) {
  const resp = await fetch("/api/chats/select", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      telegram_id: telegramId,
      chat_id: Number(chatId)
    })
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || "Не удалось выбрать чат");
  }
}

async function loadChats(telegramId) {
  const resp = await fetch(`/api/chats?telegram_id=${encodeURIComponent(telegramId)}`);
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || "Не удалось получить список чатов");
  }
  loadedChats = data.chats || [];
  activeChatId = data.active_chat_id;
  renderChatSelect(loadedChats, activeChatId);
}

async function loadData() {
  const telegramId = getTelegramId();
  if (!telegramId) {
    setStatus("Не удалось определить telegram_id", "error");
    return;
  }

  try {
    // TODO: Перед продакшеном добавить полноценную серверную проверку initData от Telegram.
    const resp = await fetch(`/api/profile?telegram_id=${encodeURIComponent(telegramId)}`);
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || "Не удалось получить настройки");
    }
    loadedProfile = data;
    renderModelSelect(data);
    await loadChats(telegramId);
    setStatus("Настройки загружены");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Ошибка загрузки", "error");
  }
}

async function onSaveAndClose() {
  const telegramId = getTelegramId();
  if (!telegramId || !loadedProfile) {
    setStatus("Сначала дождись загрузки настроек", "error");
    return;
  }

  const selectedModel = document.getElementById("model-select").value;
  const selectedChatId = document.getElementById("chat-select").value;
  if (!selectedModel) {
    setStatus("Выбери модель", "error");
    return;
  }

  try {
    await saveModel(telegramId, selectedModel);
    if (selectedChatId) {
      await saveActiveChat(telegramId, selectedChatId);
    }
    setStatus("Настройки сохранены, закрываю Mini App...");
    if (tg?.close) {
      setTimeout(() => tg.close(), 500);
    }
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Ошибка сохранения", "error");
  }
}

async function onCreateNewChat() {
  const telegramId = getTelegramId();
  if (!telegramId) {
    setStatus("Не удалось определить telegram_id", "error");
    return;
  }

  try {
    const resp = await fetch("/api/chats/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: telegramId })
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || "Не удалось создать новый чат");
    }
    await loadChats(telegramId);
    document.getElementById("chat-select").value = String(data.chat.id);
    setStatus("Новый чат создан");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Ошибка создания чата", "error");
  }
}

function onOpenChat() {
  const telegramId = getTelegramId();
  const selectedChatId = document.getElementById("chat-select").value;
  if (!telegramId || !selectedChatId) {
    setStatus("Сначала выбери чат", "error");
    return;
  }

  window.location.href = `/chat.html?telegram_id=${encodeURIComponent(telegramId)}&chat_id=${encodeURIComponent(selectedChatId)}`;
}

document.getElementById("save-close-btn").addEventListener("click", onSaveAndClose);
document.getElementById("refresh-btn").addEventListener("click", loadData);
document.getElementById("new-chat-btn").addEventListener("click", onCreateNewChat);
document.getElementById("open-chat-btn").addEventListener("click", onOpenChat);

loadData();
