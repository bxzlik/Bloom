/**
 * URL локального файла для WebView2 через кастомную схему `bloom-file`
 * (Rust `file_protocol`, отдаёт Range → работает перемотка).
 *
 * `encodeURIComponent` процентит всё, включая `\` и `:` — возвращаем их обратно,
 * чтобы `C:\dir\f.mp3` стал `C:/dir/f.mp3` в пути URL.
 */
const encodePath = (localPath: string): string =>
  encodeURIComponent(localPath).replace(/%5C/gi, '/').replace(/%3A/gi, ':')

export const localFileUrl = (localPath: string): string =>
  `http://bloom-file.localhost/${encodePath(localPath)}`

/**
 * Встроенная обложка того же файла (APIC / covr). Отдаётся тем же протоколом:
 * тащить картинки через IPC вместе со списком треков слишком дорого.
 * Rust ищет этот же префикс, когда нужно скормить обложку Discord/SMTC.
 */
export const localCoverUrl = (localPath: string): string =>
  `${localFileUrl(localPath)}?cover=1`
