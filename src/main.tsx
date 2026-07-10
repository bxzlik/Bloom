import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import '@shared/styles/globals.css'
import '@shared/styles/index.css'
import '@shared/styles/overrides-main.css'
import '@shared/styles/transparency.css'
import '@shared/styles/telemetry.css'
import '@shared/styles/eq.css'

// Отключаем браузерное контекстное меню (кастомные меню рисуем сами через oncontextmenu).
window.addEventListener('contextmenu', (e) => e.preventDefault())

// Браузерные accelerator-клавиши WebView2 отключены нативно (см. lib.rs). Возвращаем
// перезагрузку по F5 / Ctrl+R и DevTools по F12 / Ctrl+Shift+I вручную.
window.addEventListener('keydown', (e) => {
  if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R'))) {
    e.preventDefault()
    window.location.reload()
  } else if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i'))) {
    e.preventDefault()
    import('@tauri-apps/api/core').then(({ invoke }) => invoke('open_devtools')).catch(() => {})
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Гасим стартовый сплэш (#splash из index.html) после первого кадра React —
// requestAnimationFrame даёт дереву отрисоваться под сплэшем, затем плавный
// fade-out (CSS transition) и удаление из DOM по его завершении.
requestAnimationFrame(() => {
  const splash = document.getElementById('splash')
  if (!splash) return
  splash.classList.add('hide')
  splash.addEventListener('transitionend', () => splash.remove(), { once: true })
})
