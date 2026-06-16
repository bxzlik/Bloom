import { useState } from 'react'
import { invoke } from '@shared/tauri'
import { toast } from '@shared/ui'
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
    if (!confirm('Сбросить настройки к значениям по умолчанию?\nБиблиотека и история сохранятся. Окно перезагрузится.')) return
    void resetSettings()
  }
  const onHardReset = () => {
    if (!confirm('Удалить ВСЁ? Треки, плейлисты, история и настройки будут стёрты безвозвратно.')) return
    void hardReset()
  }
  const onExportLogs = async () => {
    try {
      const saved = await invoke<boolean>('export_logs')
      if (saved) toast('Логи сохранены')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось сохранить логи')
    }
  }
  const onViewLogs = async () => {
    try {
      const text = await invoke<string>('read_logs')
      setLogsContent(text)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось прочитать логи')
    }
  }
  const onClearLogs = async () => {
    if (!confirm('Очистить логи? Текущий журнал работы будет удалён.')) return
    try {
      await invoke('clear_logs')
      if (logsContent !== null) setLogsContent('')
      toast('Логи очищены')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось очистить логи')
    }
  }
  const onExportAll = async () => {
    const data = buildExportAllBundle()
    try {
      await exportPlaylistFile(data, 'bloom-плейлисты.bloomplaylist')
    } catch (e) {
      console.warn('exportPlaylistFile failed', e)
    }
  }
  const onImport = async () => {
    const content = await importPlaylistFile().catch(() => null)
    if (!content) return
    const res = importPlaylistData(content)
    if (!res) return toast('Ошибка: невалидный файл')
    if (res.playlists === 0) return toast('Плейлисты не найдены')
    toast(
      res.tracks
        ? `Импортировано: ${res.playlists} пл., ${res.tracks} тр.`
        : `Импортировано плейлистов: ${res.playlists}`,
    )
  }

  return (
    <div className="s-section active" id="ssec-playback">
      {/* «О приложении» + проверка обновлений (свой заголовок s-cat-label внутри). */}
      <AboutBlock />

      <div className="sc">
        <h3>Запуск</h3>
        <TeleToggleRow
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
          }
          title="Запускать при входе в Windows"
          sub="Bloom стартует автоматически при логине"
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
          title="Автовоспроизведение"
          sub="Восстановить трек и позицию воспроизведения при запуске"
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
          title="Сворачивать в трей вместо закрытия"
          sub="Приложение останется работать в фоне"
          checked={minimizeToTray}
          disabled={!loaded}
          onChange={(v) => void setMinimizeToTray(v)}
        />
      </div>

      <div className="sc">
        <h3>Окно и трей</h3>
        <TeleToggleRow
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
            </svg>
          }
          title="Трек в заголовке окна"
          sub="Заменить «Bloom» на «Название — Артист»"
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
          title="Обложка трека в трее"
          sub="Заменять иконку в трее на обложку текущего трека"
          checked={changeTrayCover}
          disabled={!loaded}
          onChange={(v) => void setChangeTrayCover(v)}
        />
      </div>

      <div className="sc">
        <h3>Импорт/Экспорт</h3>
        <div className="sr">
          <div className="tele-toggle-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
          </div>
          <div className="tele-toggle-info">
            <div className="tele-toggle-title">Экспортировать все</div>
            <div className="tele-toggle-sub">Сохранить все плейлисты в файл .bloomplaylist</div>
          </div>
          <button className="btn btg" style={{ flexShrink: 0, fontSize: 11, padding: '4px 12px' }} onClick={onExportAll}>Экспорт</button>
        </div>
        <div className="sr">
          <div className="tele-toggle-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 16 12 21 17 16" /><line x1="12" y1="21" x2="12" y2="9" /></svg>
          </div>
          <div className="tele-toggle-info">
            <div className="tele-toggle-title">Импортировать</div>
            <div className="tele-toggle-sub">Загрузить плейлисты из файла .bloomplaylist</div>
          </div>
          <button className="btn btg" style={{ flexShrink: 0, fontSize: 11, padding: '4px 12px' }} onClick={onImport}>Импорт</button>
        </div>
      </div>

      <div className="sc">
        <h3>Логи</h3>
        <div className="sr" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <div>
            <div className="sl2">Журнал работы</div>
            <div className="ssub">Просмотр, сохранение или очистка логов приложения для диагностики</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button className="btn btg" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => void onViewLogs()}>Посмотреть</button>
            <button className="btn btg" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => void onExportLogs()}>Скачать</button>
            <button className="btn btg" style={{ fontSize: 11, padding: '4px 10px', color: '#e03030', borderColor: 'rgba(224,48,48,.4)' }} onClick={() => void onClearLogs()}>Очистить</button>
          </div>
        </div>
      </div>

      <div className="sc">
        <h3 style={{ color: '#e03030' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e03030" strokeWidth={2} strokeLinecap="round" style={{ marginRight: 6, verticalAlign: 'middle' }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          Опасная зона
        </h3>
        <div className="sr">
          <div>
            <div className="sl2">Сбросить настройки</div>
            <div className="ssub">Вернуть оформление и параметры к значениям по умолчанию</div>
          </div>
          <button className="btn btg" style={{ flexShrink: 0, fontSize: 11, padding: '4px 10px', color: '#e03030', borderColor: 'rgba(224,48,48,.4)' }} onClick={onResetSettings}>Сбросить</button>
        </div>
        <div className="sr" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <div>
            <div className="sl2">Сбросить всё</div>
            <div className="ssub">Удалить треки, плейлисты, историю и настройки</div>
          </div>
          <button className="btn btg" style={{ flexShrink: 0, fontSize: 11, padding: '4px 10px', color: '#e03030', borderColor: 'rgba(224,48,48,.4)' }} onClick={onHardReset}>Сбросить всё</button>
        </div>
      </div>

      <LogsViewerModal content={logsContent} onClose={() => setLogsContent(null)} />
    </div>
  )
}
