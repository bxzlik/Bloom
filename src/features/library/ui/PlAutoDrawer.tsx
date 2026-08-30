import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { useT, useLocale } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'
import { PlCover } from './PlCover'
import { usePlaylistStore, usePlAutoStore, PL_AUTO_INTERVALS } from '../model'
import { runPlAutoRefresh } from '../lib'

// Длительность slide-out (.spanel transform .42s) перед демонтажем.
const ANIM_MS = 440

/** «30 мин» / «3 ч» — подпись кнопки периода. */
const fmtEvery = (min: number, mLabel: string, hLabel: string): string =>
  min < 60 ? `${min} ${mLabel}` : `${Math.round(min / 60)} ${hLabel}`

/**
 * Боковая панель «Авто-обновление плейлистов» (`.spanel`, выезжает справа —
 * каркас общий с редактором тегов / «Добавить треки»).
 *
 * Что делает:
 *  - список плейлистов, у которых есть привязанные источники (`pl.sources`),
 *    с галочками — какие участвуют в обновлении;
 *  - «Обновить сейчас» — один проход по всем отмеченным (`runPlAutoRefresh`);
 *  - тумблер расписания + период + «при запуске приложения».
 *
 * Настройки хранит `plAutoStore` (persist), фоновый таймер — `plAutoRefresh`.
 * Внутренности переиспользуют `.mpl-*` / `.afs-*` классы merge-playlists.css,
 * своё — только `.pau-*`.
 */
