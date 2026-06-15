/**
 * Каталог шрифтов интерфейса `_fontCats` + `_ensureFontLoaded`
 *. 7 категорий; Google-шрифты подгружаются динамически
 * (вставкой <link>) при первом показе/выборе.
 */

export interface FontDef {
  name: string
  val: string
}

export type FontCat = 'system' | 'modern' | 'serif' | 'mono' | 'hand' | 'deco' | 'game'

export const FONT_CAT_LABELS: { id: FontCat; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'modern', label: 'Modern' },
  { id: 'serif', label: 'Serif' },
  { id: 'mono', label: 'Mono' },
  { id: 'hand', label: 'Hand' },
  { id: 'deco', label: 'Deco' },
  { id: 'game', label: 'Game' },
]

export const FONT_CATS: Record<FontCat, FontDef[]> = {
  system: [
    { name: 'Default', val: "-apple-system,'SF Pro Display','SF Pro Text','Segoe UI','Roboto',system-ui,sans-serif" },
    { name: 'Inter', val: "'Inter',system-ui,sans-serif" },
    { name: 'Arial', val: "'Arial',sans-serif" },
    { name: 'Segoe UI', val: "'Segoe UI',system-ui,sans-serif" },
    { name: 'Roboto', val: "'Roboto',sans-serif" },
    { name: 'Helvetica Neue', val: "'Helvetica Neue',Helvetica,Arial,sans-serif" },
    { name: 'Tahoma', val: "'Tahoma',sans-serif" },
    { name: 'Verdana', val: "'Verdana',sans-serif" },
    { name: 'San Francisco', val: "-apple-system,'SF Pro Display','SF Pro Text',system-ui,sans-serif" },
    { name: 'Calibri', val: "'Calibri',sans-serif" },
    { name: 'Lucida Sans', val: "'Lucida Sans Unicode','Lucida Sans',sans-serif" },
    { name: 'Arial Black', val: "'Arial Black',sans-serif" },
    { name: 'Arial Narrow', val: "'Arial Narrow',sans-serif" },
    { name: 'Segoe UI Light', val: "'Segoe UI Light','Segoe UI',sans-serif" },
    { name: 'Segoe UI Semibold', val: "'Segoe UI Semibold','Segoe UI',sans-serif" },
  ],
  modern: [
    { name: 'Nunito', val: "'Nunito',sans-serif" },
    { name: 'Poppins', val: "'Poppins',sans-serif" },
    { name: 'Raleway', val: "'Raleway',sans-serif" },
    { name: 'Montserrat', val: "'Montserrat',sans-serif" },
    { name: 'Lato', val: "'Lato',sans-serif" },
    { name: 'Open Sans', val: "'Open Sans',sans-serif" },
    { name: 'DM Sans', val: "'DM Sans',sans-serif" },
    { name: 'Outfit', val: "'Outfit',sans-serif" },
    { name: 'Plus Jakarta Sans', val: "'Plus Jakarta Sans',sans-serif" },
    { name: 'Rubik', val: "'Rubik',sans-serif" },
    { name: 'Oxanium', val: "'Oxanium',sans-serif" },
    { name: 'Exo 2', val: "'Exo 2',sans-serif" },
  ],
  serif: [
    { name: 'Georgia', val: "'Georgia',serif" },
    { name: 'Times New Roman', val: "'Times New Roman',serif" },
    { name: 'Palatino', val: "'Palatino Linotype','Palatino',serif" },
    { name: 'Garamond', val: "'Garamond',serif" },
    { name: 'PT Serif', val: "'PT Serif',serif" },
    { name: 'Merriweather', val: "'Merriweather',serif" },
    { name: 'Playfair Display', val: "'Playfair Display',serif" },
    { name: 'Baskerville', val: "'Libre Baskerville',serif" },
    { name: 'Didot', val: "'Didot','GFS Didot',serif" },
    { name: 'Cambria', val: "'Cambria',serif" },
    { name: 'Bodoni', val: "'Bodoni Moda',serif" },
    { name: 'Bookman', val: "'Bookman Old Style','Bookman',serif" },
    { name: 'Libre Baskerville', val: "'Libre Baskerville',serif" },
    { name: 'Noto Serif', val: "'Noto Serif',serif" },
  ],
  mono: [
    { name: 'JetBrains Mono', val: "'JetBrains Mono',monospace" },
    { name: 'Fira Code', val: "'Fira Code',monospace" },
    { name: 'Source Code Pro', val: "'Source Code Pro',monospace" },
    { name: 'Cascadia Code', val: "'Cascadia Code',monospace" },
    { name: 'Roboto Mono', val: "'Roboto Mono',monospace" },
    { name: 'IBM Plex Mono', val: "'IBM Plex Mono',monospace" },
    { name: 'Space Mono', val: "'Space Mono',monospace" },
    { name: 'Inconsolata', val: "'Inconsolata',monospace" },
    { name: 'Consolas', val: "'Consolas',monospace" },
    { name: 'Courier New', val: "'Courier New',monospace" },
    { name: 'Lucida Console', val: "'Lucida Console',monospace" },
    { name: 'Monocraft', val: "'Monocraft',monospace" },
  ],
  hand: [
    { name: 'Caveat', val: "'Caveat',cursive" },
    { name: 'Pacifico', val: "'Pacifico',cursive" },
    { name: 'Dancing Script', val: "'Dancing Script',cursive" },
    { name: 'Indie Flower', val: "'Indie Flower',cursive" },
    { name: 'Shadows Into Light', val: "'Shadows Into Light',cursive" },
    { name: 'Satisfy', val: "'Satisfy',cursive" },
    { name: 'Kalam', val: "'Kalam',cursive" },
    { name: 'Courgette', val: "'Courgette',cursive" },
    { name: 'Great Vibes', val: "'Great Vibes',cursive" },
    { name: 'Lobster', val: "'Lobster',cursive" },
    { name: 'Amatic SC', val: "'Amatic SC',cursive" },
    { name: 'Sacramento', val: "'Sacramento',cursive" },
    { name: 'Permanent Marker', val: "'Permanent Marker',cursive" },
    { name: 'Marck Script', val: "'Marck Script',cursive" },
    { name: 'Bad Script', val: "'Bad Script',cursive" },
    { name: 'Alex Brush', val: "'Alex Brush',cursive" },
    { name: 'Allura', val: "'Allura',cursive" },
    { name: 'Comic Neue', val: "'Comic Neue',cursive" },
    { name: 'Just Another Hand', val: "'Just Another Hand',cursive" },
  ],
  deco: [
    { name: 'Impact', val: "'Impact',sans-serif" },
    { name: 'Trebuchet MS', val: "'Trebuchet MS',sans-serif" },
    { name: 'Franklin Gothic Medium', val: "'Franklin Gothic Medium','Franklin Gothic',sans-serif" },
    { name: 'Century Gothic', val: "'Century Gothic',sans-serif" },
    { name: 'Candara', val: "'Candara',sans-serif" },
    { name: 'Geneva', val: "'Geneva',sans-serif" },
    { name: 'Optima', val: "'Optima',sans-serif" },
    { name: 'Futura', val: "'Futura','Century Gothic',sans-serif" },
    { name: 'Bauhaus', val: "'Bauhaus 93',fantasy" },
    { name: 'Cooper Black', val: "'Cooper Black',serif" },
    { name: 'Brush Script', val: "'Brush Script MT',cursive" },
    { name: 'Gill Sans', val: "'Gill Sans','Gill Sans MT',sans-serif" },
    { name: 'Copperplate', val: "'Copperplate','Copperplate Gothic Bold',sans-serif" },
  ],
  game: [
    { name: 'Press Start 2P', val: "'Press Start 2P',cursive" },
    { name: 'Silkscreen', val: "'Silkscreen',monospace" },
    { name: 'VT323', val: "'VT323',monospace" },
    { name: 'Minecraft', val: "'Monocraft',monospace" },
    { name: 'Pixelify Sans', val: "'Pixelify Sans',sans-serif" },
    { name: 'Comic Sans MS', val: "'Comic Sans MS',cursive" },
  ],
}

