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

function renderModelSelect(profile) {
  const select = document.getElementById("model-select");
  const hint = document.getElementById("model-hint");
  select.innerHTML = "";

  for (const model of profile.models.text) {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = `${model.label} (${model.id})`;
    const allowed = profile.limits.allowed_text_models.includes(model.id);
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

async function saveModel(telegramId, modelId) {
  try {
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
    setStatus("Модель сохранена, закрываю Mini App...");
    if (tg?.close) {
      setTimeout(() => tg.close(), 500);
    }
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Ошибка сохранения", "error");
  }
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
  if (!selectedModel) {
    setStatus("Выбери модель", "error");
    return;
  }

  await saveModel(telegramId, selectedModel);
}

document.getElementById("save-close-btn").addEventListener("click", onSaveAndClose);
document.getElementById("refresh-btn").addEventListener("click", loadData);

loadData();
