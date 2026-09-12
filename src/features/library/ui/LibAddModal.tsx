import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@shared/i18n'
import { toast } from '@shared/ui'
import { runEnterAnimation } from '@shared/lib/enterAnimation'
import { PlCover } from './PlCover'
import { ScLogo, YmLogo, YtmLogo, providerBrandColor } from '@entities/track'
import { providerLogo } from '@features/player'
import { getProviders } from '@features/providers'
import { Ico } from '@shared/ui/icons/solar'
import { useSettingsStore } from '@features/settings'
import { folderAdd, importPlaylistFile } from '../api'
import {
  importPlaylistData,
  createNamedPlaylist,
  importFromUrl,
  detectLinkProvider,
  tracksLabel,
  type ImportTarget,
  type LinkProvider,
} from '../lib'
import {
  useConvertStore,
  usePlaylistStore,
  useUnifiedOrderStore,
  type Playlist,
} from '../model'

export interface LibAddModalProps {
  open: boolean
  onClose: () => void
  /** Результат файлового импорта (.bloomplaylist) — для тоста в родителе. */
  onImported?: (res: { playlists: number; tracks: number } | null) => void
}

/** Длительность slide-out (.lam-modal transform .42s) перед демонтажем. */
const ANIM_MS = 440

/** Чистое лого площадки (без плашки) — внутри инпута импорта, в бренд-цвете. */
const ProviderLogo = ({ provider }: { provider: LinkProvider }) => {
  const logo =
    provider === 'yandex' ? (
      <YmLogo size={15} />
    ) : provider === 'ytmusic' ? (
      <YtmLogo size={16} />
    ) : (
      <ScLogo size={16} />
    )
  return (
    <span className="lam-link-logo" style={{ color: providerBrandColor(provider) }}>
      {logo}
    </span>
  )
}

const CheckIcon = () => <Ico name="check" variant="bold" width={14} height={14} />

/** Цель «Создать» — плюс в боксе тумбы (чтобы метки строк выровнялись). */
const CreateThumb = () => (
  <span className="lam-icon-box">
    <Ico name="add" width={17} height={17} />
  </span>
)

/** Цель «Все треки» — обложка раздела: нейтральный квадрат с рамкой + синяя нота. */
const AllTracksThumb = () => (
  <span className="lam-sys-thumb">
    <Ico name="note" width={15} height={15} style={{ color: 'var(--sys-all-ico)' }} />
  </span>
)

/** Цель «Любимые» — сердце без плашки (как в списках библиотеки). */
const FavThumb = () => (
  <span className="lam-icon-box">
    <Ico name="heart" variant="bold" width={17} height={17} style={{ color: 'var(--sys-fav-ico)' }} />
  </span>
)

/** Обложка плейлиста для строки списка. */
const PlThumb = ({ pl }: { pl: Playlist }) => (
  <span className="lam-pl-thumb">
    {pl.cover ? <img src={pl.cover} alt="" /> : <PlCover trs={pl.trs} />}
  </span>
)

/** Строка списка выбора (цель импорта / плейлист для переноса). */
const PickRow = ({
  thumb,
  name,
  sub,
  pinned,
  sel,
  onClick,
}: {
  thumb: React.ReactNode
  name: string
  sub?: string
  pinned?: boolean
  sel: boolean
  onClick: () => void
}) => (
  <button className={`lam-row${sel ? ' sel' : ''}`} onClick={onClick}>
    {thumb}
    <span className="lam-row-txt">
      <span className="lam-row-name">
        <span className="lam-row-name-t">{name}</span>
        {pinned && <Ico name="pin" width={11} height={11} className="lam-row-pin" />}
      </span>
      {sub && <span className="lam-row-sub">{sub}</span>}
    </span>
    {sel && <Ico name="check" variant="bold" className="lam-row-check" width={13} height={13} />}
  </button>
)

