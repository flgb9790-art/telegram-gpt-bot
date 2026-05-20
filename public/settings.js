const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const MODELS = [
  { id: "gpt-5.2", label: "GPT-5.2" },
  { id: "gpt-5-mini", label: "GPT-5 mini" },
  { id: "gpt-5-nano", label: "GPT-5 nano" },
  { id: "gpt-4.1", label: "GPT-4.1" }
];

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

function renderModels(currentModel, allowedModels, telegramId) {
  const list = document.getElementById("model-list");
  const current = document.getElementById("current-model");
  current.textContent = `Текущая модель: ${currentModel}`;

  list.innerHTML = "";
  for (const model of MODELS) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `model-card ${model.id === currentModel ? "active" : ""}`;
    card.innerHTML = `
      <div class="value">${model.label}</div>
      <div class="small">${model.id}</div>
    `;

    const allowed = allowedModels.includes(model.id);
    if (!allowed) {
      card.querySelector(".small").textContent = `${model.id} • только по подписке`;
    }

    card.addEventListener("click", async () => {
      if (!allowed) {
        setStatus("Эта модель доступна только по подписке", "error");
        return;
      }
      await saveModel(telegramId, model.id);
    });

    list.appendChild(card);
  }
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
    setStatus("Модель сохранена");
    await loadData();
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
    renderModels(data.selected_text_model, data.limits.allowed_text_models, telegramId);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Ошибка загрузки", "error");
  }
}

loadData();
