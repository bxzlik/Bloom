import { toast } from '@shared/ui'
import {
  buildExportAllBundle,
  importPlaylistData,
  exportPlaylistFile,
  importPlaylistFile,
} from '@features/library'

/**
 * Секция «Данные» (`ssec-data`) —: только импорт/
 * экспорт плейлистов в `.bloomplaylist`.
 *
 * Прочие пункты, которые временно жили здесь в bloom-MVP (кеш текстов, сброс
 * темы, очистка истории), переезжают в свои разделы: тогглы хранения и очистка
 * — в «Телеметрию», сброс — в «Сброс».
 */
export const DataSection = () => {
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
    <div className="s-section active" id="ssec-data">
      <div className="s-section-head">
        <div className="s-section-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M9 3v12" /><path d="m5 11 4 4 4-4" /><path d="M15 21V9" /><path d="m11 13 4-4 4 4" /></svg>{' '}
          Импорт/Экспорт
        </div>
      </div>

      <div className="sc sc-keep">
        <h3>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" style={{ marginRight: 6, verticalAlign: 'middle', opacity: 0.7 }}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
          Плейлисты
        </h3>
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
        <div className="sr" style={{ borderBottom: 'none', paddingBottom: 0 }}>
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
    </div>
  )
}