/**
 * Модалка кнопки «+» в библиотеке (`.lam-overlay` / `.lam-modal`).
 *
 * Раньше это был попап у кнопки (`#libAddMenu`); теперь — центральная модалка на
 * общем языке приложения: поверхность и подложка как у «Инфо о треке»
 * (`.ti-modal`) и «Статистики» (`.smodal`), выезд из-за кромки окна за .42s,
 * поэтому демонтаж по таймеру (ANIM_MS), а не по transitionEnd подложки.
 *
 * Три вида (`view`):
 * - `main`    — inline-создание плейлиста + Импорт + Конвертировать + Папка;
 * - `import`  — ссылка с бейджем площадки + список целей + «Из файла»;
 * - `convert` — выбор плейлиста и целевой площадки; сам перенос (скан/разбор
 *               спорных) делает `ConvertModal`, куда площадка уходит заранее
 *               выбранной, минуя её собственный экран выбора.
 *
 * Низ всегда занимает широкая кнопка «Назад»: из подвидов — назад в `main`, из
 * `main` — закрытие.
 */
export const LibAddModal = ({ open, onClose, onImported }: LibAddModalProps) => {
  const t = useT()
  const [mounted, setMounted] = useState(false)
  const [opening, setOpening] = useState(false)
  const closeTimer = useRef<number | null>(null)
  const [view, setView] = useState<'main' | 'import' | 'convert'>('main')
  // Высота карточки в px — чтобы смена вида не щёлкала скачком, а доезжала
  // переходом (см. lib-add-modal.css). Замеряем содержимое, а не саму карточку.
  const innerRef = useRef<HTMLDivElement>(null)
  const [h, setH] = useState<number | null>(null)

  // Inline-создание плейлиста.
  const [plName, setPlName] = useState('')
  // Импорт по ссылке.
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [target, setTarget] = useState<ImportTarget>({ kind: 'create' })
  // Конвертер: что и куда переносим.
  const [cvtPl, setCvtPl] = useState<string | null>(null)
  const [cvtProv, setCvtProv] = useState<string | null>(null)

  const playlists = usePlaylistStore((s) => s.playlists)
  // Подписываемся на сам порядок, а не на isPinned: тот стабилен и открепление
  // при живой модалке не перерисовало бы строки.
  const order = useUnifiedOrderStore((s) => s.order)
  const pinnedIds = useMemo(
    () => new Set(order.filter((o) => o.pinned && o.type === 'playlist').map((o) => o.id)),
    [order],
  )
  const linkProvider = useMemo(() => detectLinkProvider(url), [url])
  // Пустой плейлист переносить нечего — кнопку не включаем.
  const cvtPlEmpty = !playlists.find((p) => p.id === cvtPl)?.trs.length
  // Сетевые площадки (локальная — не цель переноса), как в ConvertModal.
  // Пересчитываем на каждое открытие: список зависит от подключённых аккаунтов,
  // а компонент висит смонтированным всё время жизни библиотеки.
  const providers = useMemo(() => getProviders().filter((p) => p.id !== 'local'), [open])

  // Enter-анимация `.open` без «дёрганья» появления (см. runEnterAnimation);
  // на закрытии — отложенный демонтаж под slide-out.
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

  // Замер содержимого: первая установка идёт от `height:auto`, т.е. без перехода
  // (интерполировать auto нечем) — карточка появляется сразу нужного размера, а
  // анимируются только последующие смены вида.
  useLayoutEffect(() => {
    if (!mounted) return
    const el = innerRef.current
    if (!el) return
    const apply = () => setH(el.offsetHeight)
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [mounted])

  // Сброс состояния — после ухода модалки, а не в момент закрытия (иначе вид
  // сменился бы посреди анимации); к следующему открытию всё уже чистое.
  useEffect(() => {
    if (!mounted) {
      setH(null)
      setView('main')
      setPlName('')
      setUrl('')
      setBusy(false)
      setTarget({ kind: 'create' })
      setCvtPl(null)
      setCvtProv(null)
    }
  }, [mounted])

  // Esc: из подвида — назад в главный, из главного — закрыть.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (view === 'main') onClose()
      else setView('main')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, view, onClose])

  if (!mounted) return null

  // ── Действия ──
  const createPlaylist = () => {
    const name = plName.trim()
    if (!name) return
    onClose()
    createNamedPlaylist(name)
  }

  const onImportFile = async () => {
    onClose()
    const content = await importPlaylistFile().catch(() => null)
    if (!content) return
    // importPlaylistData восстанавливает треки + создаёт плейлисты с НОВЫМИ id.
    const res = importPlaylistData(content)
    onImported?.(res)
  }

  const onLinkFolder = () => {
    onClose()
    folderAdd(undefined, () => {
      // В режиме «В Bloom» команда копирует файлы и молчит до конца —
      // без тоста кнопка выглядит зависшей.
      if (useSettingsStore.getState().local_import_mode === 'copy') {
        toast(t('settings.library.import.copying'))
      }
    }).catch((e) => {
      console.warn('folderAdd failed', e)
      toast(String(e))
    })
  }

  const runUrlImport = async () => {
    if (busy || !url.trim()) return
    setBusy(true)
    try {
      const res = await importFromUrl(url, target)
      onClose()
      if (target.kind === 'create') {
        toast(t('search.toast.plImported', { name: res.title, n: res.added }))
      } else if (target.kind === 'library') {
        toast(res.added ? t('search.toast.added', { n: res.added }) : t('search.toast.allInLib'))
      } else if (target.kind === 'favorites') {
        toast(res.added ? t('lib.import.toast.toFavorites', { n: res.added }) : t('search.toast.allInLib'))
      } else {
        const name = playlists.find((p) => p.id === target.id)?.name ?? ''
        toast(t('lib.import.toast.toPlaylist', { name, n: res.added }))
      }
    } catch (e) {
      setBusy(false)
      toast(e instanceof Error ? e.message : t('lib.import.toast.unresolved'))
    }
  }

  /** Передаём выбор в ConvertModal — она стартует сразу со скана. */
  const runConvert = () => {
    if (!cvtPl || !cvtProv) return
    onClose()
    useConvertStore.getState().openConvert(cvtPl, cvtProv)
  }

  const back = () => (view === 'main' ? onClose() : setView('main'))

  return createPortal(
    <div
      className={`lam-overlay${opening ? ' open' : ''}`}
      id="libAddOverlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="lam-modal" style={h != null ? { height: h } : undefined}>
        <div className="lam-inner" ref={innerRef}>
          {/* key={view} перезапускает проявление содержимого на каждой смене вида. */}
          <div className="lam-body" key={view}>
            {view === 'main' && (
              <>
                {/* Inline-создание плейлиста: имя → галочка → создать. */}
                <div className="lam-input-row">
                  <input
                    className="lam-input"
                    value={plName}
                    placeholder={t('lib.add.namePlaceholder')}
                    autoFocus
                    onChange={(e) => setPlName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') createPlaylist()
                    }}
                  />
                  {plName.trim() && (
                    <button className="lam-check" onClick={createPlaylist} aria-label={t('lib.add.namePlaceholder')}>
                      <CheckIcon />
                    </button>
                  )}
                </div>

                <div className="lam-acts">
                  <button className="lam-act" onClick={() => setView('import')}>
                    <Ico name="export" width={17} height={17} />
                    {t('lib.add.import')}
                  </button>
                  <button className="lam-act" onClick={() => setView('convert')}>
                    <Ico name="shuffle" width={17} height={17} />
                    {t('lib.add.convert')}
                  </button>
                  <button className="lam-act" onClick={onLinkFolder}>
                    <Ico name="folder" width={17} height={17} />
                    {t('lib.linkFolder')}
                  </button>
                </div>
              </>
            )}

            {view === 'import' && (
              <>
                {/* Вставка ссылки: бейдж площадки + галочка-импорт. */}
                <div className="lam-input-row">
                  <div className="lam-input-field">
                    <input
                      className={`lam-input${linkProvider ? ' lam-input-badged' : ''}`}
                      value={url}
                      placeholder={t('lib.import.urlPlaceholder')}
                      autoFocus
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void runUrlImport()
                      }}
                    />
                    {linkProvider && <ProviderLogo provider={linkProvider} />}
                  </div>
                  {url.trim() && (
                    <button
                      className="lam-check"
                      onClick={() => void runUrlImport()}
                      disabled={busy}
                      aria-label={t('lib.add.import')}
                    >
                      {busy ? <span className="lam-spinner" /> : <CheckIcon />}
                    </button>
                  )}
                </div>

                {/* Цель импорта: список раскрыт сразу, без выпадашки. */}
                <div className="lam-list">
                  <PickRow
                    thumb={<CreateThumb />}
                    name={t('lib.import.target.create')}
                    sel={target.kind === 'create'}
                    onClick={() => setTarget({ kind: 'create' })}
                  />
                  <PickRow
                    thumb={<AllTracksThumb />}
                    name={t('lib.import.target.library')}
                    sel={target.kind === 'library'}
                    onClick={() => setTarget({ kind: 'library' })}
                  />
                  <PickRow
                    thumb={<FavThumb />}
                    name={t('lib.import.target.favorites')}
                    sel={target.kind === 'favorites'}
                    onClick={() => setTarget({ kind: 'favorites' })}
                  />
                  {playlists.map((p) => (
                    <PickRow
                      key={p.id}
                      thumb={<PlThumb pl={p} />}
                      name={p.name}
                      sub={tracksLabel(p.trs.length)}
                      pinned={pinnedIds.has(p.id)}
                      sel={target.kind === 'playlist' && target.id === p.id}
                      onClick={() => setTarget({ kind: 'playlist', id: p.id })}
                    />
                  ))}
                </div>

                <div className="lam-sec-row">
                  <button className="stats-tool-btn" onClick={onImportFile}>
                    <Ico name="file" width={14} height={14} />
                    {t('lib.import.fromFile')}
                  </button>
                </div>
              </>
            )}

            {view === 'convert' && (
              <>
                <div className="lam-title">{t('lib.add.convertTitle')}</div>

                <div className="lam-list">
                  {playlists.length === 0 ? (
                    <div className="lam-empty">{t('lib.add.noPlaylists')}</div>
                  ) : (
                    playlists.map((p) => (
                      <PickRow
                        key={p.id}
                        thumb={<PlThumb pl={p} />}
                        name={p.name}
                        sub={tracksLabel(p.trs.length)}
                        pinned={pinnedIds.has(p.id)}
                        sel={cvtPl === p.id}
                        onClick={() => setCvtPl(p.id)}
                      />
                    ))
                  )}
                </div>

                {/* Лого площадок — монохромные (currentColor): выбранная берёт
                    брендовый цвет, остальные приглушены. */}
                <div className="lam-provs">
                  {providers.map((p) => (
                    <button
                      key={p.id}
                      className={`lam-prov${cvtProv === p.id ? ' sel' : ''}`}
                      onClick={() => setCvtProv(p.id)}
                      aria-label={p.label}
                      style={cvtProv === p.id ? { color: providerBrandColor(p.id) ?? 'var(--text)' } : undefined}
                    >
                      {providerLogo(p.id, 18)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="lam-foot">
            {view === 'convert' && (
              <button
                className="stats-tool-btn accent"
                onClick={runConvert}
                disabled={!cvtPl || !cvtProv || cvtPlEmpty}
              >
                {t('lib.add.convertRun')}
              </button>
            )}
            <button className="stats-tool-btn" onClick={back}>
              {t('common.back')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
