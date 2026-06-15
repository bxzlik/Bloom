import { useEffect, useRef, useState, type DragEvent as ReactDragEvent } from 'react'
import { cn } from '@shared/lib/cn'
import { useUiPrefsStore } from '@features/settings'
import { useLibraryBridge, handleFiles, getCurrentView } from '../lib'
import { useSelectionStore, useLibStore } from '../model'
import { LibSidebar } from './LibSidebar'
import { LibContent } from './LibContent'

/**
 * Корень `.page#page-lib`.
 * Структура: `.lib-sidebar` + `.lib-content`.
 *
 * `useLibraryBridge` подписывается на folder_watcher события — наполняет
 * `useLibStore` папками и треками.
 *
 * Drag-drop: на странице активен handler для аудиофайлов — попадают через
 * `handleFiles` в стор. `document.addEventListener('drop', ...)`,
 * только локально на page-lib, чтобы не конфликтовать с другими drop-зонами.
 */
export const LibPage = ({ active }: { active: boolean }) => {
  useLibraryBridge()

  const libView = useUiPrefsStore((s) => s.libView)

  const [dragOver, setDragOver] = useState(false)
  const counter = useRef(0)

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

  // Если страница неактивна — drag handlers не вешаются.
  useEffect(() => {
    if (!active) {
      counter.current = 0
      setDragOver(false)
    }
  }, [active])

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

  const onDragEnter = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    counter.current += 1
    setDragOver(true)
  }
  const onDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
  const onDragLeave = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return
    counter.current = Math.max(0, counter.current - 1)
    if (counter.current === 0) setDragOver(false)
  }
  const onDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.files.length) return
    e.preventDefault()
    counter.current = 0
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div
      className={cn(`page${active ? ' active' : ''}`, dragOver && 'lib-drag-over')}
      id="page-lib"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {libView === 'list' && <LibSidebar />}
      <LibContent />
    </div>
  )
}
