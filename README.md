# Telegram GPT Bot (Node.js)

Полноценный Telegram-бот на Node.js с:
- GPT-чатом через OpenAI Responses API
- генерацией изображений через OpenAI Image API
- профилем и настройками в Telegram Mini App
- лимитами Free/Pro и архитектурой подписки
- SQLite базой (`better-sqlite3`)

## Что внутри

- Telegram-бот: `Telegraf`
- API + статика Mini App: `Express`
- AI: `OpenAI SDK`
- База: `SQLite` (`bot.db`)
- Конфиг: `dotenv`

Структура:

```text
telegram-gpt-bot/
├─ src/
│  ├─ index.js
│  ├─ bot.js
│  ├─ db.js
│  ├─ openai.js
│  ├─ menus.js
│  ├─ limits.js
│  ├─ server.js
│  └─ config.js
├─ public/
│  ├─ profile.html
│  ├─ settings.html
│  ├─ app.css
│  ├─ profile.js
│  └─ settings.js
├─ .env.example
├─ .gitignore
├─ package.json
└─ README.md
```

## 1) Создать бота через BotFather

1. Открой Telegram и найди [@BotFather](https://t.me/BotFather).
2. Выполни команду `/newbot`.
3. Укажи имя и username бота.
4. BotFather выдаст токен вида `123456:ABC...` — это `TELEGRAM_BOT_TOKEN`.

## 2) Получить OpenAI API key

1. Открой [OpenAI Platform](https://platform.openai.com/).
2. Создай API key.
3. Сохрани его как `OPENAI_API_KEY`.

## 3) Настроить `.env`

Скопируй `.env.example` в `.env` и заполни:

```env
TELEGRAM_BOT_TOKEN=
OPENAI_API_KEY=
OWNER_TELEGRAM_ID=
WEBAPP_BASE_URL=https://your-app.up.railway.app
PORT=3000
```

Где:
- `OWNER_TELEGRAM_ID` — твой Telegram ID (Owner получает полный доступ без лимитов).
- `WEBAPP_BASE_URL` — публичный URL приложения (для кнопок Mini App).

## 4) Локальный запуск

```bash
npm install
npm run dev
```

Что запустится:
- Express сервер на `PORT`
- Telegram бот в режиме long polling

## 5) Как открыть Mini App в Telegram

- Запусти бота командой `/start`.
- В главном меню нажми `⚙️ Профиль` (WebApp-кнопка).
- В режиме чата используй кнопку `⚙️ Настройки`.

## 6) Логика тарифов

- **Free**
  - модели чата: только `gpt-5-nano`
  - 10 GPT-сообщений/день
  - 3 изображения/день
- **Pro**
  - доступ ко всем моделям
  - 300 GPT-сообщений/день
  - 100 изображений/день
- **Owner** (`OWNER_TELEGRAM_ID`)
  - без лимитов
  - доступ ко всем моделям
  - в профиле отображается `Owner`

## 7) Demo-подписка (временная)

В Mini App профиля есть кнопка `Купить Pro`.
Сейчас она вызывает demo endpoint:

- `POST /api/subscription/demo-upgrade`

Он переключает пользователя на `pro` и возвращает сообщение:
`Оплата пока в тестовом режиме`.

### Где подключать реальную оплату

В коде оставлены TODO:
- `src/server.js` — интеграция Telegram Payments / Telegram Stars
- `public/profile.js`, `public/settings.js` — полная проверка Telegram `initData`

## 8) Деплой на Railway

1. Создай проект на [Railway](https://railway.app/).
2. Подключи репозиторий с проектом.
3. Добавь переменные окружения из `.env`.
4. Укажи:
   - Start command: `npm start`
5. После деплоя получи публичный URL Railway и поставь его в `WEBAPP_BASE_URL`.
6. Перезапусти сервис.

Важно:
- Сервер слушает `process.env.PORT` (готово для Railway).
- Бот использует long polling, это подходит для быстрого старта.

## 9) Безопасность

- Никогда не храни ключи в коде.
- Не коммить `.env`.
- `bot.db` исключен из git.

## 10) Полезные команды

```bash
npm run dev
npm start
npm run check
```
