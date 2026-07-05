import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import Icons from 'unplugin-icons/vite'
import path from 'node:path'
import { readFileSync } from 'node:fs'

const host = process.env.TAURI_DEV_HOST
const pkgVersion = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')).version

export default defineConfig(async () => ({
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
  },
  plugins: [react(), tailwind(), Icons({ compiler: 'jsx', jsx: 'react' })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@app': path.resolve(__dirname, 'src/app'),
      '@features': path.resolve(__dirname, 'src/features'),
      '@entities': path.resolve(__dirname, 'src/entities'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: 'ws', host, port: 1421 }
      : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    target: ['es2022', 'chrome120'],
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        miniplayer: path.resolve(__dirname, 'picture-in-picture.html'),
        'tray-popup': path.resolve(__dirname, 'tray-popup.html'),
        overlay: path.resolve(__dirname, 'overlay.html'),
      },
    },
  },
}))
