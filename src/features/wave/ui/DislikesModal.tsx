import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLibStore } from '@features/library/model/store'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'
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
            <Ico name="dislike" width={14} height={14} style={{ opacity: 0.7 }} />
            {t('wave.dislikesTitle')}
          </div>
          <button className="stats-modal-close" onClick={onClose} aria-label={t('common.close')}>
            <Ico name="close" width={13} height={13} />
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
                    <Ico name="note" width={15} height={15} style={{ opacity: 0.35 }} />
                  )}
                </div>
                <div className="dlk-body">
                  <div className="dlk-name">{t.name}</div>
                  <div className="dlk-artist">{t.artist}</div>
                </div>
                <button className="dlk-rm" onClick={() => undislike(t.id)}>
                  <Ico name="close" width={12} height={12} />
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
