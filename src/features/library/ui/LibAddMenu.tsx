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

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

/** Цель «Создать» — плюс в 22px-боксе (чтобы метки строк выровнялись по тумбам). */
const CreateThumb = () => (
  <span className="lam-icon-box">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  </span>
)

/** Цель «Все треки» — фирменная обложка раздела (синий градиент + нота). */
const AllTracksThumb = () => (
  <span className="lam-all-thumb">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round">
      <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
    </svg>
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
  <svg className="lam-active-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
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
      setPos({ top: r.bottom + 6, left })
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
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {t('lib.add.import')}
            <svg className="lam-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          <button
            onClick={() => {
              onClose()
              folderAdd().catch((e) => console.warn('folderAdd failed', e))
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
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
              ) : (
                <CreateThumb />
              )}
              <span className="lam-target-label">{targetLabel()}</span>
              <svg className="lam-target-caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
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
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            {t('lib.import.fromFile')}
          </button>

          <button className="lam-back" onClick={() => setView('main')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {t('common.back')}
          </button>
        </>
      )}
    </div>,
    document.body,
  )
}
