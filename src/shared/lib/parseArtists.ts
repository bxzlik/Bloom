/**
 * Разбить строку артистов на отдельные имена (для кликабельных ссылок).
 * Разделители: `,` `&` `×` и слова feat./ft./vs./and. parseArtists.
 */
export const parseArtists = (str?: string | null): string[] => {
  if (!str || str === 'Неизвестный') return [str || 'Неизвестный']
  return str
    .split(/\s*[,&×]\s*|\s+(?:feat\.?|ft\.?|vs\.?|and)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
}
