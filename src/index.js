import { PORT } from "./config.js";
import { bot } from "./bot.js";
import { createServer } from "./server.js";

const app = createServer();

app.listen(PORT, () => {
  console.log(`HTTP сервер запущен на порту ${PORT}`);
});

async function startBot() {
  try {
    // Сбрасываем webhook, чтобы не было конфликта с long polling.
    await bot.telegram.deleteWebhook({ drop_pending_updates: false });
  } catch (error) {
    console.error("Не удалось удалить webhook перед запуском polling:", error);
  }

  try {
    await bot.launch();
    console.log("Telegram бот запущен в режиме long polling");
  } catch (error) {
    console.error("Ошибка запуска бота:", error);
  }
}

startBot();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
