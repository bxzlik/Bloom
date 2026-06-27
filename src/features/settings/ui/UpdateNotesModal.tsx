import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import { openUrl } from '@tauri-apps/plugin-opener'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { useT, useI18nStore } from '@shared/i18n'
import { ScBadge, YmBadge, YtmBadge, SpBadge } from '@entities/track'
import { useUpdateStore, formatNoteDate } from '../model/updateStore'
import { Ico } from '@shared/ui/icons/solar'

/** Бренд-бейдж площадки по строковому id (для строки иконок на странице). */
const BRAND_BADGE: Record<string, (p: { size: number }) => React.ReactNode> = {
  spotify: SpBadge,
  ytmusic: YtmBadge,
  soundcloud: ScBadge,
  yandex: YmBadge,
}

/**
 * Модалка «Подробнее»/«Что нового» — листаемые страницы-слайды заметки релиза:
 * у каждой свой заголовок, текст (markdown) и (опц.) одна картинка или строка
 * бренд-иконок. Контент берётся из сетевого манифеста `update-notes.json`.
 *
 *   - режим 'announce'  — открыта по кнопке «Подробнее» (баннер/колокольчик) у
 *     тех, кто ещё не обновился; внизу кнопка «Обновить».
 *   - режим 'whatsnew'  — авто-показ один раз после обновления (и вручную из
 *     «О приложении»); внизу «Готово».
 *
 * Чрома/анимации — как у штатных модалок (`.mover/.modal`): затемнение+блюр,
 * пружинистый въезд карточки через `.open` (`runEnterAnimation`), z-index ниже
 * оконного тайтлбара (#winTitlebar z1001), чтобы кнопки окна оставались доступны.
 * Переключение страниц: стрелки, точки-индикаторы, клавиши ←/→. Рендерится в App.
 */
