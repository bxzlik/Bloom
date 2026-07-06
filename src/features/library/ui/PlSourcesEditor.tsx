import { useState } from 'react'
import { useT } from '@shared/i18n'
import { toast } from '@shared/ui'
import { Ico } from '@shared/ui/icons/solar'
import { ScLogo, YmLogo, YtmLogo, SpLogo, providerBrandColor } from '@entities/track'
import type { PlSourceRef } from '../model'
import {
  resolveCollectionUrl,
  detectLinkProvider,
  samePlSource,
  type LinkProvider,
} from '../lib'

/** Лого площадки в бренд-цвете (по виду ссылки; scLikes — всегда SC). */
const SrcLogo = ({ provider }: { provider: LinkProvider | null }) => {
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
    <span
      className="pl-src-logo"
      style={{ color: providerBrandColor(provider ?? 'soundcloud') }}
    >
      {logo}
    </span>
  )
}

/**
 * Секция «Источники обновления» большого редактора плейлиста.
 *
 * Показывает привязанные источники (плейлисты/альбомы/лайки любых площадок)
 * и позволяет добавить новый вставкой ссылки: по «+» ссылка резолвится как
 * при импорте (`resolveCollectionUrl`) — так проверяем, что это коллекция,
 * и забираем её название для списка. Черновик живёт у родителя (LibContent)
 * и сохраняется только по галочке редактора.
 */
export const PlSourcesEditor = ({
  sources,
  onChange,
  closing,
}: {
  sources: PlSourceRef[]
  onChange: (next: PlSourceRef[]) => void
  /** Выход из редактора: fade-out перед размонтированием (см. LibContent). */
  closing?: boolean
}) => {
  const t = useT()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const linkProvider = detectLinkProvider(url)

  const addSource = async () => {
    const u = url.trim()
    if (!u || busy) return
    setBusy(true)
    try {
      const res = await resolveCollectionUrl(u)
      const ref: PlSourceRef = { kind: 'url', url: res.sourceUrl ?? u, title: res.title }
      if (sources.some((s) => samePlSource(s, ref))) {
        toast(t('lib.pledit.dupSource'))
        return
      }
      onChange([...sources, ref])
      setUrl('')
    } catch (e) {
      toast(e instanceof Error ? e.message : t('lib.import.toast.unresolved'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`pl-edit-body${closing ? ' is-closing' : ''}`}>
      <div className="pl-src-head">{t('lib.pledit.sources')}</div>
      <div className="pl-src-hint">{t('lib.pledit.sourcesHint')}</div>

      {sources.length > 0 && (
        <div className="pl-src-list">
          {sources.map((s, i) => {
            const isUrl = s.kind === 'url'
            const sub = isUrl ? s.url : t('lib.pledit.scLikes')
            return (
              <div className="pl-src-row" key={isUrl ? s.url : `likes_${s.userId}`}>
                <SrcLogo provider={isUrl ? detectLinkProvider(s.url) : null} />
                <div className="pl-src-txt">
                  <div className="pl-src-title">{s.title ?? sub}</div>
                  {s.title && <div className="pl-src-sub">{sub}</div>}
                </div>
                <button
                  type="button"
                  className="pl-src-rmv"
                  aria-label={t('lib.pledit.removeSource')}
                  onClick={() => onChange(sources.filter((_, j) => j !== i))}
                >
                  <Ico name="close" width={11} height={11} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="pl-src-add">
        <div className="pl-src-inp-wrap">
          <input
            type="text"
            className="pl-src-inp"
            value={url}
            placeholder={t('lib.pledit.addPlaceholder')}
            spellCheck={false}
            autoComplete="off"
            disabled={busy}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addSource()
            }}
          />
          {linkProvider && <SrcLogo provider={linkProvider} />}
        </div>
        <button
          type="button"
          className="pl-src-add-btn"
          onClick={() => void addSource()}
          disabled={busy || !url.trim()}
        >
          {busy ? <span className="pl-src-spinner" /> : <Ico name="add" width={14} height={14} />}
          {t('lib.pledit.addSource')}
        </button>
      </div>
    </div>
  )
}
