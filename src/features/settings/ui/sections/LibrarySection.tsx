import { useUiPrefsStore } from '../../model/uiPrefsStore'
import { useSettingsStore } from '../../model/settingsStore'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Раздел «Библиотека» (`#ssec-library`). Вынесен из «Интерфейса»
 * (категория «БИБЛИОТЕКА»): вид библиотеки (список/сетка), плотность треклиста,
 * видимость колонок «Альбом» / «Добавлено», режим хранения локальных файлов.
 *
 * i18n-ключи вида библиотеки остались в namespace `settings.interface.lib*`
 * (см. dict.ts) — их не переносили, чтобы не плодить дубликаты; поиск по
 * вкладкам сопоставляет их этой секции через SEARCH_RULES (SettingsNav).
 */
export const LibrarySection = () => {
  const t = useT()
  const p = useUiPrefsStore()
  const importMode = useSettingsStore((s) => s.local_import_mode)
  const setImportMode = useSettingsStore((s) => s.setLocalImportMode)

  return (
    <div className="s-section active" id="ssec-library">
      <div className="s-section-head">
        <div className="s-section-title">
          <Ico name="library" width={15} height={15} />{' '}
          {t('settings.nav.library')}
        </div>
        <button className="s-section-reset" onClick={() => p.reset()}>
          <Ico name="refresh" width={10} height={10} />{' '}
          {t('common.reset')}
        </button>
      </div>

      <div className="sc sc-keep">
        <div className="sc-title">{t('settings.library.import.title')}</div>
        <div className="sc-desc">{t('settings.library.import.desc')}</div>
        <div className="s-opt-row">
          <TipBtn
            active={importMode === 'inPlace'}
            tip={t('settings.library.import.inPlaceTip')}
            onClick={() => void setImportMode('inPlace')}
          >
            <Ico name="folder" width={20} height={20} />
            {t('settings.library.import.inPlace')}
          </TipBtn>
          <TipBtn
            active={importMode === 'copy'}
            tip={t('settings.library.import.copyTip')}
            onClick={() => void setImportMode('copy')}
          >
            <Ico name="download" width={20} height={20} />
            {t('settings.library.import.copy')}
          </TipBtn>
        </div>
      </div>

      <div className="sc sc-keep">
        <div className="sc-title">{t('settings.interface.libView.title')}</div>
        <div className="sc-desc">{t('settings.interface.libView.desc')}</div>
        <div className="s-opt-row">
          <OptBtn active={p.libView === 'list'} onClick={() => p.set('libView', 'list')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="3" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="3" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="3" cy="18" r="1" fill="currentColor" stroke="none" /></svg>
            {t('settings.interface.libView.list')}
          </OptBtn>
          <OptBtn active={p.libView === 'grid'} onClick={() => p.set('libView', 'grid')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
            {t('settings.interface.libView.grid')}
          </OptBtn>
        </div>
      </div>
      <div className="sc sc-keep">
        <div className="sc-title">{t('settings.interface.libDensity.title')}</div>
        <div className="sc-desc">{t('settings.interface.libDensity.desc')}</div>
        <div className="s-opt-row">
          <OptBtn active={p.libDensity === 'comfortable'} onClick={() => p.set('libDensity', 'comfortable')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>
            {t('settings.interface.libDensity.comfortable')}
          </OptBtn>
          <OptBtn active={p.libDensity === 'compact'} onClick={() => p.set('libDensity', 'compact')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="10" x2="20" y2="10" /><line x1="4" y1="14" x2="20" y2="14" /><line x1="4" y1="18" x2="20" y2="18" /></svg>
            {t('settings.interface.libDensity.compact')}
          </OptBtn>
        </div>
      </div>
      <div className="sc">
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.interface.libCols.album')}</div>
            <div className="ssub">{t('settings.interface.libCols.albumSub')}</div>
          </div>
          <Toggle checked={p.libColAlbum} onChange={(v) => p.set('libColAlbum', v)} />
        </div>
      </div>
      <div className="sc">
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.interface.libCols.date')}</div>
            <div className="ssub">{t('settings.interface.libCols.dateSub')}</div>
          </div>
          <Toggle checked={p.libColDate} onChange={(v) => p.set('libColDate', v)} />
        </div>
      </div>
    </div>
  )
}

const OptBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button className={`s-opt-btn ${active ? 'bta' : 'btg'}`} onClick={onClick}>
    {children}
  </button>
)

/**
 * OptBtn с всплывающей подсказкой над кнопкой. Своя, а не браузерная: нативные
 * title-тултипы в интерфейсе не используем.
 */
const TipBtn = ({
  active,
  tip,
  onClick,
  children,
}: {
  active: boolean
  tip: string
  onClick: () => void
  children: React.ReactNode
}) => (
  <div className="s-opt-tipwrap">
    <OptBtn active={active} onClick={onClick}>
      {children}
    </OptBtn>
    <span className="s-opt-tip" role="tooltip">
      {tip}
    </span>
  </div>
)

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="tele-sw">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="tele-sw-track" />
  </label>
)
