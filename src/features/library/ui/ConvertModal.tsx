import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { providerBrandColor, type Track } from '@entities/track'
import { getProviders } from '@features/providers'
import { providerLogo } from '@features/player'
import { toast } from '@shared/ui'
import { useT } from '@shared/i18n'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { Ico } from '@shared/ui/icons/solar'
import { PlCover } from './PlCover'
import { scanPlaylistConversion, createConvertedPlaylist, type ConvertItem } from '../lib'
import { useConvertStore, usePlaylistStore, useLibStore } from '../model'

/**
 * Модалка «Перенести на площадку» (#convertPlOverlay) — конвертер плейлиста.
 *
 * Три фазы в одной панели:
 * 1. `pick`   — выбор целевой площадки + имя новой копии;
 * 2. `scan`   — прогресс поиска треков на площадке (отменяется закрытием);
 * 3. `review` — итог: уверенные совпадения проставлены, спорные и ненайденные
 *               ждут ручного выбора (кандидаты / оставить оригинал / пропустить).
 *
 * Исходный плейлист не меняется — создаётся новый (см. `createConvertedPlaylist`).
 */

/** Решение по одному треку: чем он войдёт в новый плейлист. */
type Decision =
  /** Взять найденную версию с целевой площадки. */
  | { kind: 'match'; track: Track }
  /** Оставить исходный трек как есть. */
  | { kind: 'orig' }
  /** Не включать трек в новый плейлист. */
  | { kind: 'skip' }

type Phase = 'pick' | 'scan' | 'review'

const pct = (score: number): string => `${Math.round(score * 100)}%`

const Cov = ({ t }: { t: Track }) =>
  t.cover ? (
    <img src={t.cover} alt="" />
  ) : (
    <Ico name="note" width={12} height={12} style={{ opacity: 0.5 }} />
  )

