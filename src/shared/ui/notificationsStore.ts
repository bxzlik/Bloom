import { create } from 'zustand'
import type { TranslationKey } from '@shared/i18n'

/**
 * Центр уведомлений main-окна — история событий за сессию, доступная из
 * колокольчика в тайтлбаре (`<NotifBell/>`). В отличие от эфемерных тостов
 * (`toast()`, GlobalToast.tsx) уведомления держатся в списке, пока окно открыто,
 * но НЕ persist'ятся: при перезапуске приложения список пуст (чистится сам).
 *
 * Императивный `notify()` зовётся откуда угодно (как `toast()`), в т.ч. из
 * не-React кода (player/download/update). Тосты при этом остаются как были —
 * уведомление лишь дублирует событие в историю.
 */

export type NotifKind = 'error' | 'success' | 'info' | 'update'

export interface NotifItem {
  id: string
  kind: NotifKind
  /** i18n-ключ заголовка (релокализуется при показе панели). */
  titleKey: TranslationKey
  /** Готовый текст тела — снимок на момент события (часто содержит динамику). */
  body: string
  /** Время события (epoch ms). */
  ts: number
  read: boolean
}

/** Полезная нагрузка для `notify()` — без id/ts/read (их проставляет стор). */
export type NotifInput = Pick<NotifItem, 'kind' | 'titleKey' | 'body'>

const MAX = 50

interface NotifState {
  items: NotifItem[]
  add: (n: NotifInput) => void
  markAllRead: () => void
}

export const useNotifStore = create<NotifState>((set, get) => ({
  items: [],
  add: (n) => {
    const item: NotifItem = {
      ...n,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      read: false,
    }
    set({ items: [item, ...get().items].slice(0, MAX) })
  },
  markAllRead: () => {
    if (get().items.every((n) => n.read)) return // нечего обновлять
    set({ items: get().items.map((n) => (n.read ? n : { ...n, read: true })) })
  },
}))

/** Добавить уведомление из любого места (включая не-React код). */
export const notify = (n: NotifInput): void => useNotifStore.getState().add(n)
