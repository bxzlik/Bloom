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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
