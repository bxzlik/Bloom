<div align="center">

<img src="public/logo.png" width="96" height="96" alt="Bloom" />

# Bloom

**Музыка из всех источников в одном плеере.**

Десктопный плеер: локальная медиатека, Yandex Music, SoundCloud и YouTube Music в одном приложении

[**🌐 Сайт**](https://bloom-site-x.vercel.app/) · [**📦 Релизы**](https://github.com/bxzlik/Bloom/releases)

[English](README.md) · **Русский**

</div>

## 💿 Стабильные площадки

| Площадка | Примечания |
| --- | --- |
| 🟠 **SoundCloud** | Нативное воспроизведение |
| 🟡 **Yandex Music** | Нативное воспроизведение |
| 🔴 **YouTube Music** | Нативное воспроизведение |

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
