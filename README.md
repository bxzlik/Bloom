<div align="center">

<img src="public/logo.png" width="96" height="96" alt="Bloom" />

# Bloom

**Музыка из всех источников в одном плеере.**

Спокойный десктоп-плеер: локальная библиотека, Yandex Music и SoundCloud
в одном окне — с текстами песен, скробблингом и Discord Rich Presence.

[**📦 Релизы**](https://github.com/bxzlik/Bloom/releases)

</div>

---

## ✨ Возможности

- 🎵 **Несколько источников** — локальная библиотека, **Yandex Music** и **SoundCloud** в едином интерфейсе
- 🌊 **Моя волна** — бесконечный поток рекомендаций под настроение
- 📖 **Тексты песен** — синхронизированные lyrics с подсветкой текущей строки
- 📝 **Last.fm** — скробблинг прослушанного
- 🎮 **Discord Rich Presence** — показывает, что ты слушаешь, прямо в профиле Discord
- 🪟 **Системная интеграция** — трей с мини-плеером, медиа-контролы Windows (SMTC), миниатюра на панели задач
- ⚡ **Глобальный хоткей** `Win+Shift+X` — показать / скрыть окно из любого места
- 🎨 **Кастомизация** — темы и оформление под себя
- 🕹️ **Мини-игры** — кликер и тамагочи, пока играет музыка
- 🔍 **Поиск, плейлисты, профиль** — единый поиск по источникам и статистика прослушиваний
- 🚀 **Автозапуск** вместе с системой

## 🛠️ Стек

Tauri 2 · React 19 · TypeScript · Vite · Tailwind CSS v4 · Zustand · Rust

## 🚀 Разработка

```bash
npm install

# Discord Rich Presence: создай приложение на https://discord.com/developers/applications
cp src-tauri/.env.example src-tauri/.env   # и впиши свой DISCORD_CLIENT_ID

npm run tauri:dev     # десктоп-приложение (Tauri)
npm run dev           # фронтенд (Vite)

npm run tauri:build   # сборка инсталлятора
npm run build         # сборка фронтенда
```

Требуется [Rust](https://www.rust-lang.org/tools/install) и [пререквизиты Tauri](https://v2.tauri.app/start/prerequisites/).

## 📄 License

[MIT](LICENSE)

---

<div align="center">
<sub>Сделано с ❤️ — вся музыка под рукой.</sub>
</div>
