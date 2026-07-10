import { useEffect, useState } from 'react'
import { folderAdd, folderGet } from '@features/library'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'
import { PlatformsBlock } from './PlatformsBlock'

/**
 * Слайд «Подключи музыку»: локальные папки + аккордеон площадок.
 *
 * В отличие от профиля и темы, всё на этом слайде коммитится сразу — `folderAdd`
 * уходит в Rust и запускает watcher, токены площадок пишутся в конфиг. Откатить
 * это кнопкой «Назад» нельзя, поэтому шаг целиком необязательный.
 */
const baseName = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p

export const LibrarySlide = () => {
  const t = useT()
  const [folders, setFolders] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    folderGet()
      .then(setFolders)
      .catch(() => setFolders([]))
  }, [])

  const pick = async () => {
    if (busy) return
    setBusy(true)
    try {
      await folderAdd()
      setFolders(await folderGet())
    } catch (e) {
      console.warn('onboarding folderAdd failed', e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ob-body">
      <div className="ob-title">{t('onb.library.title')}</div>
      <div className="ob-sub">{t('onb.library.sub')}</div>

      <div className="ob-group-label">
        <Ico name="folder" width={11} height={11} />
        {t('onb.music.local')}
      </div>

      {folders.length > 0 && (
        <div className="ob-folders">
          {folders.map((f) => (
            <div className="ob-folder" key={f}>
              <Ico name="folder" width={15} height={15} style={{ color: 'var(--text2,#999)', flexShrink: 0 }} />
              <div className="ob-folder-name">{baseName(f)}</div>
              <Ico name="check" width={14} height={14} className="ob-folder-check" />
            </div>
          ))}
        </div>
      )}

      <button className="ob-btn ob-btn-outline" onClick={pick} disabled={busy}>
        <Ico name={busy ? 'refresh' : 'add'} width={15} height={15} />
        {folders.length ? t('onb.library.pickMore') : t('onb.library.pick')}
      </button>

      <div className="ob-group-label ob-group-label-gap">
        <Ico name="wave" width={11} height={11} />
        {t('onb.music.platforms')}
      </div>

      <PlatformsBlock />

      <div className="ob-hint">{t('onb.library.skip')}</div>
    </div>
  )
}
