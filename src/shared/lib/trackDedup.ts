/**
 * «Это тот же трек?» — общий детектор дублей.
 *
 * Зачем отдельно от матчера площадок (`features/providers/lib/match`): тот
 * отвечает на вопрос «какой из кандидатов лучше подходит под исходник» и живёт
 * в фиче. Здесь вопрос другой и более узкий — «этот трек уже есть в списке»,
 * и спрашивают его из мест ниже слоя фич (движок волны, витрина главной).
 * Нормализация у обоих общая и лежит здесь же.
 *
 * Ловим прежде всего реаплоады SoundCloud: один и тот же трек залит разными
 * пользователями, id разные, и дедуп по id их не видит. Типичный вид —
 * загрузчик утаскивает имя автора в заголовок:
 *
 *   «целоваться»            — lightprey
 *   «lightprey - целоваться» — クリソライト
 *
 * Ключевой приём: сравниваем не «название против названия», а ОБЩИЙ мешок из
 * названия и артиста. Тогда перенос имени автора между полями перестаёт что-то
 * значить, и обе записи выше дают один и тот же набор токенов.
 */

/** Нормализация: lower, ё→е, без скобочных уточнений, только буквы/цифры. */
export const normText = (s: string): string =>
  (s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim()

/**
 * Шумовые слова, которые сами по себе не делают трек другим.
 * `prod`/`feat` важны особенно: у реаплоадов они разбросаны как попало.
 *
 * Список намеренно короткий и совпадает с тем, на котором давно работает
 * матчер площадок. Расширять его рискованно: «free», «out», «now» — вполне
 * себе настоящие названия треков, и вычёркивание таких слов превратило бы
 * короткое название в пустой набор токенов.
 */
const NOISE = new Set([
  'feat', 'ft', 'featuring', 'prod', 'by', 'the', 'a', 'an', 'and', 'и',
  'official', 'audio', 'video', 'lyrics', 'hd', 'hq',
  'remaster', 'remastered', 'version', 'edition', 'bonus', 'track',
])

/** Значимые токены строки (без шума и пустот). */
export const textTokens = (s: string): string[] =>
  normText(s).split(' ').filter((w) => w && !NOISE.has(w))

/** «m:ss» / «h:mm:ss» → секунды (0 — длительность неизвестна). */
export const durToSec = (d: string | undefined): number => {
  const parts = (d || '').split(':').map(Number)
  if (!parts.length || parts.some(Number.isNaN)) return 0
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}

/** Доля меньшего множества, попавшая в большее (0..1). */
export const containment = (a: Set<string>, b: Set<string>): number => {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / Math.min(a.size, b.size)
}

/**
 * Минимальная форма трека, которой хватает для сравнения. Длительность берём
 * либо строкой («m:ss», как в `Track`), либо числом секунд (как приходит от
 * площадок) — что есть у вызывающего.
 */
export interface DedupInput {
  name: string
  artist: string
  dur?: string
  sec?: number
}

/** Разобранный трек: точный ключ + мешки токенов + длительность. */
export interface TrackFingerprint {
  /** Точный ключ по общему мешку — быстрый путь для полностью совпавших пар. */
  key: string
  /** Название + артист одним множеством: см. шапку модуля. */
  core: Set<string>
  /** Только название — главный признак реаплоада, см. `sameTrack`. */
  title: Set<string>
  /** Ключ по одному названию (для сравнения названий на равенство). */
  titleKey: string
  sec: number
}

export const fingerprint = (t: DedupInput): TrackFingerprint => {
  const name = textTokens(t.name)
  const artist = textTokens(t.artist)
  const core = new Set([...name, ...artist])
  const title = new Set(name)
  return {
    key: `${[...core].sort().join(' ')}`,
    core,
    title,
    titleKey: [...title].sort().join(' '),
    sec: durToSec(t.dur) || Math.round(t.sec ?? 0),
  }
}

/**
 * Насколько сходятся мешки, чтобы счесть треки одним и тем же.
 * 0.85 выбран по разрыву между случаями: реаплоад того же трека даёт 1.0
 * (мешки совпадают целиком), а два РАЗНЫХ трека одного артиста — не больше
 * ~0.67 (общее только имя артиста).
 */
const CORE_MIN = 0.85
/** Расхождение длительности, в пределах которого это ещё «тот же трек», сек. */
const DUR_TOLERANCE = 5
/**
 * Тот же допуск, но для пар с ПОЛНОСТЬЮ совпавшим названием. Шире, потому что
 * реаплоады переживают перекодировку, вступление от загрузчика и тишину в
 * конце: у одного и того же трека разница в 10-15 секунд — обычное дело.
 */
const DUR_TOLERANCE_SAME_TITLE = 25
/**
 * Мешок из одного токена контейнментом совпадёт с чем угодно, поэтому нечёткий
 * путь требует хотя бы двух значимых слов.
 */
const CORE_MIN_TOKENS = 2
/**
 * Сколько значимых слов делают название достаточно «своим», чтобы полное
 * совпадение нельзя было списать на случай. «I love you» — можно, а
 * «Серега пират team spirit» — уже нет.
 */
const TITLE_RICH_TOKENS = 4

/**
 * Один ли это трек. Три пути, от самого надёжного к самому осторожному.
 *
 * 1. Совпал общий мешок «название + артист» — тот же трек, вопросов нет. Сюда
 *    же попадает реаплоад, у которого имя автора переехало в заголовок, а имя
 *    загрузчика вычистилось нормализацией.
 * 2. Совпало НАЗВАНИЕ целиком. Это главный признак реаплоада: заголовок
 *    копируют дословно, а вот имя загрузчика произвольное и мешку только
 *    мешает. Длинное название совпасть случайно не может — верим сразу;
 *    короткое («sleep mode») дополнительно сверяем по длительности.
 * 3. Названия лишь похожи — тогда нужен и сходящийся мешок, и близкая
 *    длительность.
 *
 * Длительность везде работает предохранителем: не знаем её — не пускаем
 * нестрогие пути.
 */
export const sameTrack = (a: TrackFingerprint, b: TrackFingerprint): boolean => {
  if (a.key && a.key === b.key) return true

  const dur = a.sec && b.sec ? Math.abs(a.sec - b.sec) : null

  if (a.titleKey && a.titleKey === b.titleKey) {
    const rich = Math.min(a.title.size, b.title.size) >= TITLE_RICH_TOKENS
    if (rich) return true
    return dur !== null && dur <= DUR_TOLERANCE_SAME_TITLE
  }

  if (dur === null || dur > DUR_TOLERANCE) return false
  if (Math.min(a.core.size, b.core.size) < CORE_MIN_TOKENS) return false
  return containment(a.core, b.core) >= CORE_MIN
}

/**
 * Накопитель уникальных треков: `accept` возвращает false, если такой трек уже
 * принимали или заранее пометили через `add`.
 *
 * Помеченного бывает много — вся библиотека и всё слышанное, тысячи треков, —
 * поэтому нечёткое сравнение идёт не перебором, а только по отпечаткам с общим
 * словом. Это не приближение: каждый путь `sameTrack` требует хотя бы одного
 * общего токена в мешке, остальные совпасть не могут в принципе.
 */
export class DupGuard {
  private keys = new Set<string>()
  private byToken = new Map<string, TrackFingerprint[]>()

  /** Заранее пометить трек как «уже есть» (очередь, библиотека, журнал) без выдачи. */
  add(t: DedupInput): void {
    this.remember(fingerprint(t))
  }

  /** Принять трек, если он новый. */
  accept(t: DedupInput): boolean {
    const fp = fingerprint(t)
    if (!fp.key) return true // нечего сравнивать (пустые поля) — пропускаем
    if (this.keys.has(fp.key)) return false
    const checked = new Set<TrackFingerprint>()
    for (const w of fp.core) {
      for (const p of this.byToken.get(w) ?? []) {
        if (checked.has(p)) continue
        checked.add(p)
        if (sameTrack(fp, p)) return false
      }
    }
    this.remember(fp)
    return true
  }

  private remember(fp: TrackFingerprint): void {
    if (!fp.key) return // пустой мешок ни с чем не совпадёт
    this.keys.add(fp.key)
    for (const w of fp.core) {
      const bucket = this.byToken.get(w)
      if (bucket) bucket.push(fp)
      else this.byToken.set(w, [fp])
    }
  }
}
