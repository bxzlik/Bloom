import { create } from 'zustand'
import type { OfflineEntry } from '../api'

/**
 * Стор офлайн-кеша: карта `id трека → путь к локальной копии`. Источник правды —
 * Rust (offline.json); стор гидратируется на старте через `offlineScanAll`
 * (см. bootstrapOffline) и обновляется при скачивании/удалении.
 *
 * По этой карте:
 *  - source-resolver отдаёт `bloom-file://<path>` вместо сетевого стрима;
 *  - UI (контекст-меню, DlMenu, бейдж) показывает статус «доступно офлайн».
 *
 * Map заменяется целиком при каждой мутации — иначе zustand не заметит изменения
 * и подписанные компоненты не перерисуются.
 */
interface OfflineState {
  paths: Map<string, string>
  setAll: (entries: OfflineEntry[]) => void
  add: (id: string, path: string) => void
  remove: (id: string) => void
}

export const useOfflineStore = create<OfflineState>((set) => ({
  paths: new Map(),
  setAll: (entries) => set({ paths: new Map(entries.map((e) => [e.id, e.path])) }),
  add: (id, path) =>
    set((s) => {
      const m = new Map(s.paths)
      m.set(id, path)
      return { paths: m }
    }),
  remove: (id) =>
    set((s) => {
      if (!s.paths.has(id)) return s
      const m = new Map(s.paths)
      m.delete(id)
      return { paths: m }
    }),
}))

/** Императивный мост для не-React кода (source-resolver, загрузчик). */
export const offline = {
  isOffline: (id: string): boolean => useOfflineStore.getState().paths.has(id),
  getPath: (id: string): string | undefined => useOfflineStore.getState().paths.get(id),
  add: (id: string, path: string): void => useOfflineStore.getState().add(id, path),
  remove: (id: string): void => useOfflineStore.getState().remove(id),
  setAll: (entries: OfflineEntry[]): void => useOfflineStore.getState().setAll(entries),
}