export const UpdateNotesModal = () => {
  const t = useT()
  const locale = useI18nStore((s) => s.locale)
  const open = useUpdateStore((s) => s.notesOpen)
  const loading = useUpdateStore((s) => s.notesLoading)
  const mode = useUpdateStore((s) => s.notesMode)
  const note = useUpdateStore((s) => s.note)
  const phase = useUpdateStore((s) => s.phase)
  const historyVersions = useUpdateStore((s) => s.historyVersions)
  const close = useUpdateStore((s) => s.closeNotes)
  const downloadInstall = useUpdateStore((s) => s.downloadInstall)
  const openHistoryNote = useUpdateStore((s) => s.openHistoryNote)
  const backToHistory = useUpdateStore((s) => s.backToHistory)

  // Монтирование с enter/exit-анимацией (как ShareCardModal): .open включаем
  // на следующем кадре, при закрытии снимаем и размонтируем после перехода.
  const [mounted, setMounted] = useState(false)
  const [opening, setOpening] = useState(false)

  const [page, setPage] = useState(0)
  const pages = note?.pages ?? []
  const total = pages.length
  const idx = Math.min(page, Math.max(total - 1, 0))
  const cur = pages[idx]
  const go = (d: number) => setPage((p) => Math.min(Math.max(p + d, 0), Math.max(total - 1, 0)))

  useEffect(() => {
    if (open) {
      setMounted(true)
      return runEnterAnimation(setOpening)
    }
    setOpening(false)
    const id = setTimeout(() => setMounted(false), 320)
    return () => clearTimeout(id)
  }, [open])

  // Сброс на первую страницу при открытии/смене заметки.
  useEffect(() => {
    setPage(0)
  }, [note, open])

  // Escape — закрыть; ←/→ — листать.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, close, total])

  if (!mounted) return null

  // В режиме истории без выбранной заметки показываем список версий.
  const historyList = mode === 'history' && !note
  const title = historyList ? t('update.history') : note?.title || t('update.notesTitle')
  const multi = total > 1

  return createPortal(
    <div
      className={`unm-mover${opening ? ' open' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="unm-modal" role="dialog" aria-label={title}>
        {/* Шапка */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px 12px' }}>
          {mode === 'history' && note ? (
            <button className="unm-close" aria-label={t('update.back')} onClick={backToHistory}>
              <Ico name="arrowLeft" width={16} height={16} />
            </button>
          ) : (
            <img src="/logo.png" alt="" style={{ width: 34, height: 34, objectFit: 'contain', flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {title}
            </div>
            {!historyList && note?.date && (
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{formatNoteDate(note.date, locale)}</div>
            )}
          </div>
          <button className="unm-close" aria-label={t('common.close')} onClick={close}>
            <Ico name="close" width={16} height={16} />
          </button>
        </div>

        {/* Тело: текущая страница (заголовок + иконки/markdown + картинка) */}
        <div key={idx} style={{ padding: '4px 18px 16px', overflowY: 'auto', minHeight: 0, animation: 'bloom-fade-in .2s ease' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '28px 0' }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  border: '3px solid rgba(255,255,255,.18)',
                  borderTopColor: 'var(--accent, #fff)',
                  animation: 'bloom-spin .8s linear infinite',
                }}
              />
            </div>
          ) : historyList ? (
            historyVersions.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>{t('update.historyEmpty')}</div>
            ) : (
              <div className="unm-history">
                {historyVersions.map((h) => (
                  <button
                    key={h.version}
                    className="unm-history-item"
                    onClick={() => void openHistoryNote(h.version)}
                  >
                    <span className="unm-history-ver">v{h.version}</span>
                    {h.title && <span className="unm-history-title">{h.title}</span>}
                    {h.date && <span className="unm-history-date">{h.date}</span>}
                    <Ico name="arrowRight" width={16} height={16} className="unm-history-chev" />
                  </button>
                ))}
              </div>
            )
          ) : !cur ? (
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>{t('update.notesEmpty')}</div>
          ) : (
            <>
              {cur.title && (
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{cur.title}</div>
              )}
              {cur.icons.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '14px 0 16px' }}>
                  {cur.icons.map((id) => {
                    const Badge = BRAND_BADGE[id]
                    return Badge ? <Badge key={id} size={64} /> : null
                  })}
                </div>
              )}
              {cur.body && (
                <div className="update-notes-md" style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text2)' }}>
                  <ReactMarkdown
                    components={{
                      a: ({ href, children }) => (
                        <a
                          href={href}
                          onClick={(e) => {
                            e.preventDefault()
                            if (href) void openUrl(href).catch(() => {})
                          }}
                          style={{ color: 'var(--accent, #5865f2)', cursor: 'pointer' }}
                        >
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {cur.body}
                  </ReactMarkdown>
                </div>
              )}
              {cur.image && (
                <img
                  src={cur.image}
                  alt=""
                  loading="lazy"
                  style={{ width: '100%', borderRadius: 10, display: 'block', marginTop: 12, border: '1px solid var(--border)' }}
                />
              )}
            </>
          )}
        </div>

        {/* Навигация по страницам (только если их больше одной) */}
        {multi && !loading && (
          <div className="unm-nav">
            <button className="unm-arrow" aria-label="←" onClick={() => go(-1)} disabled={idx === 0}>
              <Ico name="arrowLeft" width={18} height={18} />
            </button>
            <div className="unm-dots">
              {pages.map((_, i) => (
                <button
                  key={i}
                  className={`unm-dot${i === idx ? ' on' : ''}`}
                  aria-label={`${i + 1}`}
                  onClick={() => setPage(i)}
                />
              ))}
            </div>
            <button className="unm-arrow" aria-label="→" onClick={() => go(1)} disabled={idx === total - 1}>
              <Ico name="arrowRight" width={18} height={18} />
            </button>
          </div>
        )}

        {/* Подвал: действия */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '12px 18px 16px' }}>
          {mode === 'whatsnew' || mode === 'history' ? (
            <button className="btn bta" onClick={close} style={{ fontSize: 12.5, padding: '7px 18px' }}>
              {t('update.gotIt')}
            </button>
          ) : (
            <>
              <button className="unm-ghost" onClick={close}>
                {t('update.later')}
              </button>
              <button
                className="btn bta"
                disabled={phase === 'downloading'}
                onClick={() => {
                  close()
                  void downloadInstall()
                }}
                style={{ fontSize: 12.5, padding: '7px 18px' }}
              >
                {t('settings.about.update')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