const GF_MAP: Record<string, string> = {
  Monocraft: 'https://cdn.jsdelivr.net/gh/IdreesInc/Monocraft@main/fonts/Monocraft.ttf',
  Inter: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap',
  Roboto: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700;800;900&display=swap',
  Nunito: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap',
  Poppins: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap',
  Raleway: 'https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700;800;900&display=swap',
  Montserrat: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap',
  Lato: 'https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap',
  'Open Sans': 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800&display=swap',
  'DM Sans': 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap',
  Outfit: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap',
  'Plus Jakarta Sans': 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
  Rubik: 'https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800;900&display=swap',
  Oxanium: 'https://fonts.googleapis.com/css2?family=Oxanium:wght@400;500;600;700;800&display=swap',
  'Exo 2': 'https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;600;700;800;900&display=swap',
  'PT Serif': 'https://fonts.googleapis.com/css2?family=PT+Serif:wght@400;700&display=swap',
  Merriweather: 'https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700;900&display=swap',
  'Playfair Display': 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;800;900&display=swap',
  'Libre Baskerville': 'https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&display=swap',
  'Bodoni Moda': 'https://fonts.googleapis.com/css2?family=Bodoni+Moda:wght@400;500;600;700;800;900&display=swap',
  'Noto Serif': 'https://fonts.googleapis.com/css2?family=Noto+Serif:wght@400;700&display=swap',
  'JetBrains Mono': 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&display=swap',
  'Fira Code': 'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&display=swap',
  'Source Code Pro': 'https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400;500;600;700;800;900&display=swap',
  'Roboto Mono': 'https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;600;700&display=swap',
  'IBM Plex Mono': 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap',
  'Space Mono': 'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap',
  Inconsolata: 'https://fonts.googleapis.com/css2?family=Inconsolata:wght@400;500;600;700;800;900&display=swap',
  Caveat: 'https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700;800&display=swap',
  Pacifico: 'https://fonts.googleapis.com/css2?family=Pacifico&display=swap',
  'Dancing Script': 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;500;600;700&display=swap',
  'Indie Flower': 'https://fonts.googleapis.com/css2?family=Indie+Flower&display=swap',
  'Shadows Into Light': 'https://fonts.googleapis.com/css2?family=Shadows+Into+Light&display=swap',
  Satisfy: 'https://fonts.googleapis.com/css2?family=Satisfy&display=swap',
  Kalam: 'https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&display=swap',
  Courgette: 'https://fonts.googleapis.com/css2?family=Courgette&display=swap',
  'Great Vibes': 'https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap',
  Lobster: 'https://fonts.googleapis.com/css2?family=Lobster&display=swap',
  'Amatic SC': 'https://fonts.googleapis.com/css2?family=Amatic+SC:wght@400;700&display=swap',
  Sacramento: 'https://fonts.googleapis.com/css2?family=Sacramento&display=swap',
  'Permanent Marker': 'https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap',
  'Marck Script': 'https://fonts.googleapis.com/css2?family=Marck+Script&display=swap',
  'Bad Script': 'https://fonts.googleapis.com/css2?family=Bad+Script&display=swap',
  'Alex Brush': 'https://fonts.googleapis.com/css2?family=Alex+Brush&display=swap',
  Allura: 'https://fonts.googleapis.com/css2?family=Allura&display=swap',
  'Comic Neue': 'https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;700&display=swap',
  'Just Another Hand': 'https://fonts.googleapis.com/css2?family=Just+Another+Hand&display=swap',
  'Press Start 2P': 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap',
  Silkscreen: 'https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap',
  VT323: 'https://fonts.googleapis.com/css2?family=VT323&display=swap',
  'Pixelify Sans': 'https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;500;600;700&display=swap',
}

const loaded = new Set<string>()

/** Подгрузить веб-шрифт по его CSS-значению, если он есть в карте. */
export const ensureFontLoaded = (fontValue: string): void => {
  if (!fontValue) return
  const m = fontValue.match(/['"]([^'"]+)['"]/)
  const name = m ? m[1] : null
  if (!name || loaded.has(name)) return
  loaded.add(name)
  const url = GF_MAP[name]
  if (!url) return
  const lnk = document.createElement('link')
  lnk.rel = 'stylesheet'
  lnk.href = url
  document.head.appendChild(lnk)
}

const norm = (s: string) => s.replace(/\s/g, '')

/** Найти категорию, содержащую данное значение шрифта (для подсветки активной вкладки). */
export const catOfFont = (fontValue: string): FontCat => {
  const target = norm(fontValue)
  for (const cat of Object.keys(FONT_CATS) as FontCat[]) {
    if (FONT_CATS[cat].some((f) => norm(f.val) === target)) return cat
  }
  return 'system'
}
