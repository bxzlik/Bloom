import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@shared/tauri'
import { buildShareCard } from '@shared/lib/buildShareCard'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { toast } from './GlobalToast'
import { useShareStore } from './shareStore'
import { useT } from '@shared/i18n'

/**
 * Модалка «Поделиться» (#shareCardMover / #shareCardModal).
 * Строит canvas-карточку (`buildShareCard`), показывает её как `<img>` (dataURL).
 * «Сохранить PNG» гонит тот же dataURL в Rust `cover_download`, «Копировать
 * ссылку» — в буфер обмена.
 *
 * Управляется глобальным `useShareStore` (один экземпляр в App). Анимация
 * открытия/закрытия — конвенция `.open` на #shareCardMover (CSS уже в).
 */
export const ShareCardModal = () => {
  const t = useT()
  const data = useShareStore((s) => s.data)
  const close = useShareStore((s) => s.closeShare)

  const [mounted, setMounted] = useState(false)
  const [opening, setOpening] = useState(false)
  // dataURL построенной карточки (он же идёт в cover_download).
  const [cardUrl, setCardUrl] = useState<string | null>(null)

  const open = data !== null

  // Enter-анимация `.open` без «дёрганья» появления (см. runEnterAnimation).
  useEffect(() => {
    if (open) {
      setMounted(true)
      return runEnterAnimation(setOpening)
    }
    setOpening(false)
  }, [open])

  // Построить карточку при открытии (гонко-стойкий флаг).
  useEffect(() => {
    if (!data) return
    let cancelled = false
    setCardUrl(null)
    void buildShareCard({ title: data.title, artist: data.artist, cover: data.cover })
      .then((canvas) => {
        if (!cancelled) setCardUrl(canvas.toDataURL('image/png'))
      })
      .catch((e) => {
        console.warn('[share] build failed', e)
        if (!cancelled) toast(t('share.toast.cardFail'))
      })
    return () => {
      cancelled = true
    }
  }, [data])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!mounted) return null

  const labels: Record<string, string> = {
    artist: t('share.artist'),
    playlist: t('share.playlist'),
    album: t('share.album'),
  }
  const title = (data && labels[data.type]) || t('share.track')

  const onSave = () => {
    if (!cardUrl || !data) return
    const filename = `${data.title || 'track'} — Bloom`
    void invoke('cover_download', { dataUrl: cardUrl, filename }).catch((e) => {
      console.warn('cover_download failed', e)
      toast(t('share.toast.saveFail'))
    })
    close()
  }

  const onCopy = () => {
    if (!data) return
    void navigator.clipboard
      .writeText(data.shareUrl)
      .then(() => toast(t('share.toast.linkCopied')))
      .catch(() => toast(t('share.toast.copyFail')))
    close()
  }

  return createPortal(
    <div
      id="shareCardMover"
      className={opening ? 'open' : ''}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
      onTransitionEnd={(e) => {
        if (!open && e.target === e.currentTarget) setMounted(false)
      }}
    >
      <div id="shareCardModal">
        <div className="sc-card-head">
          <span className="sc-card-title">{title}</span>
          <button className="sc-card-close" onClick={close} aria-label={t('common.close')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="sc-card-preview-wrap">
          <div id="shareCardPreview" className="sc-card-preview">
            {cardUrl ? <img src={cardUrl} alt="" /> : <div className="sc-card-spinner" />}
          </div>
        </div>
        <div className="sc-card-actions">
          <button className="sc-card-btn sc-card-btn-primary" onClick={onSave} disabled={!cardUrl}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {t('share.savePng')}
          </button>
          <button className="sc-card-btn" onClick={onCopy}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            {t('share.copyLink')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
