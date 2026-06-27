import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { usePopupOpenAnimation } from '@shared/hooks'
import { useT } from '@shared/i18n'
import { toast, VinylCover } from '@shared/ui'
import { ScLogo, YmLogo, YtmLogo, SpLogo, providerBrandColor } from '@entities/track'
import { Ico } from '@shared/ui/icons/solar'
import { folderAdd, importPlaylistFile } from '../api'
import {
  importPlaylistData,
  createNamedPlaylist,
  importFromUrl,
  detectLinkProvider,
  type ImportTarget,
  type LinkProvider,
} from '../lib'
import { usePlaylistStore, type Playlist } from '../model'

export interface LibAddMenuProps {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  /** Результат файлового импорта (.bloomplaylist) — для тоста в родителе. */
  onImported?: (res: { playlists: number; tracks: number } | null) => void
}

/** Чистое лого площадки (без плашки) — внутри инпута импорта, в бренд-цвете. */
const ProviderLogo = ({ provider }: { provider: LinkProvider }) => {
  const logo =
    provider === 'yandex' ? (
      <YmLogo size={15} />
    ) : provider === 'ytmusic' ? (
      <YtmLogo size={16} />
    ) : provider === 'spotify' ? (
      <SpLogo size={15} />
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

/** Цель «Создать» — плюс в 22px-боксе (чтобы метки строк выровнялись по тумбам). */
const CreateThumb = () => (
  <span className="lam-icon-box">
    <Ico name="add" width={15} height={15} />
  </span>
)

/** Цель «Все треки» — фирменная обложка раздела (синий градиент + нота). */
const AllTracksThumb = () => (
  <span className="lam-all-thumb">
    <Ico name="note" width={13} height={13} style={{ color: '#fff' }} />
  </span>
)

/** Цель «Любимые» — красный градиент + сердце. */
const FavThumb = () => (
  <span className="lam-all-thumb" style={{ background: 'linear-gradient(135deg,#c0144e,#7a0030)' }}>
    <Ico name="heart" variant="bold" width={12} height={12} style={{ color: '#fff' }} />
  </span>
)

/** Обложка плейлиста для строки выбора цели импорта. */
const PlThumb = ({ pl }: { pl: Playlist }) => (
  <span className="lam-pl-thumb">
    {pl.cover ? <img src={pl.cover} alt="" /> : <VinylCover seed={pl.id} />}
  </span>
)

/** Галочка-маркер выбранной цели. */
const ActiveCheck = () => (
  <Ico name="check" variant="bold" className="lam-active-check" width={13} height={13} />
)

/**
 * Меню кнопки «+» в сайдбаре библиотеки `#libAddMenu`.
 * Стилизация — через CSS-класс `#libAddMenu.open`.
 *
 * Два вида (`view`): главный (inline-создание плейлиста + Импорт + Папка) и
 * импорт (вставка ссылки с бейджем площадки + выбор цели + из файла + назад).
 *
 * Позиция: position:fixed, top = anchor.bottom+6, right прижата к anchor.right.
 * Замер — через useLayoutEffect после монтирования + слушатели resize/scroll.
 */
export const LibAddMenu = ({
  open,
  onClose,
  anchorRef,
  onImported,
}: LibAddMenuProps) => {
  const t = useT()
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [view, setView] = useState<'main' | 'import'>('main')

  // Inline-создание плейлиста.
  const [plName, setPlName] = useState('')
  // Импорт по ссылке.
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [target, setTarget] = useState<ImportTarget>({ kind: 'create' })
  const [targetOpen, setTargetOpen] = useState(false)
  const playlists = usePlaylistStore((s) => s.playlists)

  const linkProvider = useMemo(() => detectLinkProvider(url), [url])

  // Плавная open-анимация (вместо ctxIn).
  usePopupOpenAnimation(menuRef, pos)

  // Сброс состояния при каждом открытии.
  useEffect(() => {
    if (open) {
      setView('main')
      setPlName('')
      setUrl('')
      setBusy(false)
      setTarget({ kind: 'create' })
      setTargetOpen(false)
    }
  }, [open])

  // Позицию считаем синхронно после layout — anchorRect к этому моменту валиден.
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPos(null)
      return
    }
    const recalc = () => {
      const a = anchorRef.current
      if (!a) return
      const r = a.getBoundingClientRect()
      // Центрируем попап по горизонтали относительно кнопки «+».
      const W = menuRef.current?.offsetWidth || 248
      const centerX = r.left + r.width / 2
      const left = Math.max(8, Math.min(centerX - W / 2, window.innerWidth - W - 8))
      const top = r.bottom + 6
      // Обновляем pos только при реальном изменении — иначе скролл колесом внутри
      // меню целей пересоздаёт объект pos и перезапускает open-анимацию (мигание).
      setPos((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }))
    }
    recalc()
    window.addEventListener('resize', recalc)
    window.addEventListener('scroll', recalc, true)
    return () => {
      window.removeEventListener('resize', recalc)
      window.removeEventListener('scroll', recalc, true)
    }
  }, [open, anchorRef])

  // Закрытие по клику вне.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (anchorRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      onClose()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open, onClose, anchorRef])

  if (!open || !pos) return null

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

  const selPl =
    target.kind === 'playlist' ? playlists.find((p) => p.id === target.id) ?? null : null

  const targetLabel = (): string => {
    if (target.kind === 'create') return t('lib.import.target.create')
    if (target.kind === 'library') return t('lib.import.target.library')
    if (target.kind === 'favorites') return t('lib.import.target.favorites')
    return playlists.find((p) => p.id === target.id)?.name ?? t('lib.import.target.create')
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

  return createPortal(
    <div
      ref={menuRef}
      id="libAddMenu"
      className={`open${view === 'import' ? ' lam-import' : ''}`}
      style={{ top: pos.top, left: pos.left, right: 'auto' }}
    >
      {view === 'main' ? (
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
                if (e.key === 'Escape') onClose()
              }}
            />
            {plName.trim() && (
              <button className="lam-check" onClick={createPlaylist} aria-label={t('lib.add.namePlaceholder')}>
                <CheckIcon />
              </button>
            )}
          </div>

          <button onClick={() => setView('import')}>
            <Ico name="export" width={13} height={13} />
            {t('lib.add.import')}
            <Ico name="arrowRight" className="lam-chevron" width={11} height={11} />
          </button>

          <button
            onClick={() => {
              onClose()
              folderAdd().catch((e) => console.warn('folderAdd failed', e))
            }}
          >
            <Ico name="folder" width={13} height={13} />
            {t('lib.linkFolder')}
          </button>
        </>
      ) : (
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
                  if (e.key === 'Escape') setView('main')
                }}
              />
              {linkProvider && <ProviderLogo provider={linkProvider} />}
            </div>
            {url.trim() && (
              <button className="lam-check" onClick={() => void runUrlImport()} disabled={busy} aria-label={t('lib.add.import')}>
                {busy ? <span className="lam-spinner" /> : <CheckIcon />}
              </button>
            )}
          </div>

          {/* Цель импорта: Создать / Все треки / существующий плейлист. */}
          <div className="lam-target-wrap">
            <button
              className={`lam-target-btn${targetOpen ? ' open' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setTargetOpen((v) => !v)
              }}
            >
              {selPl ? (
                <PlThumb pl={selPl} />
              ) : target.kind === 'library' ? (
                <AllTracksThumb />
              ) : target.kind === 'favorites' ? (
                <FavThumb />
              ) : (
                <CreateThumb />
              )}
              <span className="lam-target-label">{targetLabel()}</span>
              <Ico name="arrowDown" className="lam-target-caret" width={11} height={11} />
            </button>
            {targetOpen && (
              <div className="lam-target-menu">
                <button
                  className={target.kind === 'create' ? 'active' : undefined}
                  onClick={() => {
                    setTarget({ kind: 'create' })
                    setTargetOpen(false)
                  }}
                >
                  <CreateThumb />
                  <span className="lam-target-label">{t('lib.import.target.create')}</span>
                  {target.kind === 'create' && <ActiveCheck />}
                </button>
                <button
                  className={target.kind === 'library' ? 'active' : undefined}
                  onClick={() => {
                    setTarget({ kind: 'library' })
                    setTargetOpen(false)
                  }}
                >
                  <AllTracksThumb />
                  <span className="lam-target-label">{t('lib.import.target.library')}</span>
                  {target.kind === 'library' && <ActiveCheck />}
                </button>
                <button
                  className={target.kind === 'favorites' ? 'active' : undefined}
                  onClick={() => {
                    setTarget({ kind: 'favorites' })
                    setTargetOpen(false)
                  }}
                >
                  <FavThumb />
                  <span className="lam-target-label">{t('lib.import.target.favorites')}</span>
                  {target.kind === 'favorites' && <ActiveCheck />}
                </button>
                {playlists.length > 0 && <div className="lam-target-sep" />}
                {playlists.map((p) => {
                  const active = target.kind === 'playlist' && target.id === p.id
                  return (
                    <button
                      key={p.id}
                      className={active ? 'active' : undefined}
                      onClick={() => {
                        setTarget({ kind: 'playlist', id: p.id })
                        setTargetOpen(false)
                      }}
                    >
                      <PlThumb pl={p} />
                      <span className="lam-target-label">{p.name}</span>
                      {active && <ActiveCheck />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <button onClick={onImportFile}>
            <Ico name="file" width={13} height={13} />
            {t('lib.import.fromFile')}
          </button>

          <button className="lam-back" onClick={() => setView('main')}>
            <Ico name="arrowLeft" width={13} height={13} />
            {t('common.back')}
          </button>
        </>
      )}
    </div>,
    document.body,
  )
}
