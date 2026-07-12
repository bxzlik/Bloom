import type { ComponentType, SVGProps } from 'react'

// Централизованный набор иконок Solar (480 Design).
// Базовый стиль — `linear`; `bold` используется для активных состояний
// (напр. иконки сайдбара, залитое сердце «в избранном»).
//
// Импорты `~icons/solar/*` резолвит unplugin-icons на этапе сборки из
// `@iconify-json/solar`, поэтому в бандл попадают ТОЛЬКО используемые иконки
// (без рантайма и без обращений к сети — важно для офлайн-десктопа Tauri).

import HomeLinear from '~icons/solar/home-angle-2-linear'
import HomeBold from '~icons/solar/home-angle-2-bold'
import PlayLinear from '~icons/solar/play-linear'
import PlayBold from '~icons/solar/play-bold'
import PauseLinear from '~icons/solar/pause-linear'
import PauseBold from '~icons/solar/pause-bold'
import PrevLinear from '~icons/solar/skip-previous-linear'
import NextLinear from '~icons/solar/skip-next-linear'
import ShuffleLinear from '~icons/solar/shuffle-linear'
import ShuffleBold from '~icons/solar/shuffle-bold'
import RepeatLinear from '~icons/solar/repeat-linear'
import RepeatOneLinear from '~icons/solar/repeat-one-linear'
import HeartLinear from '~icons/solar/heart-linear'
import HeartBold from '~icons/solar/heart-bold'
import VolumeLoudLinear from '~icons/solar/volume-loud-linear'
import VolumeSmallLinear from '~icons/solar/volume-small-linear'
import MutedLinear from '~icons/solar/muted-linear'
import SearchLinear from '~icons/solar/magnifer-linear'
import SearchBold from '~icons/solar/magnifer-bold'
import SettingsLinear from '~icons/solar/settings-linear'
import SettingsBold from '~icons/solar/settings-bold'
import LibraryLinear from '~icons/solar/library-linear'
import LibraryBold from '~icons/solar/library-bold'
import PipLinear from '~icons/solar/pip-linear'
import PipBold from '~icons/solar/pip-bold'
import PlaylistLinear from '~icons/solar/playlist-minimalistic-2-linear'
import LyricsLinear from '~icons/solar/text-linear'
import BigPicLinear from '~icons/solar/full-screen-linear'
import NoteLinear from '~icons/solar/music-note-linear'
import AddCircleLinear from '~icons/solar/add-circle-linear'
import DownloadLinear from '~icons/solar/download-minimalistic-linear'
import EqLinear from '~icons/solar/tuning-4-linear'
import ClockLinear from '~icons/solar/clock-circle-linear'
import FolderLinear from '~icons/solar/folder-linear'
import TrashLinear from '~icons/solar/trash-bin-trash-linear'
import WaveLinear from '~icons/solar/soundwave-linear'
import WaveBold from '~icons/solar/soundwave-bold'
import EditLinear from '~icons/solar/pen-2-linear'
import CopyLinear from '~icons/solar/copy-linear'
import TagLinear from '~icons/solar/tag-linear'
import StarLinear from '~icons/solar/star-linear'
import StarBold from '~icons/solar/star-bold'
import UserLinear from '~icons/solar/user-linear'
import UserBold from '~icons/solar/user-bold'
import GalleryLinear from '~icons/solar/gallery-linear'
import PaletteLinear from '~icons/solar/palette-linear'
import RefreshLinear from '~icons/solar/refresh-linear'
import PowerLinear from '~icons/solar/power-linear'
import PowerBold from '~icons/solar/power-bold'
import ArrowLeftLinear from '~icons/solar/alt-arrow-left-linear'
import ArrowLeftStraightLinear from '~icons/solar/arrow-left-linear'
import ArrowRightLinear from '~icons/solar/alt-arrow-right-linear'
import ArrowDownLinear from '~icons/solar/alt-arrow-down-linear'
import ArrowUpLinear from '~icons/solar/alt-arrow-up-linear'
import InfoLinear from '~icons/solar/info-circle-linear'
import BellLinear from '~icons/solar/bell-linear'
import BellBold from '~icons/solar/bell-bold'
import EyeLinear from '~icons/solar/eye-linear'
import EyeOffLinear from '~icons/solar/eye-closed-linear'
import LogoutLinear from '~icons/solar/logout-2-linear'
import LoginLinear from '~icons/solar/login-2-linear'
import ChartLinear from '~icons/solar/chart-2-linear'
import FilterLinear from '~icons/solar/filter-linear'
import PinLinear from '~icons/solar/pin-linear'
import PinBold from '~icons/solar/pin-bold'
import ShareLinear from '~icons/solar/share-linear'
import MenuLinear from '~icons/solar/hamburger-menu-linear'
import UnfollowLinear from '~icons/solar/user-cross-rounded-linear'
import CalendarLinear from '~icons/solar/calendar-linear'
import AlbumLinear from '~icons/solar/album-linear'
import SortLinear from '~icons/solar/sort-linear'
import ExportLinear from '~icons/solar/export-linear'
import MergeLinear from '~icons/solar/arrow-to-down-right-linear'
import FileLinear from '~icons/solar/file-text-linear'
import CameraLinear from '~icons/solar/camera-linear'
import SquareLinear from '~icons/solar/stop-linear'
import CheckSquareLinear from '~icons/solar/check-square-linear'
import CheckSquareBold from '~icons/solar/check-square-bold'
import MonitorLinear from '~icons/solar/monitor-linear'
import WidgetLinear from '~icons/solar/widget-linear'
import CpuLinear from '~icons/solar/cpu-linear'
import KeyboardLinear from '~icons/solar/keyboard-linear'
import DatabaseLinear from '~icons/solar/database-linear'
import SidebarLinear from '~icons/solar/sidebar-minimalistic-linear'
import WindowFrameLinear from '~icons/solar/window-frame-linear'
import SaveLinear from '~icons/solar/diskette-linear'
import CodeLinear from '~icons/solar/code-linear'
import StarsLinear from '~icons/solar/stars-linear'
import MinSquareLinear from '~icons/solar/minimize-square-linear'
import RestoreLinear from '~icons/solar/minimize-square-minimalistic-linear'
import MaxSquareLinear from '~icons/solar/maximize-square-linear'
import LinkLinear from '~icons/solar/link-minimalistic-linear'
import GlobeLinear from '~icons/solar/global-linear'
import ImportLinear from '~icons/solar/import-linear'
import DangerLinear from '~icons/solar/danger-triangle-linear'
import InboxLinear from '~icons/solar/inbox-linear'
import VinylLinear from '~icons/solar/vinyl-linear'
import VinylBold from '~icons/solar/vinyl-bold'
import VideoLinear from '~icons/solar/videocamera-linear'
import BlurLinear from '~icons/solar/radial-blur-linear'
import GalleryWideLinear from '~icons/solar/gallery-wide-linear'
import GridLinear from '~icons/solar/widget-2-linear'
import ListLinear from '~icons/solar/list-linear'
import ListBold from '~icons/solar/list-bold'
import DangerCircleLinear from '~icons/solar/danger-circle-linear'
import DislikeLinear from '~icons/solar/dislike-linear'
import TuningLinear from '~icons/solar/tuning-linear'
import AwardLinear from '~icons/solar/medal-ribbons-star-linear'
import CursorLinear from '~icons/solar/cursor-linear'
import SliderHLinear from '~icons/solar/slider-horizontal-linear'
import BellOffLinear from '~icons/solar/bell-off-linear'

