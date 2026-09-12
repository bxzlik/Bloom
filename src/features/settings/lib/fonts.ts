/**
 * Каталог шрифтов интерфейса. Три встроенных, все работают офлайн:
 *  - Inter (по умолчанию) и Minecraft Rus встроены в приложение — файлы в
 *    shared/assets/fonts, @font-face в shared/styles/fonts.css;
 *  - Comic Sans MS — системный, есть в любой Windows (встроить нельзя: платный).
 *
 * Раньше здесь было ~95 шрифтов с подгрузкой с Google Fonts: без сети они не
 * работали, после перезапуска не подгружались до открытия настроек, у трети
 * не было кириллицы, шрифты macOS в Windows не существуют вовсе. Добавляя
 * шрифт в ЭТОТ список — только встроенный файлом или системный из чистой Windows.
 *
 * Сверх каталога человек грузит свои файлы (lib/userFonts.ts): они хранятся
 * копией внутри приложения и тоже работают офлайн.
 */

import { loadUserFontMeta, userFontValue } from './userFonts'

export interface FontDef {
  name: string
  val: string
}

export const FONTS: FontDef[] = [
  { name: 'Inter', val: "'Inter',system-ui,sans-serif" },
  { name: 'Minecraft', val: "'Minecraft Rus',monospace" },
  { name: 'Comic Sans', val: "'Comic Sans MS',cursive" },
]

export const DEFAULT_FONT = FONTS[0].val

/** Первое семейство из CSS-значения font-family, без кавычек. */
const firstFamily = (v: string): string =>
  (v ?? '').split(',')[0].trim().replace(/^['"]|['"]$/g, '')

/** Шрифты, заменённые другими: сохранённый выбор переезжает, а не сбрасывается. */
const REPLACED: Record<string, string> = { Monocraft: 'Minecraft Rus' }

/**
 * Семейства своих шрифтов — чтобы normalizeFont их не принимал за мусор.
 * Инициализируется лениво из localStorage (СИНХРОННО: normalizeFont успевает
 * отработать раньше, чем ответит IDB) и обновляется стором при добавлении и
 * удалении, чтобы не перечитывать localStorage на каждый вызов.
 */
let userFamilies: Set<string> | null = null

const knownUserFamilies = (): Set<string> => {
  if (!userFamilies) userFamilies = new Set(loadUserFontMeta().map((m) => m.family))
  return userFamilies
}

/** Пересобрать список своих семейств (вызывает userFontsStore после изменений). */
export const setUserFontFamilies = (families: string[]): void => {
  userFamilies = new Set(families)
}

/**
 * Сохранённое значение → каталожное. Сравнение по первому семейству, так что
 * старое `Inter, system-ui, sans-serif` без кавычек тоже узнаётся. Шрифты,
 * которых больше нет в каталоге (и свои, которых больше нет в хранилище), и
 * мусор → Inter: иначе у человека молча включился бы случайный запасной шрифт.
 */
export const normalizeFont = (v: unknown): string => {
  if (typeof v !== 'string') return DEFAULT_FONT
  const fam = REPLACED[firstFamily(v)] ?? firstFamily(v)
  if (knownUserFamilies().has(fam)) return userFontValue(fam)
  return FONTS.find((f) => firstFamily(f.val) === fam)?.val ?? DEFAULT_FONT
}

/** Первое семейство из значения font-family — для сравнения выбранного шрифта. */
export const fontFamilyOf = firstFamily
