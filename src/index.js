import { PORT } from "./config.js";
import { bot } from "./bot.js";
import { createServer } from "./server.js";

const app = createServer();

app.listen(PORT, () => {
  console.log(`HTTP сервер запущен на порту ${PORT}`);
});

bot
  .launch()
  .then(() => {
    console.log("Telegram бот запущен в режиме long polling");
  })
  .catch((error) => {
    console.error("Ошибка запуска бота:", error);
  });

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
