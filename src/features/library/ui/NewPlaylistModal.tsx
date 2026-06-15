import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@shared/lib/cn'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { compressCover } from '../lib/compressCover'
import { usePlaylistStore } from '../model'

export interface NewPlaylistModalProps {
  open: boolean
  onClose: () => void
  /** Колбэк после создания нового плейлиста. */
  onCreated?: (id: string) => void
  /** Если задан — режим «Изменить плейлист»: значения подставляются,
      при submit обновляются (rename/setPlDesc/setPlCover) вместо createPl. */
  editPlaylistId?: string | null
}

const ANIM_MS = 320 // соответствует .modal transition 320ms из main.css

/**
 * Модалка «Новый плейлист» / «Изменить плейлист».
 * Использует CSS-классы из shared/styles/modals.css.
 */
export const NewPlaylistModal = ({
  open,
  onClose,
  onCreated,
  editPlaylistId,
}: NewPlaylistModalProps) => {
  const createPl = usePlaylistStore((s) => s.createPl)
  const renamePl = usePlaylistStore((s) => s.renamePl)
  const setPlDesc = usePlaylistStore((s) => s.setPlDesc)
  const setPlCover = usePlaylistStore((s) => s.setPlCover)
  const playlist = usePlaylistStore((s) =>
    editPlaylistId ? s.playlists.find((p) => p.id === editPlaylistId) : undefined,
  )
  const isEdit = !!editPlaylistId

  const [mounted, setMounted] = useState(open)
  const [openClass, setOpenClass] = useState(false)
  const closeTimer = useRef<number | null>(null)

  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [cover, setCover] = useState<string | undefined>(undefined)
  const [coverBusy, setCoverBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // open/close animation: enter без «дёрганья» (runEnterAnimation), unmount после ANIM_MS при закрытии.
  useEffect(() => {
    if (open) {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
        closeTimer.current = null
      }
      // При открытии в edit-режиме — подставляем значения плейлиста.
      if (playlist) {
        setName(playlist.name)
        setDesc(playlist.desc ?? '')
        setCover(playlist.cover)
      } else {
        setName('')
        setDesc('')
        setCover(undefined)
      }
      setMounted(true)
      return runEnterAnimation(setOpenClass)
    }
    setOpenClass(false)
    closeTimer.current = window.setTimeout(() => {
      setMounted(false)
      setName('')
      setDesc('')
      setCover(undefined)
      setCoverBusy(false)
      closeTimer.current = null
    }, ANIM_MS)
    return () => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
        closeTimer.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Автофокус на name input при открытии.
  useEffect(() => {
    if (openClass) {
      const t = setTimeout(() => inputRef.current?.focus(), 100)
      return () => clearTimeout(t)
    }
  }, [openClass])

  // ESC закрывает.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const onCoverChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setCoverBusy(true)
    try {
      const dataUrl = await compressCover(file)
      setCover(dataUrl)
    } catch {
      // ignore
    } finally {
      setCoverBusy(false)
    }
  }

  const clearCover = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    setCover(undefined)
  }

  const onBackdropClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    const trimmedDesc = desc.trim() || undefined
    if (isEdit && editPlaylistId) {
      renamePl(editPlaylistId, trimmed)
      setPlDesc(editPlaylistId, trimmedDesc)
      setPlCover(editPlaylistId, cover)
    } else {
      const pl = createPl(trimmed, trimmedDesc, cover)
      onCreated?.(pl.id)
    }
    onClose()
  }

  if (!mounted) return null

  return createPortal(
    <div
      className={cn('mover', openClass && 'open')}
      id="mover"
      onClick={onBackdropClick}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={onSubmit}>
          <div className="modal-head">
            <h3 id="mtitle">{isEdit ? 'Изменить плейлист' : 'Новый плейлист'}</h3>
            <button
              type="button"
              className="modal-x"
              onClick={onClose}
              aria-label="Закрыть"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="modal-body">
            <div className="pl-cov-wrap">
              <label
                className="pl-cov-zone"
                id="plCoverZone"
              >
                {cover && (
                  <img id="plCoverPreview" className="pl-cov-img" src={cover} alt="" />
                )}
                {!cover && (
                  <div className="pl-cov-hint" id="plCoverHint">
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.6}
                      strokeLinecap="round"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="3" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span>
                      Добавить
                      <br />
                      обложку
                    </span>
                  </div>
                )}
                <input
                  type="file"
                  id="plCoverFile"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={onCoverChange}
                  disabled={coverBusy}
                />
              </label>
              {cover && (
                <button
                  type="button"
                  className="pl-cov-rmv"
                  id="plCoverRmv"
                  onClick={clearCover}
                  aria-label="Удалить обложку"
                  style={{ display: 'flex' }}
                >
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 8 8"
                    fill="none"
                    stroke="white"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    style={{ display: 'block', flexShrink: 0 }}
                  >
                    <line x1="1.5" y1="1.5" x2="6.5" y2="6.5" />
                    <line x1="6.5" y1="1.5" x2="1.5" y2="6.5" />
                  </svg>
                </button>
              )}
            </div>

            <div className="modal-fields">
              <div className="mf-row">
                <label className="mf-label">Название</label>
                <input
                  ref={inputRef}
                  type="text"
                  className="minp"
                  id="minp"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Мой плейлист..."
                />
              </div>
              <div className="mf-row">
                <label className="mf-label">
                  Описание <span className="mf-opt">необязательно</span>
                </label>
                <textarea
                  className="pl-desc-inp"
                  id="plDesc"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="Описание плейлиста..."
                />
              </div>
            </div>
          </div>

          <div className="modal-foot">
            <button type="button" className="btn btg" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn bta" id="mok" disabled={!name.trim()}>
              {isEdit ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