export const PlAutoDrawer = () => {
  const t = useT()
  useLocale()
  const open = usePlAutoStore((s) => s.open)
  const closeDrawer = usePlAutoStore((s) => s.closeDrawer)
  const enabled = usePlAutoStore((s) => s.enabled)
  const everyMin = usePlAutoStore((s) => s.everyMin)
  const onStart = usePlAutoStore((s) => s.onStart)
  const ids = usePlAutoStore((s) => s.ids)
  const lastRun = usePlAutoStore((s) => s.lastRun)
  const runs = usePlAutoStore((s) => s.runs)
  const busy = usePlAutoStore((s) => s.busy)
  const setEnabled = usePlAutoStore((s) => s.setEnabled)
  const setEveryMin = usePlAutoStore((s) => s.setEveryMin)
  const setOnStart = usePlAutoStore((s) => s.setOnStart)
  const toggleId = usePlAutoStore((s) => s.toggleId)
  const setIds = usePlAutoStore((s) => s.setIds)
  const prune = usePlAutoStore((s) => s.prune)
  const playlists = usePlaylistStore((s) => s.playlists)

  const [mounted, setMounted] = useState(false)
  const [opening, setOpening] = useState(false)
  const closeTimer = useRef<number | null>(null)
  // Тикаем раз в 20с, чтобы «следующее через…» и «N мин назад» не залипали.
  const [, setTick] = useState(0)

  // Только плейлисты с привязанными источниками — остальные обновлять нечем.
  const candidates = useMemo(
    () => playlists.filter((p) => (p.sources?.length ?? 0) > 0),
    [playlists],
  )
  const selected = useMemo(
    () => ids.filter((id) => candidates.some((p) => p.id === id)),
    [ids, candidates],
  )
  const allSelected = candidates.length > 0 && selected.length === candidates.length

  // open/close: enter-анимация `.open` + отложенный демонтаж под slide-out.
  useEffect(() => {
    if (open) {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
        closeTimer.current = null
      }
      // Забываем удалённые плейлисты — иначе счётчик «выбрано» врёт.
      prune(new Set(usePlaylistStore.getState().playlists.map((p) => p.id)))
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer()
    }
    window.addEventListener('keydown', onKey)
    const id = window.setInterval(() => setTick((v) => v + 1), 20_000)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearInterval(id)
    }
  }, [open, closeDrawer])

  if (!mounted) return null

  const mLabel = t('lib.plauto.minShort')
  const hLabel = t('lib.plauto.hourShort')

  /** «2 ч назад» для последнего обновления плейлиста. */
  const agoLabel = (at: number): string => {
    const min = Math.max(0, Math.round((Date.now() - at) / 60_000))
    if (min < 1) return t('lib.plauto.justNow')
    if (min < 60) return t('home.minsAgo', { n: min })
    const h = Math.round(min / 60)
    if (h < 24) return t('home.hoursAgo', { n: h })
    return t('home.daysAgo', { n: Math.round(h / 24) })
  }

  /** «через 40 мин» до следующего прохода (или null — если не по расписанию). */
  const nextLabel = (): string | null => {
    if (!enabled || !selected.length) return null
    const left = lastRun + everyMin * 60_000 - Date.now()
    if (left <= 0) return t('lib.plauto.soon')
    const min = Math.ceil(left / 60_000)
    return t('lib.plauto.nextIn', {
      v: min < 60 ? `${min} ${mLabel}` : `${Math.round(min / 60)} ${hLabel}`,
    })
  }

  const running = busy !== null
  const next = nextLabel()

  return createPortal(
    <div
      id="plAutoOverlay"
      className={`spanel-backdrop${opening ? ' open' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeDrawer()
      }}
    >
      <div className="spanel">
        {/* HERO: иконка + заголовок + чипы состояния */}
        <div className="mpl-hero">
          <div className={`pau-hero-ico${running ? ' spin' : ''}`}>
            <Ico name="refresh" width={26} height={26} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="mpl-htitle">
              <Ico name="queue" width={11} height={11} />
              {t('lib.plauto.kicker')}
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: '-.2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {t('lib.plauto.title')}
            </div>
            <div className="mpl-stats">
              <span className="mpl-chip accent">
                {t('lib.plauto.selectedN', { n: selected.length })}
              </span>
              {enabled && (
                <span className="mpl-chip">
                  <b>{fmtEvery(everyMin, mLabel, hLabel)}</b>
                </span>
              )}
              {next && <span className="mpl-chip">{next}</span>}
            </div>
          </div>
        </div>

        {/* BODY */}
        <div className="mpl-body" style={{ overflow: 'hidden', paddingBottom: 14 }}>
          {/* Расписание */}
          <div>
            <div className="mpl-section-title">{t('lib.plauto.schedule')}</div>
            <div className="mpl-opts">
              <div
                className={`mpl-opt${enabled ? ' on' : ''}`}
                onClick={() => setEnabled(!enabled)}
              >
                <div className="mpl-opt-info">
                  <div className="mpl-opt-title">{t('lib.plauto.autoTitle')}</div>
                  <div className="mpl-opt-sub">{t('lib.plauto.autoSub')}</div>
                </div>
                <div className="mpl-toggle" />
              </div>

              <div className={`pau-seg-row${enabled ? '' : ' off'}`}>
                <span className="pau-seg-label">{t('lib.plauto.every')}</span>
                <div className="pau-seg">
                  {PL_AUTO_INTERVALS.map((min) => (
                    <button
                      key={min}
                      type="button"
                      className={everyMin === min ? 'active' : undefined}
                      disabled={!enabled}
                      onClick={() => setEveryMin(min)}
                    >
                      {fmtEvery(min, mLabel, hLabel)}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className={`mpl-opt${onStart ? ' on' : ''}${enabled ? '' : ' pau-opt-off'}`}
                onClick={() => enabled && setOnStart(!onStart)}
              >
                <div className="mpl-opt-info">
                  <div className="mpl-opt-title">{t('lib.plauto.onStartTitle')}</div>
                  <div className="mpl-opt-sub">{t('lib.plauto.onStartSub')}</div>
                </div>
                <div className="mpl-toggle" />
              </div>
            </div>
          </div>

          {/* Плейлисты с источниками */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            <div className="mpl-section-title">
              <span>{t('lib.plauto.playlists')}</span>
              <button
                className="afs-selall"
                disabled={candidates.length === 0 || running}
                onClick={() => setIds(allSelected ? [] : candidates.map((p) => p.id))}
              >
                <span className={`afs-chk${allSelected ? ' on' : selected.length ? ' part' : ''}`}>
                  {allSelected ? (
                    <Ico name="check" variant="bold" width={9} height={9} />
                  ) : selected.length ? (
                    <span style={{ width: 7, height: 1.5, background: 'var(--accent)', borderRadius: 1 }} />
                  ) : null}
                </span>
                {allSelected ? t('lib.deselectAll') : t('lib.selectAll')}
              </button>
            </div>

            <div className="mpl-list afs-list">
              {candidates.length === 0 ? (
                <div className="mpl-empty">{t('lib.plauto.noSources')}</div>
              ) : (
                candidates.map((pl) => {
                  const isSel = ids.includes(pl.id)
                  const run = runs[pl.id]
                  const isBusy = busy === pl.id
                  const srcN = pl.sources?.length ?? 0
                  return (
                    <div
                      className={`mpl-item${isSel ? ' sel' : ''}`}
                      key={pl.id}
                      onClick={() => !running && toggleId(pl.id)}
                    >
                      <div className="mpl-item-cov">
                        {pl.cover ? (
                          <img src={pl.cover} alt="" />
                        ) : (
                          <PlCover trs={pl.trs} />
                        )}
                      </div>
                      <div className="mpl-item-info">
                        <div className="mpl-item-name">{pl.name}</div>
                        <div className="mpl-item-sub">
                          {t('lib.plauto.sourcesN', { n: srcN })}
                          {isBusy
                            ? ` · ${t('lib.plauto.updating')}`
                            : run
                              ? ` · ${run.failed ? t('lib.plauto.lastFailed') : run.added ? t('lib.plauto.lastAdded', { n: run.added }) : t('lib.plauto.lastNoNew')} · ${agoLabel(run.at)}`
                              : ''}
                        </div>
                      </div>
                      {isBusy ? (
                        <span className="pl-src-spinner" />
                      ) : (
                        <div className="mpl-item-check">
                          {isSel && <Ico name="check" variant="bold" width={11} height={11} />}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="mpl-foot">
          <div className="mpl-foot-hint">
            {running
              ? t('lib.plauto.running')
              : lastRun
                ? `${t('lib.plauto.lastSweep')} ${agoLabel(lastRun)}`
                : t('lib.plauto.neverRun')}
          </div>
          <button className="mpl-btn ghost" onClick={closeDrawer}>
            {t('common.close')}
          </button>
          <button
            className="mpl-btn primary"
            disabled={running || selected.length === 0}
            onClick={() => void runPlAutoRefresh()}
          >
            {running ? t('lib.plauto.updating') : t('lib.plauto.refreshNow')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
