import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLibStore } from '@features/library/model/store'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { useT } from '@shared/i18n'
import waveApi from '@/wave'
import { useDislikesStore } from '../model/dislikesStore'

interface DislikedItem {
  id: string
  name: string
  artist: string
  cover: string | null
}

/**
 * Модалка «Дизлайки в волне» (#dislikesModalOverlay / openDislikesModal).
 * Объединяет дизлайки библиотеки (t.disliked) и гостевых SC-треков
 * (стор dislikes). Удаление дизлайка построчно через Wave.feedback(undislike).
 *
 * Открытие/закрытие — модальная конвенция `.open` (см. [[project-modal-style]]).
 */
export const DislikesModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const t = useT()
  const scEntries = useDislikesStore((s) => s.entries)
  const tracks = useLibStore((s) => s.tracks)
  const [mounted, setMounted] = useState(false)
  const [opening, setOpening] = useState(false)

  const items = useMemo<DislikedItem[]>(() => {
    const out: DislikedItem[] = []
    const seen = new Set<string>()
    for (const t of tracks) {
      if (t.disliked) {
        seen.add(t.id)
        out.push({ id: t.id, name: t.name || '', artist: t.artist || '', cover: t.cover ?? null })
      }
    }
    for (const e of scEntries) {
      if (!seen.has(e.id)) out.push({ id: e.id, name: e.name, artist: e.artist, cover: e.cover })
    }
    return out
  }, [tracks, scEntries])

  // Enter-анимация `.open` без «дёрганья» появления (см. runEnterAnimation).
  useEffect(() => {
    if (open) {
      setMounted(true)
      return runEnterAnimation(setOpening)
    }
    setOpening(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!mounted) return null

  const undislike = (id: string) => waveApi.feedback({ action: 'undislike', trackId: id })

  return createPortal(
    <div
      id="dislikesModalOverlay"
      className={opening ? 'open' : ''}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onTransitionEnd={(e) => {
        if (!open && e.target === e.currentTarget) setMounted(false)
      }}
    >
      <div className="stats-modal">
        <div className="stats-modal-head">
          <div className="stats-modal-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
              <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z" />
              <path d="M22 2h-4v13" />
            </svg>
            {t('wave.dislikesTitle')}
          </div>
          <button className="stats-modal-close" onClick={onClose} aria-label={t('common.close')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="stats-modal-body" id="dislikesModalBody">
          {items.length === 0 ? (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text2)', fontSize: 13, opacity: 0.6 }}>
              {t('wave.noDislikes')}
            </div>
          ) : (
            items.map((t) => (
              <div className="dlk-row" data-id={t.id} key={t.id}>
                <div className="dlk-cov">
                  {t.cover ? (
                    <img src={t.cover} alt="" />
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" style={{ opacity: 0.35 }}>
                      <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                    </svg>
                  )}
                </div>
                <div className="dlk-body">
                  <div className="dlk-name">{t.name}</div>
                  <div className="dlk-artist">{t.artist}</div>
                </div>
                <button className="dlk-rm" onClick={() => undislike(t.id)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
