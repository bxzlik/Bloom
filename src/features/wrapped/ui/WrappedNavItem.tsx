import { useEffect, useState } from 'react'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'
import { useUiPrefsStore } from '@features/settings'
import { loadPlayLog } from '../model/playLog'
import { useWrappedUiStore } from '../model/wrappedUiStore'
import { buildWrapped, type WrappedData } from '../lib/aggregate'
import { availablePeriods, isPeriodSeen, markPeriodSeen, periodRange, type PeriodKind } from '../lib/periods'
import { WrappedStories } from './WrappedStories'

/**
 * Пункт «Итоги» в сайдбаре — единственная точка входа в истории итогов.
 * Оформлен как обычная вкладка (`.sni`), но никуда не навигирует: открывает
 * полноэкранную историю. Пока итоги не просмотрены — рядом акцентная точка.
 *
 * Появляется ТОЛЬКО когда итоги уместны (понедельник / 1-е число / 21–31 декабря,
 * см. periods.ts) И за период реально что-то слушали. Нет данных — пункта нет,
 * никаких заглушек. Расписание можно отключить тумблером «Показывать всегда»
 * (uiPrefs.wrappedAlways).
 */

interface Ready {
  periods: PeriodKind[]
  data: Partial<Record<PeriodKind, WrappedData>>
}

const dayStamp = (): string => new Date().toDateString()

export const WrappedNavItem = () => {
  const t = useT()
  const show = useUiPrefsStore((s) => s.wrappedShow)
  const always = useUiPrefsStore((s) => s.wrappedAlways)

  const [ready, setReady] = useState<Ready | null>(null)
  // Флаг «история открыта» — в сторе: его читает тайтлбар (метка страницы).
  const open = useWrappedUiStore((s) => s.open)
  const setOpen = useWrappedUiStore((s) => s.setOpen)
  // Пересчёт «просмотренности» после закрытия истории (точка гаснет).
  const [seenTick, setSeenTick] = useState(0)
  // Дата последнего расчёта: приложение может провисеть открытым до понедельника.
  const [day, setDay] = useState(dayStamp)

  // Смена суток при открытом приложении: сверяем дату по возврату фокуса.
  useEffect(() => {
    const check = () => setDay((prev) => (prev === dayStamp() ? prev : dayStamp()))
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [])

  // Журнал перечитывается только при смене этих трёх вещей (тумблеры + сутки) —
  // никакого кеша по ключу: он ломал повторное включение тумблера (ready уже
  // сброшен в null, а ключ прежний → эффект выходил, пункт не возвращался).
  useEffect(() => {
    if (!show) {
      setReady(null)
      return
    }
    // Вне окна показа журнал даже не читаем — это самый частый случай.
    const periods = availablePeriods(new Date(), always)
    if (!periods.length) {
      setReady(null)
      return
    }

    let cancelled = false
    void loadPlayLog().then((log) => {
      if (cancelled) return
      const data: Partial<Record<PeriodKind, WrappedData>> = {}
      const live: PeriodKind[] = []
      for (const k of periods) {
        const d = buildWrapped(log, periodRange(k))
        // Пусто — итогов не существует (см. шапку файла).
        if (d.plays > 0) {
          data[k] = d
          live.push(k)
        }
      }
      // Диагностика: почему пункта нет — окно закрыто или журнал пуст.
      console.debug(
        '[wrapped] окна:', periods.join(),
        '· событий в журнале:', log.events.length,
        '· с данными:', live.map((k) => `${k}=${data[k]!.plays}`).join(' ') || 'нет',
      )
      setReady(live.length ? { periods: live, data } : null)
    })
    return () => {
      cancelled = true
    }
  }, [show, always, day])

  if (!ready) return null

  void seenTick // точка пересчитывается после просмотра
  const unseen = ready.periods.some((k) => !isPeriodSeen(periodRange(k)))

  return (
    <>
      <div
        className={`sni sni-wrapped${unseen ? ' has-new' : ''}`}
        data-p="wrapped"
        onClick={() => setOpen(true)}
      >
        <span className="sni-ico">
          <Ico name="award" width={19} height={19} />
        </span>
        <span className="sni-lbl">{t('wrapped.title')}</span>
        {unseen && <span className="sni-dot" aria-hidden="true" />}
      </div>

      {open && (
        <WrappedStories
          periods={ready.periods}
          data={ready.data}
          onClose={() => setOpen(false)}
          onSeen={(k) => {
            markPeriodSeen(periodRange(k))
            setSeenTick((n) => n + 1)
          }}
        />
      )}
    </>
  )
}
