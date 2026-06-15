/**
 * Парсит строку артистов:
 *  "Artist A, Artist B feat. Artist C & Artist D"
 *  → ["Artist A","Artist B","Artist C","Artist D"]
 *
 * Поддерживаемые разделители:, ; & feat. ft. x × with и
 */
export const parseArtists = (s: string | null | undefined): string[] => {
  if (!s) return []
  return String(s)
    .split(/\s*(?:,|;|&|feat\.?|ft\.?|x|×|with|и)\s+/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}
