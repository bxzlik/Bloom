import { useEffect, useRef, useState } from 'react'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { cn } from '@shared/lib/cn'
import { useUiPrefsStore } from '@features/settings'
import { useLibraryBridge, importTracks, getCurrentView } from '../lib'
import { useSelectionStore, useLibStore } from '../model'
import { LibSidebar } from './LibSidebar'
import { LibContent } from './LibContent'

/**
 * Корень `.page#page-lib`.
 * Структура: `.lib-sidebar` + `.lib-content`.
 *
 * `useLibraryBridge` наполняет `useLibStore` папками и треками.
 *
 * Drag-drop идёт через событие Tauri, а не через HTML5: при `dragDropEnabled`
 * (по умолчанию) вебвью системный дроп файлов вообще не видит, а нам всё равно
 * нужен путь на диске — браузерный `File` его не отдаёт.
 */
export const LibPage = ({ active }: { active: boolean }) => {
  useLibraryBridge()

  const libView = useUiPrefsStore((s) => s.libView)

  const [dragOver, setDragOver] = useState(false)
  // Событие приходит на всё окно, поэтому проверяем активность страницы внутри
  // обработчика, а не пере-подписываемся на каждый переход.
  const activeRef = useRef(active)
  activeRef.current = active

  // Переключение вида списка↔сетка во время нахождения в библиотеке: если включили
  // «сетку» и мы не в плейлисте/папке — показываем обзор. ВХОД в библиотеку
  // обрабатывает синхронно `goNav('lib')→onEnterLibrary` (НЕ здесь), иначе этот
  // async-эффект перетирал бы deep-link с главной (selectBuiltin('fav')).
  // Поэтому зависимость только от libView, без `active`.
  useEffect(() => {
    if (active && libView === 'grid') {
      const s = useLibStore.getState()
      if (s.plId === null && s.folderPath === null) useLibStore.setState({ gridHome: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libView])

  useEffect(() => {
    if (!active) setDragOver(false)
  }, [active])

  // Перетаскивание аудиофайлов в окно.
  useEffect(() => {
    let unlisten: UnlistenFn | undefined
    let disposed = false

    void getCurrentWebview()
      .onDragDropEvent((e) => {
        if (!activeRef.current) return
        const p = e.payload
        if (p.type === 'enter' || p.type === 'over') {
          setDragOver(true)
        } else if (p.type === 'leave') {
          setDragOver(false)
        } else if (p.type === 'drop') {
          setDragOver(false)
          if (p.paths.length) {
            // Не-аудио и дубликаты отсеет Rust.
            void importTracks(p.paths).catch((err) => console.warn('importTracks failed', err))
          }
        }
      })
      .then((fn) => {
        if (disposed) fn()
        else unlisten = fn
      })
      .catch((e) => console.warn('onDragDropEvent failed', e))

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  // Ctrl+A = выбрать все треки в текущем view. Esc = снять выделение.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      // Игнорируем когда курсор в инпуте/textarea.
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        const ids = getCurrentView().tracks.map((tr) => tr.id)
        if (ids.length) useSelectionStore.getState().selectAll(ids)
      } else if (e.key === 'Escape') {
        if (useSelectionStore.getState().selMode) {
          e.preventDefault()
          useSelectionStore.getState().clear()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  return (
    <div
      className={cn(`page${active ? ' active' : ''}`, dragOver && 'lib-drag-over')}
      id="page-lib"
    >
      {libView === 'list' && <LibSidebar />}
      <LibContent />
    </div>
  )
}