export const ConvertModal = () => {
  const t = useT()
  const plId = useConvertStore((s) => s.plId)
  const closeStore = useConvertStore((s) => s.close)
  const playlists = usePlaylistStore((s) => s.playlists)
  const libTracks = useLibStore((s) => s.tracks)
  const selectPlaylist = useLibStore((s) => s.selectPlaylist)
  // Лого площадок — всегда брендовый цвет, как в LibAddMenu/PlSourcesEditor.
  // Настройку «Бейджи в цвете акцента» тут намеренно НЕ читаем: она про плашки
  // источника на обложках треков, а это голые лого-подсказки.
  const logoColor = (id: string): string => providerBrandColor(id) ?? 'var(--text)'

  const [mounted, setMounted] = useState(false)
  const [opening, setOpening] = useState(false)
  const [phase, setPhase] = useState<Phase>('pick')
  const [target, setTarget] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [items, setItems] = useState<ConvertItem[]>([])
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const open = plId !== null
  const livePl = plId ? playlists.find((p) => p.id === plId) ?? null : null
  // Держим последний валидный плейлист на время slide-out (как в MergeModal:
  // close() обнуляет plId, а панель ещё уезжает).
  const [heldPl, setHeldPl] = useState(livePl)
  const pl = livePl ?? heldPl

  useEffect(() => {
    if (livePl) setHeldPl(livePl)
  }, [livePl])

  // Сетевые площадки (локальная — не цель переноса).
  const providers = useMemo(() => getProviders().filter((p) => p.id !== 'local'), [plId])

  const close = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    closeStore()
  }, [closeStore])

  // Сброс при открытии.
  useEffect(() => {
    if (!open) return
    setPhase('pick')
    setTarget(null)
    setNameTouched(false)
    setName('')
    setItems([])
    setDecisions({})
    setProgress({ done: 0, total: 0 })
    setExpanded(null)
    setShowAll(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plId])

  useEffect(() => {
    if (open) {
      setMounted(true)
      return runEnterAnimation(setOpening)
    }
    setOpening(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  // Скан прерываем и при размонтировании (закрытие окна библиотеки и т.п.).
  useEffect(() => () => abortRef.current?.abort(), [])

  // Треки плейлиста в его порядке (пропавшие из библиотеки id — мимо).
  const srcTracks = useMemo(() => {
    if (!pl) return []
    const byId = new Map(libTracks.map((x) => [x.id, x]))
    return pl.trs.map((id) => byId.get(id)).filter((x): x is Track => !!x)
  }, [pl, libTracks])

  const targetLabel = providers.find((p) => p.id === target)?.label ?? ''
  const autoName = pl ? (targetLabel ? `${pl.name} (${targetLabel})` : pl.name) : ''
  const nameValue = nameTouched ? name : autoName

  const startScan = async () => {
    if (!target || !srcTracks.length) return
    const ac = new AbortController()
    abortRef.current = ac
    setPhase('scan')
    setProgress({ done: 0, total: srcTracks.length })
    const res = await scanPlaylistConversion(srcTracks, target, {
      signal: ac.signal,
      onProgress: (done, total) => setProgress({ done, total }),
    })
    if (ac.signal.aborted) return
    abortRef.current = null
    // Дефолты: уверенное совпадение подставляем сразу, спорное/ненайденное
    // остаётся оригиналом, пока пользователь не решит иначе.
    const def: Record<string, Decision> = {}
    for (const it of res) {
      def[it.src.id] =
        it.status === 'exact' && it.cands[0]
          ? { kind: 'match', track: it.cands[0].track }
          : { kind: 'orig' }
    }
    setItems(res)
    setDecisions(def)
    setPhase('review')
  }

  const stats = useMemo(() => {
    let moved = 0
    let orig = 0
    let skipped = 0
    for (const it of items) {
      const d = decisions[it.src.id]
      if (!d || d.kind === 'orig') orig++
      else if (d.kind === 'skip') skipped++
      else moved++
    }
    const attention = items.filter(
      (it) => it.status === 'ambiguous' || it.status === 'notfound',
    ).length
    return { moved, orig, skipped, attention, total: items.length }
  }, [items, decisions])

  const setDecision = (srcId: string, d: Decision) =>
    setDecisions((prev) => ({ ...prev, [srcId]: d }))

  /** Массово принять лучшего кандидата везде, где он есть. */
  const takeBestEverywhere = () => {
    setDecisions((prev) => {
      const next = { ...prev }
      for (const it of items) {
        const best = it.cands[0]
        if (best && it.status !== 'same') next[it.src.id] = { kind: 'match', track: best.track }
      }
      return next
    })
  }

  const doCreate = () => {
    if (!pl) return
    const out: Track[] = []
    for (const it of items) {
      const d = decisions[it.src.id] ?? { kind: 'orig' as const }
      if (d.kind === 'skip') continue
      out.push(d.kind === 'match' ? d.track : it.src)
    }
    if (!out.length) return
    const finalName = nameValue.trim() || autoName
    const created = createConvertedPlaylist(finalName, out, pl.cover)
    close()
    selectPlaylist(created.id)
    toast(t('lib.convert.toast.created', { name: finalName, n: created.count }))
  }

  if (!mounted || !pl) return null

  const visibleItems = showAll
    ? items
    : items.filter((it) => it.status === 'ambiguous' || it.status === 'notfound')

  return createPortal(
    <div
      id="convertPlOverlay"
      className={`spanel-backdrop${opening ? ' open' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
      onTransitionEnd={(e) => {
        if (!open && e.target === e.currentTarget) setMounted(false)
      }}
    >
      <div className="spanel">
        {/* ── Шапка: обложка исходного плейлиста + имя копии ───────────── */}
        <div className="mpl-hero">
          <div className="cvt-hero-cov">
            {pl.cover ? <img src={pl.cover} alt="" /> : <PlCover trs={pl.trs} />}
            {target && (
              <span className="cvt-hero-badge" style={{ color: logoColor(target) }}>
                {providerLogo(target, 13)}
              </span>
            )}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="mpl-htitle">
              <Ico name="arrowRightStraight" width={11} height={11} />
              {t('lib.convert.title')}
            </div>
            {phase === 'pick' ? (
              <div className="cvt-hero-name">{pl.name}</div>
            ) : (
              <input
                className="mpl-name-input"
                type="text"
                placeholder={t('lib.convert.namePlaceholder')}
                maxLength={80}
                value={nameValue}
                onChange={(e) => {
                  setNameTouched(true)
                  setName(e.target.value)
                }}
              />
            )}
            <div className="mpl-stats">
              <span className="mpl-chip accent">
                <b>{srcTracks.length}</b> {t('lib.merge.tracksSuffix')}
              </span>
              {phase === 'review' && stats.attention > 0 && (
                <span className="mpl-chip">
                  <b>{stats.attention}</b> {t('lib.convert.needAttention')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mpl-body">
          {/* ── Фаза 1: выбор площадки ─────────────────────────────────── */}
          {phase === 'pick' && (
            <>
              <div>
                <div className="mpl-section-title">{t('lib.convert.targetTitle')}</div>
                {providers.length === 0 ? (
                  <div className="mpl-empty">{t('lib.convert.noProviders')}</div>
                ) : (
                  <div className="cvt-targets">
                    {providers.map((p) => (
                      <div
                        key={p.id}
                        className={`cvt-target${target === p.id ? ' sel' : ''}`}
                        onClick={() => setTarget(p.id)}
                      >
                        {/* Лого площадок монохромные (currentColor) — цвет даём
                            сами: бренд или акцент, по настройке бейджей. */}
                        <span className="cvt-target-logo" style={{ color: logoColor(p.id) }}>
                          {providerLogo(p.id, 22)}
                        </span>
                        <span className="cvt-target-label">{p.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="cvt-note">
                <Ico name="info" width={13} height={13} />
                <span>{t('lib.convert.note')}</span>
              </div>
            </>
          )}

          {/* ── Фаза 2: прогресс скана ─────────────────────────────────── */}
          {phase === 'scan' && (
            <div className="cvt-scan">
              <div className="cvt-scan-ico">
                <Ico name="refresh" width={22} height={22} />
              </div>
              <div className="cvt-scan-text">
                {t('lib.convert.scanning', { label: targetLabel })}
              </div>
              <div className="cvt-bar">
                <div
                  className="cvt-bar-fill"
                  style={{
                    width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <div className="cvt-scan-count">
                {progress.done} / {progress.total}
              </div>
            </div>
          )}

          {/* ── Фаза 3: разбор результата ──────────────────────────────── */}
          {phase === 'review' && (
            <div>
              <div className="mpl-section-title">
                <span>
                  {showAll ? t('lib.convert.allTracks') : t('lib.convert.needChoice')}
                </span>
                <button className="cvt-linkbtn" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? t('lib.convert.onlyProblems') : t('lib.convert.showAll')}
                </button>
              </div>

              <div className="cvt-summary">
                <span className="mpl-chip accent">
                  <b>{stats.moved}</b> {t('lib.convert.sum.moved')}
                </span>
                <span className="mpl-chip">
                  <b>{stats.orig}</b> {t('lib.convert.sum.kept')}
                </span>
                {stats.skipped > 0 && (
                  <span className="mpl-chip">
                    <b>{stats.skipped}</b> {t('lib.convert.sum.skipped')}
                  </span>
                )}
                {stats.attention > 0 && (
                  <button className="cvt-linkbtn accent" onClick={takeBestEverywhere}>
                    {t('lib.convert.takeBest')}
                  </button>
                )}
              </div>

              <div className="cvt-list">
                {visibleItems.length === 0 ? (
                  <div className="mpl-empty">{t('lib.convert.allResolved')}</div>
                ) : (
                  visibleItems.map((it) => {
                    const d = decisions[it.src.id] ?? { kind: 'orig' as const }
                    const isOpen = expanded === it.src.id
                    const hasCands = it.cands.length > 0
                    return (
                      <div
                        key={it.src.id}
                        className={`cvt-item${isOpen ? ' open' : ''}${
                          it.status === 'notfound' ? ' warn' : ''
                        }`}
                      >
                        <div
                          className="cvt-item-head"
                          onClick={() => hasCands && setExpanded(isOpen ? null : it.src.id)}
                        >
                          <div className="cvt-cov"><Cov t={it.src} /></div>
                          <div className="cvt-item-info">
                            <div className="cvt-item-name">{it.src.name}</div>
                            <div className="cvt-item-sub">
                              {it.src.artist}
                              {it.src.dur ? ` · ${it.src.dur}` : ''}
                            </div>
                          </div>
                          <div className="cvt-decision">
                            {d.kind === 'match' ? (
                              <span className="cvt-tag ok">
                                <Ico name="check" width={9} height={9} />
                                {t('lib.convert.tag.moved')}
                              </span>
                            ) : d.kind === 'skip' ? (
                              <span className="cvt-tag">{t('lib.convert.tag.skipped')}</span>
                            ) : it.status === 'same' ? (
                              <span className="cvt-tag ok">{t('lib.convert.tag.onTarget')}</span>
                            ) : (
                              <span className="cvt-tag">{t('lib.convert.tag.original')}</span>
                            )}
                          </div>
                          {hasCands && (
                            <Ico
                              name={isOpen ? 'arrowUp' : 'arrowDown'}
                              width={11}
                              height={11}
                              style={{ opacity: 0.45, flexShrink: 0 }}
                            />
                          )}
                        </div>

                        {isOpen && (
                          <div className="cvt-cands">
                            {it.cands.map((c) => {
                              const picked = d.kind === 'match' && d.track.id === c.track.id
                              return (
                                <div
                                  key={c.track.id}
                                  className={`cvt-cand${picked ? ' sel' : ''}`}
                                  onClick={() =>
                                    setDecision(it.src.id, { kind: 'match', track: c.track })
                                  }
                                >
                                  <div className="cvt-cov sm"><Cov t={c.track} /></div>
                                  <div className="cvt-item-info">
                                    <div className="cvt-item-name">{c.track.name}</div>
                                    <div className="cvt-item-sub">
                                      {c.track.artist}
                                      {c.track.dur ? ` · ${c.track.dur}` : ''}
                                    </div>
                                  </div>
                                  <span
                                    className={`cvt-score${c.score >= 0.72 ? ' high' : ''}`}
                                  >
                                    {pct(c.score)}
                                  </span>
                                </div>
                              )
                            })}
                            <div className="cvt-cand-acts">
                              <button
                                className={`cvt-actbtn${d.kind === 'orig' ? ' sel' : ''}`}
                                onClick={() => setDecision(it.src.id, { kind: 'orig' })}
                              >
                                {t('lib.convert.keepOriginal')}
                              </button>
                              <button
                                className={`cvt-actbtn${d.kind === 'skip' ? ' sel' : ''}`}
                                onClick={() => setDecision(it.src.id, { kind: 'skip' })}
                              >
                                {t('lib.convert.skipTrack')}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Раскрывать нечего (ненайденные и уже-на-площадке) —
                            действия сразу в строке. */}
                        {!hasCands && (
                          <div className="cvt-cand-acts inline">
                            <span className="cvt-nf">
                              {it.status === 'same'
                                ? t('lib.convert.alreadyOn', { label: targetLabel })
                                : it.failed
                                  ? t('lib.convert.searchFailed')
                                  : t('lib.convert.notFoundOn', { label: targetLabel })}
                            </span>
                            <button
                              className={`cvt-actbtn${d.kind === 'orig' ? ' sel' : ''}`}
                              onClick={() => setDecision(it.src.id, { kind: 'orig' })}
                            >
                              {t('lib.convert.keepOriginal')}
                            </button>
                            <button
                              className={`cvt-actbtn${d.kind === 'skip' ? ' sel' : ''}`}
                              onClick={() => setDecision(it.src.id, { kind: 'skip' })}
                            >
                              {t('lib.convert.skipTrack')}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mpl-foot">
          <div className="mpl-foot-hint">
            {phase === 'pick'
              ? target
                ? t('lib.convert.hint.willScan', { n: srcTracks.length, label: targetLabel })
                : t('lib.convert.hint.pickTarget')
              : phase === 'scan'
                ? t('lib.convert.hint.scanning')
                : t('lib.convert.hint.willCreate', { n: stats.total - stats.skipped })}
          </div>
          <button className="mpl-btn ghost" onClick={close}>
            {t('common.cancel')}
          </button>
          {phase === 'pick' && (
            <button
              className="mpl-btn primary"
              onClick={() => void startScan()}
              disabled={!target || !srcTracks.length}
            >
              {t('lib.convert.start')}
            </button>
          )}
          {phase === 'review' && (
            <button
              className="mpl-btn primary"
              onClick={doCreate}
              disabled={stats.total - stats.skipped === 0}
            >
              {t('lib.convert.create')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
