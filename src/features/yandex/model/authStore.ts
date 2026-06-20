import { create } from 'zustand'
import { openUrl } from '@tauri-apps/plugin-opener'
import { t } from '@shared/i18n'
import { ymAuthStart, ymAuthPoll, ymIsAuthed, ymHasPlus, ymLogout } from '../api/ymClient'

/**
 * Состояние авторизации Яндекс.Музыки (OAuth device-flow).
 *
 * `authed` — синхронный флаг (читает `ymProvider.isEnabled`, чтобы провайдер
 * появлялся в поиске/дропдауне только после логина). Обновляется на bootstrap,
 * после успешного логина и после выхода.
 *
 * Device-flow: `startAuth` получает код, открывает страницу подтверждения и
 * поллит токен с гонкой-токеном `_pollGen`. Транзиентные
 * поля (`userCode`/`verifyUrl`/`status`) — только для UI секции настроек.
 */

export type StatusKind = 'ok' | 'err' | 'info'

interface YmAuthState {
  /** Авторизован (есть сохранённый токен). */
  authed: boolean
  /** Активен ли Яндекс Плюс. null — ещё не проверяли/неизвестно. */
  hasPlus: boolean | null
  /** Идёт первичная проверка статуса (refresh). */
  checking: boolean

  /** Идёт device-flow (показан код). */
  connecting: boolean
  userCode: string | null
  verifyUrl: string | null
  status: { text: string; kind: StatusKind } | null

  /** Перечитать статус (authed + hasPlus) из Rust. */
  refresh: () => Promise<void>
  /** Начать device-flow: код → открыть страницу → поллинг токена. */
  startAuth: () => Promise<void>
  /** Прервать поллинг (закрытие секции/повторный вход). */
  cancelAuth: () => void
  /** Выйти (удалить токен). */
  logout: () => Promise<void>
}

/** Гонка-токен поллинга: при logout/повторном старте старый цикл отменяется. */
let _pollGen = 0

export const useYmAuthStore = create<YmAuthState>((set, get) => ({
  authed: false,
  hasPlus: null,
  checking: false,
  connecting: false,
  userCode: null,
  verifyUrl: null,
  status: null,

  refresh: async () => {
    set({ checking: true })
    try {
      const authed = await ymIsAuthed()
      if (!authed) {
        set({ authed: false, hasPlus: null, checking: false })
        return
      }
      const plus = await ymHasPlus().catch(() => null)
      set({ authed: true, hasPlus: plus, checking: false })
    } catch {
      set({ checking: false })
    }
  },

  startAuth: async () => {
    _pollGen++ // отменить прошлый поллинг
    set({ connecting: true, status: { text: t('ym.auth.gettingCode'), kind: 'info' } })
    try {
      const d = await ymAuthStart()
      await openUrl(d.verification_url).catch(() => window.open(d.verification_url, '_blank'))
      set({
        userCode: d.user_code,
        verifyUrl: d.verification_url,
        status: { text: t('ym.auth.waiting'), kind: 'info' },
      })

      const gen = ++_pollGen
      const deadline = Date.now() + (d.expires_in || 300) * 1000
      const step = Math.max(3, d.interval || 5) * 1000

      const poll = async (): Promise<void> => {
        if (gen !== _pollGen) return // отменён
        if (Date.now() > deadline) {
          set({
            connecting: false,
            userCode: null,
            status: { text: t('ym.auth.codeExpired'), kind: 'err' },
          })
          return
        }
        try {
          const r = await ymAuthPoll(d.device_code)
          if (gen !== _pollGen) return
          if (r === 'ok') {
            set({ connecting: false, userCode: null, verifyUrl: null, status: null })
            await get().refresh()
            return
          }
          setTimeout(() => void poll(), step)
        } catch (e) {
          if (gen !== _pollGen) return
          set({ connecting: false, userCode: null, status: { text: msg(e), kind: 'err' } })
        }
      }
      void poll()
    } catch (e) {
      set({ connecting: false, userCode: null, status: { text: msg(e), kind: 'err' } })
    }
  },

  cancelAuth: () => {
    _pollGen++
    set({ connecting: false, userCode: null, verifyUrl: null, status: null })
  },

  logout: async () => {
    _pollGen++ // остановить поллинг
    await ymLogout().catch(() => undefined)
    set({ authed: false, hasPlus: null, connecting: false, userCode: null, verifyUrl: null, status: null })
  },
}))

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))
