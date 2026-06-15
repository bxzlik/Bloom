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
  ttlLabel,
  useTelemetryStore,
  type TtlPolicy,
} from '../../model/telemetryStore'
import { useSettingsStore } from '../../model/settingsStore'

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
        if (n > 0) toast(`Удалено устаревших: ${n}`)
        refresh()
      })
    }
  }

  const clearLyrics = () => {
    if (lyrics.count === 0) return
    if (!confirm('Очистить кэш текстов песен?\nТексты будут загружены заново при воспроизведении.')) return
    void clearLyricsCache().then(() => {
      toast('Кэш текстов очищен')
      refresh()
    })
  }

  const clearAll = () => {
    if (!confirm('Очистить все данные приложения?\nКеши будут удалены, треки и плейлисты не затрагиваются.')) return
    void clearLyricsCache().then(() => {
      toast('Данные очищены')
      refresh()
    })
  }

  const usedStr = storage ? fmtBytes(storage.usage) : '—'
  const pct = storage && storage.quota > 0 ? Math.min(100, (storage.usage / storage.quota) * 100) : 0

  return (
    <div className="s-section active" id="ssec-tele-storage">
      <div className="s-section-head">
        <div className="s-section-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>{' '}
          Хранилище
        </div>
        <button className="btn btg" style={{ fontSize: 10, padding: '3px 9px', display: 'flex', alignItems: 'center', gap: 5 }} onClick={refresh}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>{' '}
          Обновить
        </button>
      </div>

      {/* ХРАНИЛИЩЕ — общий объём */}
      <div className="tele-stat-card">
        <div className="tele-stat-label">Занято места</div>
        <div className="tele-stat-val">{usedStr}</div>
        <div className="tele-storage-bar"><span style={{ width: `${pct}%` }} /></div>
        {storage && storage.quota > 0 && (
          <div className="tele-storage-sub">из ~{fmtBytes(storage.quota)} ({pct < 1 ? '<1' : Math.round(pct)}%)</div>
        )}
      </div>

      {/* УПРАВЛЕНИЕ ДАННЫМИ ПРИЛОЖЕНИЯ */}
      <div className="tele-data-head">
        <div className="tele-data-head-title">Управление данными приложения</div>
        <button className="tele-clear-all" onClick={clearAll}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></svg>
          Очистить всё
        </button>
      </div>

      {/* Строка: Тексты */}
      <div className="tele-data-row">
        <div className="tele-data-icon">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
        </div>
        <div className="tele-data-info">
          <span className="tele-data-name">Тексты</span>
          <span className="tele-data-meta">
            {lyrics.count} {ru(lyrics.count, ['элемент', 'элемента', 'элементов'])}
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
            {ttlLabel(ttl)}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
          {ttlOpen && (
            <div className="tele-ttl-pop">
              {TTL_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  className={`tele-ttl-opt${o.id === ttl ? ' active' : ''}`}
                  onClick={() => pickTtl(o.id)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="tele-trash" onClick={clearLyrics} disabled={lyrics.count === 0}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></svg>
        </button>
      </div>
    </div>
  )
}
