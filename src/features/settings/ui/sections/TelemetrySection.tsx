import { useEffect, useRef, useState } from 'react'
import { toast } from '@shared/ui'
import {
  clearLyricsCache,
  lyricsCacheStats,
  purgeLyricsCache,
  type LyricsCacheStats,
} from '@features/lyrics'
import {
  TTL_OPTIONS,
  useTelemetryStore,
  type TtlPolicy,
} from '../../model/telemetryStore'
import { useSettingsStore } from '../../model/settingsStore'
import { useT, useLocale, type TranslationKey } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

/** Метки TTL-политик — переводимые (метки в сторе не используются для отображения). */
const TTL_KEY: Record<TtlPolicy, TranslationKey> = {
  never: 'settings.storage.ttl.never',
  restart: 'settings.storage.ttl.restart',
  '24h': 'settings.storage.ttl.24h',
  '3d': 'settings.storage.ttl.3d',
  '1w': 'settings.storage.ttl.1w',
  '1m': 'settings.storage.ttl.1m',
}

/** Человекочитаемый размер. */
const fmtBytes = (b: number): string => {
  if (b <= 0) return '0 B'
  const mb = b / 1_048_576
  if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB'
  if (mb >= 1) return mb.toFixed(1) + ' MB'
  return Math.max(1, Math.round(b / 1024)) + ' KB'
}

const ru = (n: number, forms: [string, string, string]): string => {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b > 1 && b < 5) return forms[1]
  if (b === 1) return forms[0]
  return forms[2]
}

/**
 * Раздел «Хранилище» (телеметрия). По макету: карточка «Занято места» (общий
 * объём через navigator.storage.estimate) + управление данными приложения.
 *
 * Сейчас bloom осмысленно кеширует на диск только тексты песен (Rust
 * lyrics_service), поэтому единственная строка — «Тексты»: счётчик + размер,
 * TTL-дропдаун (реально авто-чистит на старте, см. useTelemetryBootstrap) и
 * корзина для ручной очистки. «Очистить всё» вайпит все кеши.
 */
export const TelemetrySection = () => {
  const t = useT()
  const locale = useLocale()
  const [lyrics, setLyrics] = useState<LyricsCacheStats>({ count: 0, bytes: 0 })
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  const [ttlOpen, setTtlOpen] = useState(false)
  const ttlRef = useRef<HTMLDivElement>(null)

  const ttl = useTelemetryStore((s) => s.ttl.lyrics)
  const setTtl = useTelemetryStore((s) => s.setTtl)

  const diskCache = useSettingsStore((s) => s.lyrics_disk_cache)
  const setDiskCache = useSettingsStore((s) => s.setLyricsDiskCache)

  const refresh = () => {
    void lyricsCacheStats().then(setLyrics)
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        void navigator.storage.estimate().then((e) => {
          setStorage({ usage: e.usage ?? 0, quota: e.quota ?? 0 })
        })
      }
    } catch {
      /* ignore */
    }
  }

  useEffect(refresh, [])

  // Закрытие дропдауна по клику вне.
  useEffect(() => {
    if (!ttlOpen) return
    const onDown = (e: MouseEvent) => {
      if (ttlRef.current && !ttlRef.current.contains(e.target as Node)) setTtlOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [ttlOpen])

  const pickTtl = (policy: TtlPolicy) => {
    setTtl('lyrics', policy)
    setTtlOpen(false)
    // Time-based политику применяем сразу (плюс она же сработает на старте).
    const secs = TTL_OPTIONS.find((o) => o.id === policy)?.seconds ?? 0
    if (secs > 0) {
      void purgeLyricsCache(secs).then((n) => {
        if (n > 0) toast(t('settings.storage.toast.staleRemoved', { n }))
        refresh()
      })
    }
  }

  const clearLyrics = () => {
    if (lyrics.count === 0) return
    if (!confirm(t('settings.storage.confirm.clearLyrics'))) return
    void clearLyricsCache().then(() => {
      toast(t('settings.storage.toast.lyricsCleared'))
      refresh()
    })
  }

  const clearAll = () => {
    if (!confirm(t('settings.storage.confirm.clearAll'))) return
    void clearLyricsCache().then(() => {
      toast(t('settings.storage.toast.dataCleared'))
      refresh()
    })
  }

  const usedStr = storage ? fmtBytes(storage.usage) : '—'
  const pct = storage && storage.quota > 0 ? Math.min(100, (storage.usage / storage.quota) * 100) : 0

  return (
    <div className="s-section active" id="ssec-tele-storage">
      <div className="s-section-head">
        <div className="s-section-title">
          <Ico name="database" width={15} height={15} />{' '}
          {t('settings.nav.storage')}
        </div>
        <button className="btn btg" style={{ fontSize: 10, padding: '3px 9px', display: 'flex', alignItems: 'center', gap: 5 }} onClick={refresh}>
          <Ico name="refresh" width={10} height={10} />{' '}
          {t('settings.storage.refresh')}
        </button>
      </div>

      {/* ХРАНИЛИЩЕ — общий объём */}
      <div className="tele-stat-card">
        <div className="tele-stat-label">{t('settings.storage.used')}</div>
        <div className="tele-stat-val">{usedStr}</div>
        <div className="tele-storage-bar"><span style={{ width: `${pct}%` }} /></div>
        {storage && storage.quota > 0 && (
          <div className="tele-storage-sub">{t('settings.storage.of', { q: fmtBytes(storage.quota), p: pct < 1 ? '<1' : Math.round(pct) })}</div>
        )}
      </div>

      {/* УПРАВЛЕНИЕ ДАННЫМИ ПРИЛОЖЕНИЯ */}
      <div className="tele-data-head">
        <div className="tele-data-head-title">{t('settings.storage.manage')}</div>
        <button className="tele-clear-all" onClick={clearAll}>
          <Ico name="trash" width={12} height={12} />
          {t('settings.storage.clearAll')}
        </button>
      </div>

      {/* Строка: Тексты */}
      <div className="tele-data-row">
        <div className="tele-data-icon">
          <Ico name="note" width={17} height={17} />
        </div>
        <div className="tele-data-info">
          <span className="tele-data-name">{t('settings.storage.lyrics')}</span>
          <span className="tele-data-meta">
            {locale === 'ru'
              ? `${lyrics.count} ${ru(lyrics.count, ['элемент', 'элемента', 'элементов'])}`
              : `${lyrics.count} ${lyrics.count === 1 ? 'item' : 'items'}`}
            {lyrics.bytes > 0 ? ` • ${fmtBytes(lyrics.bytes)}` : ''}
          </span>
        </div>

        <label
          className="tele-sw"
        >
          <input
            type="checkbox"
            checked={diskCache}
            onChange={(e) => void setDiskCache(e.target.checked)}
          />
          <span className="tele-sw-track" />
        </label>

        <div className="tele-ttl" ref={ttlRef} style={diskCache ? undefined : { opacity: 0.4, pointerEvents: 'none' }}>
          <button className="tele-ttl-btn" onClick={() => setTtlOpen((v) => !v)}>
            {t(TTL_KEY[ttl])}
            <Ico name="arrowDown" width={11} height={11} />
          </button>
          {ttlOpen && (
            <div className="tele-ttl-pop">
              {TTL_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  className={`tele-ttl-opt${o.id === ttl ? ' active' : ''}`}
                  onClick={() => pickTtl(o.id)}
                >
                  {t(TTL_KEY[o.id])}
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="tele-trash" onClick={clearLyrics} disabled={lyrics.count === 0}>
          <Ico name="trash" width={15} height={15} />
        </button>
      </div>
    </div>
  )
}
