import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@shared/tauri'
import { toast } from '@shared/ui'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { useLibStore, useHistoryStore } from '@features/library'
import { trackRegistry, type Track } from '@entities/track'
import { useProfileStore } from '../model/profileStore'
import { parseDur, fmtDurLong } from '../lib/formatStats'
import { buildProfileCard } from '../lib/buildProfileCard'

/**
 * Модалка «Поделиться профилем». `openProfileShareModal` /
 * `saveProfileCard` / `copyProfileShareLink`. Реюзает шелл
 * `#shareCardMover`/`#shareCardModal` (как трековая ShareCardModal), но строит
 * карточку профиля (`buildProfileCard`) и share-ссылку с `type=profile`.
 *
 * Статистика — из истории (как StatsSection), а не из мёртвого playCount.
 * Открытие — флаг `shareOpen` в profileStore.
 */

const SHARE_BASE = 'https://bxzlik.github.io/bloom/share/'

const findTrack = (id: string, libTracks: Track[]): Track | undefined =>
  libTracks.find((t) => t.id === id) ?? trackRegistry.get(id)

export const ProfileShareModal = () => {
  const shareOpen = useProfileStore((s) => s.shareOpen)
  const closeShare = useProfileStore((s) => s.closeShare)
  const tracks = useLibStore((s) => s.tracks)
  const entries = useHistoryStore((s) => s.entries)

  const [mounted, setMounted] = useState(false)
  const [opening, setOpening] = useState(false)
  const [cardUrl, setCardUrl] = useState<string | null>(null)

  // Тоталы из истории: прослушивания, время, любимый артист.
  const totals = useMemo(() => {
    let totalSec = 0
    let totalPlays = 0
    const artistMap = new Map<string, number>()
    for (const e of entries) {
      const plays = e.count || 0
      totalPlays += plays
      const t = findTrack(e.id, tracks)
      if (!t) continue
      totalSec += parseDur(t.dur) * plays
      const a = t.artist || 'Неизвестный'
      artistMap.set(a, (artistMap.get(a) || 0) + plays)
    }
    const top = [...artistMap.entries()].sort((a, b) => b[1] - a[1])[0]
    return {
      totalSec,
      totalPlays,
      favArtist: top && top[1] > 0 ? top[0] : '—',
    }
  }, [entries, tracks])

  // Enter-анимация `.open` без «дёрганья» появления (см. runEnterAnimation).
  useEffect(() => {
    if (shareOpen) {
      setMounted(true)
      return runEnterAnimation(setOpening)
    }
    setOpening(false)
  }, [shareOpen])

  // Построить карточку при открытии.
  useEffect(() => {
    if (!shareOpen) return
    const p = useProfileStore.getState()
    let cancelled = false
    setCardUrl(null)
    void buildProfileCard({
      name: p.name,
      bio: p.bio,
      avatar: p.avatar,
      bannerColor: p.bannerColor,
      bannerColor2: p.bannerColor2,
      trackCount: tracks.length,
      plays: totals.totalPlays,
      timeStr: fmtDurLong(totals.totalSec),
      favArtist: totals.favArtist,
    })
      .then((canvas) => {
        if (!cancelled) setCardUrl(canvas.toDataURL('image/png'))
      })
      .catch((e) => {
        console.warn('[profile share] build failed', e)
        if (!cancelled) toast('Не удалось построить карточку')
      })
    return () => {
      cancelled = true
    }
  }, [shareOpen, tracks.length, totals])

  useEffect(() => {
    if (!shareOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeShare()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shareOpen, closeShare])

  if (!mounted) return null

  const onSave = () => {
    if (!cardUrl) return
    const filename = `${useProfileStore.getState().name || 'Профиль'} — Bloom`
    void invoke('cover_download', { dataUrl: cardUrl, filename }).catch((e) => {
      console.warn('cover_download failed', e)
      toast('Не удалось сохранить карточку')
    })
    closeShare()
  }

  const onCopy = () => {
    const p = useProfileStore.getState()
    const params: Record<string, string> = {
      type: 'profile',
      name: p.name || '',
      tracks: String(tracks.length),
      plays: String(totals.totalPlays),
      time: fmtDurLong(totals.totalSec),
    }
    if (totals.favArtist && totals.favArtist !== '—') params.artist = totals.favArtist
    if (p.avatar && p.avatar.startsWith('http')) params.avatar = p.avatar
    if (p.bio) params.bio = p.bio
    const url = SHARE_BASE + '?' + new URLSearchParams(params).toString()
    void navigator.clipboard
      .writeText(url)
      .then(() => toast('Ссылка скопирована'))
      .catch(() => toast('Не удалось скопировать'))
    closeShare()
  }

  return createPortal(
    <div
      id="shareCardMover"
      className={opening ? 'open' : ''}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeShare()
      }}
      onTransitionEnd={(e) => {
        if (!shareOpen && e.target === e.currentTarget) setMounted(false)
      }}
    >
      <div id="shareCardModal">
        <div className="sc-card-head">
          <span className="sc-card-title">Поделиться профилем</span>
          <button className="sc-card-close" onClick={closeShare} aria-label="Закрыть">
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
            Сохранить PNG
          </button>
          <button className="sc-card-btn" onClick={onCopy}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            Копировать ссылку
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
