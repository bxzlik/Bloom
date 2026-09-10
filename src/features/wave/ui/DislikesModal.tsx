import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLibStore } from '@features/library/model/store'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'
import { EmptyCover } from '@shared/ui'
import waveApi from '@/wave'
import { useDislikesStore } from '../model/dislikesStore'

interface DislikedItem {
  id: string
  name: string
  artist: string
  cover: string | null
}

/**
 * «Дизлайки в волне» — боковая шторка на общем каркасе `.spanel` (modals.css),
 * тот же, что у «Достижений» и редактора тегов: затемнение + панель, выезжающая
 * справа (влево — при настройке `drawerSide`). Шапки-хрома нет: ни крестика, ни
 * полосы — заголовок со счётчиком это обычный контент тела, а закрывают шторку
 * кликом по фону или Esc.
 *
 * Объединяет дизлайки библиотеки (t.disliked) и гостевых SC-треков (стор
 * dislikes). Удаление дизлайка построчно через Wave.feedback(undislike).
 */

/** Длительность slide-out (.spanel transform .42s) перед демонтажем. */
const ANIM_MS = 440

export const DislikesModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const t = useT()
  const scEntries = useDislikesStore((s) => s.entries)
  const tracks = useLibStore((s) => s.tracks)
  const [mounted, setMounted] = useState(false)
  const [opening, setOpening] = useState(false)
  const closeTimer = useRef<number | null>(null)

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

  // open/close: enter-анимация `.open` + отложенный демонтаж под slide-out
  // (как в ProfilePanelShell — панель уезжает transform'ом, не opacity).
  useEffect(() => {
    if (open) {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
        closeTimer.current = null
      }
      setMounted(true)
      return runEnterAnimation(setOpening)
    }
    setOpening(false)
    closeTimer.current = window.setTimeout(() => {
      setMounted(false)
      closeTimer.current = null
    }, ANIM_MS)
    return () => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
        closeTimer.current = null
      }
    }
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
      className={`spanel-backdrop${opening ? ' open' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="spanel">
        <div className="ppnl-body">
          {/* Шапка тела: название раздела слева, счётчик — плашкой справа
              (та же пара, что у «Достижений»). */}
          <div className="dlk-head">
            <span className="dlk-head-title">{t('wave.dislikesTitle')}</span>
            {items.length > 0 && <span className="ppnl-badge">{items.length}</span>}
          </div>
          <div className="dlk-list">
            {items.length === 0 ? (
              <div className="dlk-empty">{t('wave.noDislikes')}</div>
            ) : (
              items.map((t) => (
                <div className="dlk-row" data-id={t.id} key={t.id}>
                  <div className="dlk-cov">
                    {t.cover ? (
                      <img src={t.cover} alt="" />
                    ) : (
                      <EmptyCover />
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
      </div>
    </div>,
    document.body,
  )
}
