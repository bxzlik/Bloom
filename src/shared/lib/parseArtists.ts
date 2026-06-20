import { t } from '@shared/i18n'

/**
 * Разбить строку артистов на отдельные имена (для кликабельных ссылок).
 * Разделители: `,` `&` `×` и слова feat./ft./vs./and. parseArtists.
 */
export const parseArtists = (str?: string | null): string[] => {
  const unknown = t('common.unknownArtist')
  if (!str || str === unknown) return [str || unknown]
  return str
    .split(/\s*[,&×]\s*|\s+(?:feat\.?|ft\.?|vs\.?|and)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
}
