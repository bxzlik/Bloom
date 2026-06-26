import { useEffect, useRef, useState } from 'react'
import { useT, useLocale } from '@shared/i18n'
import { useUpdateStore } from '../model/updateStore'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Кнопка обновления в тайтлбаре (`.tb-update-*`) + выпадающий попап-анонс.
 * Появляется, только когда авто-проверка нашла версию новее текущей (и её не
 * скрыли) либо идёт загрузка установщика. Заменяет прежний баннер в углу.
 *
 * Попап (в стиле панели колокольчика): заголовок + версия, авто-листающаяся
 * карусель страниц заметки релиза (картинка + описание, точки-индикаторы) и
 * действия — «Подробнее» (открывает модалку `UpdateNotesModal`) и «Обновить»
 * (скачать+установить). Во время загрузки вместо кнопок — прогресс-бар.
 *
 * Контент карусели берётся из того же манифеста, что и модалка (`ensureNote`).
 */
const AUTO_MS = 3600

export const UpdateButton = () => {
  const t = useT()
  useLocale()
  const phase = useUpdateStore((s) => s.phase)
  const info = useUpdateStore((s) => s.info)
  const percent = useUpdateStore((s) => s.percent)
  const dismissedVersion = useUpdateStore((s) => s.dismissedVersion)
  const note = useUpdateStore((s) => s.note)
  const notesLoading = useUpdateStore((s) => s.notesLoading)
  const ensureNote = useUpdateStore((s) => s.ensureNote)
  const openNotes = useUpdateStore((s) => s.openNotes)
  const downloadInstall = useUpdateStore((s) => s.downloadInstall)

  const [open, setOpen] = useState(false)
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const downloading = phase === 'downloading'
  const available = phase === 'available' && !!info && info.latest !== dismissedVersion
  const show = available || downloading

  const pages = note?.pages ?? []
  const multi = pages.length > 1
  const cur = pages[Math.min(idx, Math.max(pages.length - 1, 0))]

  // При открытии — подтягиваем заметку для карусели (кэшируется в сторе).
  useEffect(() => {
    if (open) void ensureNote()
  }, [open, ensureNote])

  // Сброс слайда при открытии / смене заметки.
  useEffect(() => {
    setIdx(0)
  }, [note, open])

  // Авто-листание страниц (пауза при наведении).
  useEffect(() => {
    if (!open || !multi || paused) return
    const id = window.setInterval(() => setIdx((i) => (i + 1) % pages.length), AUTO_MS)
    return () => window.clearInterval(id)
  }, [open, multi, paused, pages.length])

  // Закрытие по клику вне / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!show) return null

  return (
    <div className="tb-update-wrap" ref={wrapRef}>
      <button
        className={`tb-update-btn${open ? ' on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Ico name="refresh" width={13} height={13} />
        <span>{downloading ? `${percent}%` : t('settings.about.update')}</span>
      </button>

      {open && (
        <div
          className="tb-update-pop"
          role="dialog"
          aria-label={t('update.available')}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="tbu-head">
            <span className="tbu-title">{t('update.available')}</span>
            <span className="tbu-ver">Bloom v{info?.latest}</span>
          </div>

          {/* Превью текущей страницы — только если есть картинка */}
          {cur?.image && (
            <div className="tbu-preview">
              <div className="tbu-frame" key={idx}>
                <img src={cur.image} alt="" loading="lazy" className="tbu-img" />
              </div>
            </div>
          )}

          {/* Описание текущей страницы (или версия как фолбэк) */}
          <div className="tbu-desc">
            {notesLoading && pages.length === 0
              ? t('update.downloading')
              : cur?.title || cur?.body || t('update.available')}
          </div>

          {/* Точки-индикаторы — под текстом */}
          {multi && (
            <div className="tbu-dots">
              {pages.map((_, i) => (
                <button
                  key={i}
                  className={`tbu-dot${i === idx ? ' on' : ''}`}
                  aria-label={`${i + 1}`}
                  onClick={() => setIdx(i)}
                />
              ))}
            </div>
          )}

          {/* Действия / прогресс */}
          {downloading ? (
            <div className="tbu-progress">
              <div className="tbu-track">
                <div className="tbu-fill" style={{ width: `${percent}%` }} />
              </div>
              <span className="tbu-pct">{percent}%</span>
            </div>
          ) : (
            <div className="tbu-actions">
              <button
                className="tbu-ghost"
                onClick={() => {
                  setOpen(false)
                  void openNotes()
                }}
              >
                {t('update.details')}
              </button>
              <button className="btn bta tbu-go" onClick={() => void downloadInstall()}>
                {t('settings.about.update')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
