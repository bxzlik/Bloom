import { useSettingsStore } from '../../model'
import { TeleToggleRow } from '../controls/TeleToggleRow'
import { resetSettings, hardReset } from '../../lib/reset'

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

  const onResetSettings = () => {
    if (!confirm('Сбросить настройки к значениям по умолчанию?\nБиблиотека и история сохранятся. Окно перезагрузится.')) return
    void resetSettings()
  }
  const onHardReset = () => {
    if (!confirm('Удалить ВСЁ? Треки, плейлисты, история и настройки будут стёрты безвозвратно.')) return
    void hardReset()
  }

  return (
    <div className="s-section active" id="ssec-playback">
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
    </div>
  )
}
