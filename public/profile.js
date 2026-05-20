const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

function getTelegramId() {
  const fromInitData = tg?.initDataUnsafe?.user?.id;
  if (fromInitData) {
    return String(fromInitData);
  }

  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("telegram_id");
  if (fromQuery) {
    return String(fromQuery);
  }

  return null;
}

function setStatus(message, type = "success") {
  const statusEl = document.getElementById("status");
  statusEl.textContent = message;
  statusEl.className = `status ${type === "error" ? "status-error" : "status-success"}`;
}

function renderProfile(data) {
  const grid = document.getElementById("profile-grid");
  const badgeContainer = document.getElementById("plan-badge");
  const upgradeBtn = document.getElementById("upgrade-btn");

  const isOwner = data.subscription_plan === "owner";
  const isPro = data.subscription_plan === "pro";
  const planLabel = isOwner ? "Owner" : isPro ? "Pro" : "Free";
  const badgeClass = isOwner ? "badge-owner" : isPro ? "badge-pro" : "badge-free";

  badgeContainer.innerHTML = `<span class="badge ${badgeClass}">${planLabel}</span>`;

  const gptLimit =
    data.limits.gpt_messages_per_day === null ||
    data.limits.gpt_messages_per_day === undefined ||
    !Number.isFinite(data.limits.gpt_messages_per_day)
      ? "Без лимита"
      : data.limits.gpt_messages_per_day;
  const imageLimit =
    data.limits.images_per_day === null ||
    data.limits.images_per_day === undefined ||
    !Number.isFinite(data.limits.images_per_day)
      ? "Без лимита"
      : data.limits.images_per_day;

  grid.innerHTML = `
    <div class="item"><span class="label">Username</span><span class="value">${data.username || "-"}</span></div>
    <div class="item"><span class="label">Telegram ID</span><span class="value">${data.telegram_id}</span></div>
    <div class="item"><span class="label">Выбранная GPT-модель</span><span class="value">${data.selected_text_model}</span></div>
    <div class="item"><span class="label">GPT сообщений сегодня</span><span class="value">${data.usage.gpt_messages_today}</span></div>
    <div class="item"><span class="label">Изображений сегодня</span><span class="value">${data.usage.images_today}</span></div>
    <div class="item"><span class="label">Лимиты тарифа</span><span class="value">GPT: ${gptLimit} / Image: ${imageLimit}</span></div>
  `;

  upgradeBtn.style.display = isOwner ? "none" : "inline-block";
}

async function loadProfile() {
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
      throw new Error(data.error || "Ошибка загрузки профиля");
    }
    renderProfile(data);
    setStatus("Профиль загружен");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Не удалось загрузить профиль", "error");
  }
}

async function demoUpgrade() {
  const telegramId = getTelegramId();
  if (!telegramId) {
    setStatus("Не удалось определить telegram_id", "error");
    return;
  }

  try {
    const resp = await fetch("/api/subscription/demo-upgrade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: telegramId })
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || "Не удалось обновить подписку");
    }
    setStatus(data.message || "Оплата пока в тестовом режиме");
    await loadProfile();
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Ошибка обновления подписки", "error");
  }
}

document.getElementById("refresh-btn").addEventListener("click", loadProfile);
document.getElementById("upgrade-btn").addEventListener("click", demoUpgrade);

loadProfile();
