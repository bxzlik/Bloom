<div align="center">

<img src="public/logo.png" width="96" height="96" alt="Bloom" />

# Bloom

**Music from every source in one player.**

A desktop player: local library, Yandex Music, and SoundCloud
in a single window

[**🌐 Website**](https://bloom-site-x.vercel.app/) · [**📦 Releases**](https://github.com/bxzlik/Bloom/releases)

**English** · [Русский](README.ru.md)

</div>

## 🚀 Development

```bash
npm install

# https://discord.com/developers/applications
cp src-tauri/.env.example src-tauri/.env   # set your DISCORD_CLIENT_ID

npm run tauri:dev     # desktop app
npm run dev           # frontend

npm run tauri:build   # build the installer
npm run build         # build the frontend
```

Requires [Rust](https://www.rust-lang.org/tools/install) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

## 📄 License

[MIT](LICENSE)
