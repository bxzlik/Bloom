import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import path from 'node:path'

const host = process.env.TAURI_DEV_HOST

export default defineConfig(async () => ({
  plugins: [react(), tailwind()],
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
        miniplayer: path.resolve(__dirname, 'miniplayer.html'),
        'tray-popup': path.resolve(__dirname, 'tray-popup.html'),
      },
    },
  },
}))