type SvgComp = ComponentType<SVGProps<SVGSVGElement>>

// Голые «+» / «−» — у Solar нет варианта без рамки, рисуем простыми штрихами.
// Совместимы с тем же SVGProps-контрактом, что и иконки unplugin-icons.
const PlusBare: SvgComp = (p) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...p}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)
const MinusBare: SvgComp = (p) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...p}>
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)
// Голый «×» — у Solar только обведённый `close-circle`.
const CloseBare: SvgComp = (p) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...p}>
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
)
// Голая галочка — у Solar только `check-circle` (в кружке).
const CheckBare: SvgComp = (p) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M5 13l4 4L19 7" />
  </svg>
)
// Три точки (kebab) — рисуем сами: solar-версия не нравится. Плотные
// вертикальные точки одинакового радиуса, залитые currentColor.
const KebabBare: SvgComp = (p) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...p}>
    <circle cx="12" cy="5" r="1.85" />
    <circle cx="12" cy="12" r="1.85" />
    <circle cx="12" cy="19" r="1.85" />
  </svg>
)

/** Семантическое имя → начертания. `bold` опционально (фолбэк на `linear`). */
const ICONS = {
  home: { linear: HomeLinear, bold: HomeBold },
  play: { linear: PlayLinear, bold: PlayBold },
  pause: { linear: PauseLinear, bold: PauseBold },
  prev: { linear: PrevLinear },
  next: { linear: NextLinear },
  shuffle: { linear: ShuffleLinear, bold: ShuffleBold },
  repeat: { linear: RepeatLinear },
  repeatOne: { linear: RepeatOneLinear },
  heart: { linear: HeartLinear, bold: HeartBold },
  volumeLoud: { linear: VolumeLoudLinear },
  volumeSmall: { linear: VolumeSmallLinear },
  muted: { linear: MutedLinear },
  search: { linear: SearchLinear, bold: SearchBold },
  settings: { linear: SettingsLinear, bold: SettingsBold },
  library: { linear: LibraryLinear, bold: LibraryBold },
  pip: { linear: PipLinear, bold: PipBold },
  queue: { linear: PlaylistLinear },
  lyrics: { linear: LyricsLinear },
  bigpic: { linear: BigPicLinear },
  note: { linear: NoteLinear },
  add: { linear: PlusBare },
  addCircle: { linear: AddCircleLinear },
  minus: { linear: MinusBare },
  close: { linear: CloseBare },
  download: { linear: DownloadLinear },
  eq: { linear: EqLinear },
  clock: { linear: ClockLinear },
  folder: { linear: FolderLinear },
  trash: { linear: TrashLinear },
  wave: { linear: WaveLinear, bold: WaveBold },
  edit: { linear: EditLinear },
  kebab: { linear: KebabBare },
  copy: { linear: CopyLinear },
  tag: { linear: TagLinear },
  star: { linear: StarLinear, bold: StarBold },
  user: { linear: UserLinear, bold: UserBold },
  gallery: { linear: GalleryLinear },
  palette: { linear: PaletteLinear },
  refresh: { linear: RefreshLinear },
  power: { linear: PowerLinear, bold: PowerBold },
  check: { linear: CheckBare },
  arrowLeft: { linear: ArrowLeftLinear },
  arrowLeftStraight: { linear: ArrowLeftStraightLinear },
  arrowRight: { linear: ArrowRightLinear },
  arrowDown: { linear: ArrowDownLinear },
  arrowUp: { linear: ArrowUpLinear },
  info: { linear: InfoLinear },
  bell: { linear: BellLinear, bold: BellBold },
  eye: { linear: EyeLinear },
  eyeOff: { linear: EyeOffLinear },
  logout: { linear: LogoutLinear },
  login: { linear: LoginLinear },
  chart: { linear: ChartLinear },
  filter: { linear: FilterLinear },
  pin: { linear: PinLinear, bold: PinBold },
  share: { linear: ShareLinear },
  playNext: { linear: NextLinear },
  menu: { linear: MenuLinear },
  unfollow: { linear: UnfollowLinear },
  calendar: { linear: CalendarLinear },
  album: { linear: AlbumLinear },
  sort: { linear: SortLinear },
  export: { linear: ExportLinear },
  merge: { linear: MergeLinear },
  file: { linear: FileLinear },
  camera: { linear: CameraLinear },
  square: { linear: SquareLinear },
  checkSquare: { linear: CheckSquareLinear, bold: CheckSquareBold },
  monitor: { linear: MonitorLinear },
  widget: { linear: WidgetLinear },
  cpu: { linear: CpuLinear },
  keyboard: { linear: KeyboardLinear },
  database: { linear: DatabaseLinear },
  sidebar: { linear: SidebarLinear },
  windowFrame: { linear: WindowFrameLinear },
  save: { linear: SaveLinear },
  code: { linear: CodeLinear },
  stars: { linear: StarsLinear },
  minSquare: { linear: MinSquareLinear },
  restore: { linear: RestoreLinear },
  maxSquare: { linear: MaxSquareLinear },
  text: { linear: LyricsLinear },
  link: { linear: LinkLinear },
  globe: { linear: GlobeLinear },
  import: { linear: ImportLinear },
  danger: { linear: DangerLinear },
  inbox: { linear: InboxLinear },
  vinyl: { linear: VinylLinear, bold: VinylBold },
  video: { linear: VideoLinear },
  blur: { linear: BlurLinear },
  galleryWide: { linear: GalleryWideLinear },
  grid: { linear: GridLinear },
  list: { linear: ListLinear, bold: ListBold },
  dangerCircle: { linear: DangerCircleLinear },
  dislike: { linear: DislikeLinear },
  tuning: { linear: TuningLinear },
  award: { linear: AwardLinear },
  cursor: { linear: CursorLinear },
  slider: { linear: SliderHLinear },
  bellOff: { linear: BellOffLinear },
} satisfies Record<string, { linear: SvgComp; bold?: SvgComp }>

export type IconName = keyof typeof ICONS
export type IconVariant = 'linear' | 'bold'

export interface IcoProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  /** `bold` — для активных состояний; фолбэк на `linear`, если bold не задан. */
  variant?: IconVariant
  /** Размер обеих сторон. По умолчанию 1em (наследует font-size). */
  size?: number | string
}

/** Единая точка отрисовки Solar-иконки. Цвет — через `currentColor`. */
export const Ico = ({ name, variant = 'linear', size = '1em', width, height, ...rest }: IcoProps) => {
  const set = ICONS[name]
  const Cmp = variant === 'bold' && 'bold' in set && set.bold ? set.bold : set.linear
  return <Cmp width={width ?? size} height={height ?? size} {...rest} />
}
