import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@shared/tauri'
import { toast } from '@shared/ui'
import { useT, t as tt } from '@shared/i18n'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { useLibStore, useHistoryStore } from '@features/library'
import { trackRegistry, type Track } from '@entities/track'
import { useProfileStore } from '../model/profileStore'
import { parseDur, fmtDurLong } from '../lib/formatStats'
import { buildProfileCard } from '../lib/buildProfileCard'
import { Ico } from '@shared/ui/icons/solar'

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
  const tr = useT()
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
      const a = t.artist || tt('common.unknownArtist')
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
        if (!cancelled) toast(tr('profile.toast.cardFail'))
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
    const filename = `${useProfileStore.getState().name || tr('profile.defaultFile')} — Bloom`
    void invoke('cover_download', { dataUrl: cardUrl, filename }).catch((e) => {
      console.warn('cover_download failed', e)
      toast(tr('profile.toast.saveFail'))
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
      .then(() => toast(tr('profile.toast.linkCopied')))
      .catch(() => toast(tr('profile.toast.copyFail')))
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
          <span className="sc-card-title">{tr('profile.shareTitle')}</span>
          <button className="sc-card-close" onClick={closeShare} aria-label={tr('common.close')}>
            <Ico name="close" width={12} height={12} />
          </button>
        </div>
        <div className="sc-card-preview-wrap">
          <div id="shareCardPreview" className="sc-card-preview">
            {cardUrl ? <img src={cardUrl} alt="" /> : <div className="sc-card-spinner" />}
          </div>
        </div>
        <div className="sc-card-actions">
          <button className="sc-card-btn sc-card-btn-primary" onClick={onSave} disabled={!cardUrl}>
            <Ico name="download" width={13} height={13} />
            {tr('share.savePng')}
          </button>
          <button className="sc-card-btn" onClick={onCopy}>
            <Ico name="share" width={13} height={13} />
            {tr('share.copyLink')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
