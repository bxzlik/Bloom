import { cn } from '@shared/lib/cn'
import { copyPath, revealPath } from '@shared/lib/pathActions'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

/**
 * Строка с путём к локальному файлу/папке: клик по тексту открывает проводник,
 * иконка справа копирует путь в буфер.
 *
 * Копирование вынесено в отдельную кнопку, а не на ПКМ: шапка библиотеки уже
 * ловит contextmenu, чтобы открыть PlMenu.
 *
 * Стили — `.path-line*` в track-modals.css. `className` задаёт «одежду» слота
 * (`.ti-val` / `.lib-hero-desc`), компаунды там же решают перенос vs ellipsis.
 */
export const PathLine = ({
  path,
  kind,
  className,
  id,
}: {
  path: string
  /** Файл выделяем в родительской папке, папку — открываем саму. */
  kind: 'file' | 'folder'
  className?: string
  id?: string
}) => {
  const t = useT()
  return (
    <div className={cn('path-line', className)} id={id}>
      <span
        className="path-line-txt"
        role="button"
        tabIndex={0}
        onClick={() => revealPath(path, kind)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            revealPath(path, kind)
          }
        }}
      >
        {path}
      </span>
      <button
        type="button"
        className="path-line-copy"
        aria-label={t('lib.path.copy')}
        onClick={(e) => {
          e.stopPropagation()
          copyPath(path)
        }}
      >
        <Ico name="copy" width={11} height={11} />
      </button>
    </div>
  )
}
