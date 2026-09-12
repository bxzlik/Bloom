import { useEffect, useRef, useState } from 'react'
import { invoke } from '@shared/tauri'
import { toast } from '@shared/ui'
import { useT } from '@shared/i18n'
import type { TranslationKey } from '@shared/i18n'
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
import { Ico } from '@shared/ui/icons/solar'
import type { IconName } from '@shared/ui/icons/solar'

/** Опасные действия раздела — у каждого своё «взведённое» состояние. */
type ArmKey = 'clearLogs' | 'resetSettings' | 'hardReset'

/**
 * Секция «Воспроизведение» — флаги AppSettings + Windows autostart.
 */
export const PlaybackSection = () => {
  const t = useT()
  const loaded = useSettingsStore((s) => s.loaded)
  const autostart = useSettingsStore((s) => s.autostart)
  const minimizeToTray = useSettingsStore((s) => s.minimize_to_tray)
  const changeTitlebar = useSettingsStore((s) => s.change_titlebar)
  const changeTrayCover = useSettingsStore((s) => s.change_tray_cover)
  const setAutostart = useSettingsStore((s) => s.setAutostart)
  const setMinimizeToTray = useSettingsStore((s) => s.setMinimizeToTray)
  const setChangeTitlebar = useSettingsStore((s) => s.setChangeTitlebar)
  const setChangeTrayCover = useSettingsStore((s) => s.setChangeTrayCover)

  // null → просмотрщик логов закрыт; строка (в т.ч. пустая) → открыт.
  const [logsContent, setLogsContent] = useState<string | null>(null)

  // Двойное подтверждение вместо confirm(): первое нажатие «взводит» кнопку
  // (красная заливка + «Точно?») на 3 с, второе выполняет. Взведена всегда
  // только одна — нажатие на другую опасную кнопку перехватывает таймер.
  const [armed, setArmed] = useState<ArmKey | null>(null)
  const armTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(armTimer.current), [])
  const confirmTwice = (key: ArmKey, run: () => void) => () => {
    window.clearTimeout(armTimer.current)
    if (armed !== key) {
      setArmed(key)
      armTimer.current = window.setTimeout(() => setArmed(null), 3000)
      return
    }
    setArmed(null)
    run()
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

  // Кнопки строк — только иконка; бывшая подпись остаётся в aria-label.
  const icoBtn = (icon: IconName, label: TranslationKey, onClick: () => void) => (
    <button className="s-ibtn" aria-label={t(label)} onClick={onClick}>
      <Ico name={icon} size={16} />
    </button>
  )
  const dangerBtn = (key: ArmKey, icon: IconName, label: TranslationKey, run: () => void) => (
    <button
      className={`s-ibtn danger${armed === key ? ' armed' : ''}`}
      aria-label={t(label)}
      onClick={confirmTwice(key, run)}
    >
      <Ico name={icon} size={16} />
      {armed === key && <span>{t('settings.system.confirmAgain')}</span>}
    </button>
  )

  return (
    <div className="s-section active" id="ssec-playback">
      {/* «О приложении» + проверка обновлений (свой заголовок s-cat-label внутри). */}
      <AboutBlock />

      <div className="s-cat-label">{t('settings.system.startup')}</div>
      <div className="sc">
        <TeleToggleRow
          title={t('settings.system.autostart.title')}
          sub={t('settings.system.autostart.sub')}
          checked={autostart === true}
          disabled={autostart === null}
          onChange={(v) => void setAutostart(v)}
        />
        {/* «Восстановление очереди» + «Автовоспроизведение» живут в разделе
            «Аудио» (AudioSection): вторая — вложенная настройка первой. */}
        <TeleToggleRow
          title={t('settings.system.tray.title')}
          sub={t('settings.system.tray.sub')}
          checked={minimizeToTray}
          disabled={!loaded}
          onChange={(v) => void setMinimizeToTray(v)}
        />
      </div>

      <div className="s-cat-label">{t('settings.system.windowTray')}</div>
      <div className="sc">
        <TeleToggleRow
          title={t('settings.system.titlebarTrack.title')}
          sub={t('settings.system.titlebarTrack.sub')}
          checked={changeTitlebar}
          disabled={!loaded}
          onChange={(v) => void setChangeTitlebar(v)}
        />
        <TeleToggleRow
          title={t('settings.system.trayCover.title')}
          sub={t('settings.system.trayCover.sub')}
          checked={changeTrayCover}
          disabled={!loaded}
          onChange={(v) => void setChangeTrayCover(v)}
        />
      </div>

      <div className="s-cat-label">{t('settings.system.importExport')}</div>
      <div className="sc">
        <div className="sr">
          <div className="tele-toggle-info">
            <div className="tele-toggle-title">{t('settings.system.exportAll.title')}</div>
            <div className="tele-toggle-sub">{t('settings.system.exportAll.sub')}</div>
          </div>
          {icoBtn('export', 'settings.system.exportAll.btn', () => void onExportAll())}
        </div>
        <div className="sr">
          <div className="tele-toggle-info">
            <div className="tele-toggle-title">{t('settings.system.import.title')}</div>
            <div className="tele-toggle-sub">{t('settings.system.import.sub')}</div>
          </div>
          {icoBtn('import', 'settings.system.import.btn', () => void onImport())}
        </div>
      </div>

      <div className="s-cat-label">{t('settings.system.logs')}</div>
      <div className="sc">
        <div className="sr" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <div>
            <div className="sl2">{t('settings.system.log.title')}</div>
            <div className="ssub">{t('settings.system.log.sub')}</div>
          </div>
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            {icoBtn('eye', 'settings.system.log.view', () => void onViewLogs())}
            {icoBtn('download', 'settings.system.log.download', () => void onExportLogs())}
            {dangerBtn('clearLogs', 'trash', 'settings.system.log.clear', () => void onClearLogs())}
          </div>
        </div>
      </div>

      {/* Красная подпись группы: тот же заголовок, что и остальные, цвет —
          инлайном, чтобы не заводить класс ради одного места. */}
      <div className="s-cat-label" style={{ color: '#e03030' }}>
        <Ico name="danger" width={13} height={13} />
        {t('settings.system.dangerZone')}
      </div>
      <div className="sc">
        <div className="sr">
          <div>
            <div className="sl2">{t('settings.system.resetSettings.title')}</div>
            <div className="ssub">{t('settings.system.resetSettings.sub')}</div>
          </div>
          {dangerBtn('resetSettings', 'restart', 'settings.system.resetSettings.btn', () => void resetSettings())}
        </div>
        <div className="sr" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <div>
            <div className="sl2">{t('settings.system.hardReset.title')}</div>
            <div className="ssub">{t('settings.system.hardReset.sub')}</div>
          </div>
          {dangerBtn('hardReset', 'trash', 'settings.system.hardReset.btn', () => void hardReset())}
        </div>
      </div>

      <LogsViewerModal content={logsContent} onClose={() => setLogsContent(null)} />
    </div>
  )
}
