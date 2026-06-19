<div align="center">

<img src="public/logo.png" width="96" height="96" alt="Bloom" />

# Bloom

**Музыка из всех источников в одном плеере.**

Десктоп-плеер: Локальная библиотека, Yandex Music и SoundCloud
в одном окне

[**🌐 Сайт**](https://bloom-site-x.vercel.app/) · [**📦 Релизы**](https://github.com/bxzlik/Bloom/releases)

[English](README.md) · **Русский**

</div>

## 🚀 Разработка

```bash
npm install

# https://discord.com/developers/applications
cp src-tauri/.env.example src-tauri/.env   # вписать свой DISCORD_CLIENT_ID

npm run tauri:dev     # десктоп-приложение
npm run dev           # фронтенд

npm run tauri:build   # сборка инсталлятора
npm run build         # сборка фронтенда
```

Требуется [Rust](https://www.rust-lang.org/tools/install) и [пререквизиты Tauri](https://v2.tauri.app/start/prerequisites/).

## 📄 License

[MIT](LICENSE)
