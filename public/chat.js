const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

function setStatus(message, type = "success") {
  const statusEl = document.getElementById("status");
  statusEl.textContent = message;
  statusEl.className = `status ${type === "error" ? "status-error" : "status-success"}`;
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function getTelegramId() {
  const fromInitData = tg?.initDataUnsafe?.user?.id;
  if (fromInitData) {
    return String(fromInitData);
  }
  return getQueryParam("telegram_id");
}

function renderMessages(messages) {
  const container = document.getElementById("messages");
  container.innerHTML = "";
  if (!messages.length) {
    container.innerHTML = `<div class="small">Сообщений пока нет.</div>`;
    return;
  }

  for (const message of messages) {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${message.role === "assistant" ? "assistant" : "user"}`;
    bubble.innerHTML = `
      <div class="chat-role">${message.role === "assistant" ? "GPT" : "Вы"}</div>
      <div class="chat-text">${message.content.replace(/\n/g, "<br>")}</div>
    `;
    container.appendChild(bubble);
  }
}

async function loadChat() {
  const telegramId = getTelegramId();
  const chatId = getQueryParam("chat_id");
  if (!telegramId || !chatId) {
    setStatus("Не хватает telegram_id или chat_id", "error");
    return;
  }

  try {
    const resp = await fetch(
      `/api/chats/${encodeURIComponent(chatId)}/messages?telegram_id=${encodeURIComponent(telegramId)}`
    );
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || "Не удалось загрузить чат");
    }

    document.getElementById("chat-meta").textContent = `${data.chat.title} • модель ${data.chat.model}`;
    renderMessages(data.messages || []);
    setStatus("История загружена");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Ошибка загрузки истории", "error");
  }
}

document.getElementById("back-btn").addEventListener("click", () => {
  const telegramId = getTelegramId();
  window.location.href = `/settings.html?telegram_id=${encodeURIComponent(telegramId || "")}`;
});

document.getElementById("close-btn").addEventListener("click", () => {
  if (tg?.close) {
    tg.close();
    return;
  }
  window.close();
});

loadChat();
