import { useEffect } from 'react'

interface BloomSettings {
  accent?: string
  accent2?: string
  font?: string
  radius?: string
  blockR?: number
  blockG?: number
  blockB?: number
}

const applySettings = (s: BloomSettings) => {
  const r = document.documentElement.style
  if (s.accent) {
    const hex = s.accent.replace(/\s/g, '')
    r.setProperty('--color-accent', hex)
    const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
    if (m) {
      const R = parseInt(m[1], 16)
      const G = parseInt(m[2], 16)
      const B = parseInt(m[3], 16)
      r.setProperty('--accent-rgb', `${R},${G},${B}`)
      const lum = 0.2126 * (R / 255) + 0.7152 * (G / 255) + 0.0722 * (B / 255)
      r.setProperty('--color-accent-text', lum > 0.4 ? '#000' : '#fff')
    }
  }
  if (s.accent2) r.setProperty('--color-accent-2', s.accent2)
  if (s.font) r.setProperty('--font-sans', s.font)
  if (s.radius) r.setProperty('--radius-bloom', s.radius)
  if (
    typeof s.blockR === 'number' &&
    typeof s.blockG === 'number' &&
    typeof s.blockB === 'number'
  ) {
    r.setProperty('--color-bg', `rgb(${s.blockR},${s.blockG},${s.blockB})`)
    const lighten = (c: number) => Math.min(255, Math.round(c + (255 - c) * 0.06))
    r.setProperty(
      '--color-bg2',
      `rgb(${lighten(s.blockR)},${lighten(s.blockG)},${lighten(s.blockB)})`,
    )
  }
}

const readSettings = (): BloomSettings => {
  try {
    return JSON.parse(localStorage.getItem('bloom_settings') || '{}') as BloomSettings
  } catch {
    return {}
  }
}

/**
 * Читает `localStorage['bloom_settings']` и применяет CSS-переменные.
 * Также слушает событие `storage` — main окно может обновить настройки,
 * и они приедут к нам в реальном времени (одна и та же origin).
 */
export const useThemeSettings = () => {
  useEffect(() => {
    applySettings(readSettings())
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'bloom_settings') return
      try {
        applySettings(JSON.parse(e.newValue || '{}') as BloomSettings)
      } catch {
        // ignore
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
}
