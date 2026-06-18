import { useState } from 'react'
import { invoke } from '@shared/tauri'
import { toast } from '@shared/ui'
import { useT } from '@shared/i18n'
import {
  buildExportAllBundle,
  importPlaylistData,
  exportPlaylistFile,
  importPlaylistFile,
} from '@features/library'
import { useSettingsStore } from '../../model'
import { TeleToggleRow } from '../controls/TeleToggleRow'
import { resetSettings, hardReset } from '../../lib/reset'
import { AboutBlock } from './AboutBlock'
import { LogsViewerModal } from './LogsViewerModal'

/**
 * Секция «Воспроизведение» — флаги AppSettings + Windows autostart.
 */
export const PlaybackSection = () => {
  const t = useT()
  const loaded = useSettingsStore((s) => s.loaded)
  const autostart = useSettingsStore((s) => s.autostart)
  const minimizeToTray = useSettingsStore((s) => s.minimize_to_tray)
  const autoplay = useSettingsStore((s) => s.autoplay)
  const changeTitlebar = useSettingsStore((s) => s.change_titlebar)
  const changeTrayCover = useSettingsStore((s) => s.change_tray_cover)
  const setAutostart = useSettingsStore((s) => s.setAutostart)
  const setMinimizeToTray = useSettingsStore((s) => s.setMinimizeToTray)
  const setAutoplay = useSettingsStore((s) => s.setAutoplay)
  const setChangeTitlebar = useSettingsStore((s) => s.setChangeTitlebar)
  const setChangeTrayCover = useSettingsStore((s) => s.setChangeTrayCover)

  // null → просмотрщик логов закрыт; строка (в т.ч. пустая) → открыт.
  const [logsContent, setLogsContent] = useState<string | null>(null)

  const onResetSettings = () => {
    if (!confirm(t('settings.system.confirm.resetSettings'))) return
    void resetSettings()
  }
  const onHardReset = () => {
    if (!confirm(t('settings.system.confirm.hardReset'))) return
    void hardReset()
  }
  const onExportLogs = async () => {
    try {
      const saved = await invoke<boolean>('export_logs')
      if (saved) toast(t('settings.system.toast.logsSaved'))
    } catch (e) {
      toast(e instanceof Error ? e.message : t('settings.system.toast.logsSaveFail'))
    }
  }
  const onViewLogs = async () => {
    try {
      const text = await invoke<string>('read_logs')
      setLogsContent(text)
    } catch (e) {
      toast(e instanceof Error ? e.message : t('settings.system.toast.logsReadFail'))
    }
  }
  const onClearLogs = async () => {
    if (!confirm(t('settings.system.confirm.clearLogs'))) return
    try {
      await invoke('clear_logs')
      if (logsContent !== null) setLogsContent('')
      toast(t('settings.system.toast.logsCleared'))
    } catch (e) {
      toast(e instanceof Error ? e.message : t('settings.system.toast.logsClearFail'))
    }
  }
  const onExportAll = async () => {
    const data = buildExportAllBundle()
    try {
      await exportPlaylistFile(data, t('settings.system.export.filename'))
    } catch (e) {
      console.warn('exportPlaylistFile failed', e)
    }
  }
  const onImport = async () => {
    const content = await importPlaylistFile().catch(() => null)
    if (!content) return
    const res = importPlaylistData(content)
    if (!res) return toast(t('settings.system.toast.importInvalid'))
    if (res.playlists === 0) return toast(t('settings.system.toast.importNoPlaylists'))
    toast(
      res.tracks
        ? t('settings.system.toast.importedFull', { pl: res.playlists, tr: res.tracks })
        : t('settings.system.toast.importedPlaylists', { pl: res.playlists }),
    )
  }

  return (
    <div className="s-section active" id="ssec-playback">
      {/* «О приложении» + проверка обновлений (свой заголовок s-cat-label внутри). */}
      <AboutBlock />

      <div className="sc">
        <h3>{t('settings.system.startup')}</h3>
        <TeleToggleRow
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
          }
          title={t('settings.system.autostart.title')}
          sub={t('settings.system.autostart.sub')}
          checked={autostart === true}
          disabled={autostart === null}
          onChange={(v) => void setAutostart(v)}
        />
        <TeleToggleRow
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M7 4.5C7 3.4 8.2 2.7 9.1 3.3l12 7.5c.9.5.9 1.9 0 2.4l-12 7.5C8.2 21.3 7 20.6 7 19.5V4.5z" />
            </svg>
          }
          title={t('settings.system.autoplay.title')}
          sub={t('settings.system.autoplay.sub')}
          checked={autoplay}
          disabled={!loaded}
          onChange={(v) => void setAutoplay(v)}
        />
        <TeleToggleRow
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" />
              <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
              <rect x="8" y="8" width="8" height="8" rx="1" />
            </svg>
          }
          title={t('settings.system.tray.title')}
          sub={t('settings.system.tray.sub')}
          checked={minimizeToTray}
          disabled={!loaded}
          onChange={(v) => void setMinimizeToTray(v)}
        />
      </div>

      <div className="sc">
        <h3>{t('settings.system.windowTray')}</h3>
        <TeleToggleRow
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
            </svg>
          }
          title={t('settings.system.titlebarTrack.title')}
          sub={t('settings.system.titlebarTrack.sub')}
          checked={changeTitlebar}
          disabled={!loaded}
          onChange={(v) => void setChangeTitlebar(v)}
        />
        <TeleToggleRow
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="12" cy="12" r="1" fill="currentColor" />
            </svg>
          }
          title={t('settings.system.trayCover.title')}
          sub={t('settings.system.trayCover.sub')}
          checked={changeTrayCover}
          disabled={!loaded}
          onChange={(v) => void setChangeTrayCover(v)}
        />
      </div>

      <div className="sc">
        <h3>{t('settings.system.importExport')}</h3>
        <div className="sr">
          <div className="tele-toggle-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
          </div>
          <div className="tele-toggle-info">
            <div className="tele-toggle-title">{t('settings.system.exportAll.title')}</div>
            <div className="tele-toggle-sub">{t('settings.system.exportAll.sub')}</div>
          </div>
          <button className="btn btg" style={{ flexShrink: 0, fontSize: 11, padding: '4px 12px' }} onClick={onExportAll}>{t('settings.system.exportAll.btn')}</button>
        </div>
        <div className="sr">
          <div className="tele-toggle-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 16 12 21 17 16" /><line x1="12" y1="21" x2="12" y2="9" /></svg>
          </div>
          <div className="tele-toggle-info">
            <div className="tele-toggle-title">{t('settings.system.import.title')}</div>
            <div className="tele-toggle-sub">{t('settings.system.import.sub')}</div>
          </div>
          <button className="btn btg" style={{ flexShrink: 0, fontSize: 11, padding: '4px 12px' }} onClick={onImport}>{t('settings.system.import.btn')}</button>
        </div>
      </div>

      <div className="sc">
        <h3>{t('settings.system.logs')}</h3>
        <div className="sr" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <div>
            <div className="sl2">{t('settings.system.log.title')}</div>
            <div className="ssub">{t('settings.system.log.sub')}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button className="btn btg" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => void onViewLogs()}>{t('settings.system.log.view')}</button>
            <button className="btn btg" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => void onExportLogs()}>{t('settings.system.log.download')}</button>
            <button className="btn btg" style={{ fontSize: 11, padding: '4px 10px', color: '#e03030', borderColor: 'rgba(224,48,48,.4)' }} onClick={() => void onClearLogs()}>{t('settings.system.log.clear')}</button>
          </div>
        </div>
      </div>

      <div className="sc">
        <h3 style={{ color: '#e03030' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e03030" strokeWidth={2} strokeLinecap="round" style={{ marginRight: 6, verticalAlign: 'middle' }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          {t('settings.system.dangerZone')}
        </h3>
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.system.resetSettings.title')}</div>
            <div className="ssub">{t('settings.system.resetSettings.sub')}</div>
          </div>
          <button className="btn btg" style={{ flexShrink: 0, fontSize: 11, padding: '4px 10px', color: '#e03030', borderColor: 'rgba(224,48,48,.4)' }} onClick={onResetSettings}>{t('settings.system.resetSettings.btn')}</button>
        </div>
        <div className="sr" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <div>
            <div className="sl2">{t('settings.system.hardReset.title')}</div>
            <div className="ssub">{t('settings.system.hardReset.sub')}</div>
          </div>
          <button className="btn btg" style={{ flexShrink: 0, fontSize: 11, padding: '4px 10px', color: '#e03030', borderColor: 'rgba(224,48,48,.4)' }} onClick={onHardReset}>{t('settings.system.hardReset.btn')}</button>
        </div>
      </div>

      <LogsViewerModal content={logsContent} onClose={() => setLogsContent(null)} />
    </div>
  )
}
