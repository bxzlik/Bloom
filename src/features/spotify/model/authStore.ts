import { create } from 'zustand'
import { t } from '@shared/i18n'
import { spGetCreds, spSetCreds, spCheck, spClearCreds } from '../api/spClient'

/**
 * Состояние Spotify-креденшелов (Client Credentials). `enabled` — синхронный флаг
 * (читает `spProvider.isEnabled`, чтобы Spotify появлялся в поиске/дропдауне
 * только после ввода валидных creds). Сами creds живут в Rust-конфиге; здесь —
 * зеркало для UI настроек + гейт провайдера. Параллель `useYmAuthStore`.
 */

export type StatusKind = 'ok' | 'err' | 'info'

interface SpAuthState {
  /** Заданы ли creds (провайдер включён). */
  enabled: boolean
  /** Префилл полей настроек. */
  clientId: string
  clientSecret: string
  checking: boolean
  status: { text: string; kind: StatusKind } | null

  /** Перечитать creds/статус из Rust. */
  refresh: () => Promise<void>
  /** Сохранить creds + проверить их обменом на токен. */
  saveAndCheck: (clientId: string, clientSecret: string) => Promise<void>
  /** Удалить creds. */
  clear: () => Promise<void>
  setFields: (clientId: string, clientSecret: string) => void
}

export const useSpAuthStore = create<SpAuthState>((set, get) => ({
  enabled: false,
  clientId: '',
  clientSecret: '',
  checking: false,
  status: null,

  refresh: async () => {
    try {
      const creds = await spGetCreds()
      const hasCreds = !!(creds.clientId && creds.clientSecret)
      set({ clientId: creds.clientId || '', clientSecret: creds.clientSecret || '' })
      if (!hasCreds) {
        set({ enabled: false })
        return
      }
      // Реальная проверка API (не только наличие creds): Spotify требует Premium у
      // владельца приложения — без него токен есть, но API отвечает 403. Включаем
      // провайдер только если запрос реально проходит, иначе Spotify не появится
      // в поиске/дропдауне (и не будет сыпать 403 на каждый запрос).
      const ok = await spCheck().then(() => true).catch(() => false)
      set({ enabled: ok })
    } catch {
      /* ignore */
    }
  },

  setFields: (clientId, clientSecret) => set({ clientId, clientSecret }),

  saveAndCheck: async (clientId, clientSecret) => {
    const id = clientId.trim()
    const secret = clientSecret.trim()
    if (!id || !secret) {
      set({ status: { text: t('settings.sp.status.needBoth'), kind: 'err' } })
      return
    }
    set({ checking: true, status: { text: t('settings.sp.status.checking'), kind: 'info' } })
    try {
      await spSetCreds(id, secret)
      await spCheck() // обмен на токен — валидация
      set({ enabled: true, checking: false, status: { text: t('settings.sp.status.ok'), kind: 'ok' } })
    } catch (e) {
      set({
        checking: false,
        enabled: false,
        status: { text: t('settings.sp.status.failPrefix') + msg(e), kind: 'err' },
      })
    }
  },

  clear: async () => {
    await spClearCreds().catch(() => undefined)
    set({ enabled: false, clientId: '', clientSecret: '', status: { text: t('settings.sp.status.reset'), kind: 'info' } })
    void get().refresh()
  },
}))

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))
