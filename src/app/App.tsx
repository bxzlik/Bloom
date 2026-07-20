import { useEffect, useRef } from 'react'
import { useThemeSettings, useTrackRowMarquee, useTauriEvent } from '@shared/hooks'
import { initLocaleAttr, t as tFn } from '@shared/i18n'
import { TitleBar } from './TitleBar'
import { Sidebar } from './Sidebar'
import { HomePage } from './pages/HomePage'
import { GlobalToast, ShareCardModal, toast } from '@shared/ui'
import { useNavStore } from './navigationStore'
import { useGlobalHotkeys } from './useGlobalHotkeys'
import { useFullscreenHotkey } from './useFullscreenHotkey'
import { useDeepLinkBridge } from './useDeepLinkBridge'
import { useOverlayBridge } from './useOverlayBridge'
import { LibPage, TrackInfoModal, MergeModal, MpNewPlaylistHost, DeepLinkModal, TagEditorHost, useTrackInfoStore, useLibStore, startUsageTracking } from '@features/library'
import { PagePlayer, PlayerBar, VerticalBarColumn, GlobalRightPanel, BigPicture, DownloadBanner, useGrpStore, useBigPicStore, useMainPlayerBridge, useAudioEffects, useMiniBarVisible } from '@features/player'
import { useQueueStore } from '@features/player/model/queueStore'
import { trackRegistry } from '@entities/track'
import { useLyricsBridge } from '@features/lyrics'
import { useLastfmBridge } from '@features/lastfm'
import { SearchPage, DetailView, useDetailStore } from '@features/search'
import { bootstrapProviders, getProvider } from '@features/providers'
import { bootstrapOffline } from '@features/offline'
import { bootstrapSoundcloud } from '@features/soundcloud'
import { bootstrapYandex } from '@features/yandex'
import { bootstrapYtmusic } from '@features/ytmusic'
import { bootstrapSpotify } from '@features/spotify'
import { AccountPage, useAchievementsWatcher } from '@features/profile'
import { useMediaLibBootstrap, useCustomizationBootstrap } from '@features/customization'
import { QuickWheel } from '@features/quick-wheel'
import { Onboarding } from '@features/onboarding'
import {
  SettingsOverlay,
  ColorPicker,
  useThemeBootstrap,
  useSettingsBootstrap,
  useUiPrefsStore,
  useUiPrefsBootstrap,
  appClassesFromPrefs,
  usePlayerViewStore,
  appClassesFromView,
  bodySliderClass,
  BODY_SLIDER_CLASSES,
  useAutoAccentBridge,
  useTransparencyBootstrap,
  useOptBootstrap,
  useTelemetryBootstrap,
  useUpdateBootstrap,
  UpdateNotesModal,
} from '@features/settings'

/**
 * Main окно — каркас:
 *
 *   <body>
 *     #bloom-loading (опускаем)
 *     #bgl (background layer)
 *     #winTitlebar
 *     .app
 *       .sidebar
 *       #miniPlayerCol (display:none, для playerbar-left режима)
 *       .main-wrap
 *         #mainContentRow
 *           .main
 *             .page #page-home / .page #page-player / ...
 *         #miniPlayer (bottom player bar, display:none пока нет трека)
 *       #miniPlayerColRight (display:none, для playerbar-right режима)
 *
 * Стили задаются shared/styles/index.css (импорт в main.tsx).
 */
/** Все классы `.app`, управляемые префами (для императивного toggle). */
const APP_PREF_CLASSES = [
  'sidebar-top',
  'sidebar-right',
  'sidebar-compact',
  'sidebar-floating',
  'sidebar-autohide',
  'no-sb-sep',
  'cov-btns-in-bar',
] as const

export const App = () => {
  useThemeSettings()
  useEffect(initLocaleAttr, [])
  useEffect(startUsageTracking, [])
  useMainPlayerBridge()
  useLyricsBridge()
  useThemeBootstrap()
  useSettingsBootstrap()
  useUiPrefsBootstrap()
  useAutoAccentBridge()
  useTransparencyBootstrap()
  useMediaLibBootstrap()
  useCustomizationBootstrap()
  useOptBootstrap()
  useTelemetryBootstrap()
  useGlobalHotkeys()
  useFullscreenHotkey()
  useDeepLinkBridge()
  useOverlayBridge()
  useLastfmBridge()
  useAudioEffects()
  useTrackRowMarquee()
  useUpdateBootstrap()
  useAchievementsWatcher()

  // Клик по артисту в miniplayer/tray → Rust `tray_open_artist` показывает главное
  // окно и шлёт `bloom-open-artist`. Открываем страницу артиста — с веткой
  // `.tra-link` ниже, но триггер из другого окна (трей шлёт только имя). Провайдера
  // и точный id берём из ТЕКУЩЕГО трека, иначе ym-артист уходил бы на SC-страницу.
  useTauriEvent('bloom-open-artist', (name) => {
    if (!name) return
    useBigPicStore.getState().closeBig()
    const curId = useQueueStore.getState().curId
    const curTrack = curId
      ? useLibStore.getState().tracks.find((t) => t.id === curId) ?? trackRegistry.get(curId) ?? null
      : null
    const providerId = curTrack?.artistProvider || 'soundcloud'
    // Точный id артиста есть (напр. Yandex) — открываем напрямую, минуя резолв по имени.
    if (curTrack?.artistId && curTrack.artistProvider) {
      useDetailStore.getState().open({
        kind: 'artist',
        providerId: curTrack.artistProvider,
        id: curTrack.artistId,
        title: name,
        cover: null,
        round: true,
      })
      return
    }
    const prov = getProvider(providerId)
    if (!prov?.resolveArtistByName) return
    void prov.resolveArtistByName(name).then((target) => {
      if (!target) return
      useDetailStore.getState().open({
        kind: 'artist',
        providerId,
        id: target.id,
        title: target.title,
        cover: target.cover ?? null,
        round: true,
      })
    })
  })
  // Авто-скрытие очереди у минимума окна (минимум = 900×600 логич.px, tauri.conf
  // minWidth/minHeight). Считаем в ЛОГИЧЕСКИХ px: webview-зум (setwinzoom →
  // set_zoom) масштабирует CSS-px, поэтому window.inner* плавают вместе с зумом,
  // и порог в чистом CSS был бы ненадёжным. logical = inner * zoom.
  //   • win-narrow (по ШИРИНЕ) → прячет боковую/grid-очередь (queue.css);
  //   • win-short  (по ВЫСОТЕ) → прячет нижнюю/вертикальную очередь.
  // Императивно (classList), без ре-рендера. Пороги — узкая полоса у минимума.
  useEffect(() => {
    const apply = () => {
      const zoom = (useUiPrefsStore.getState().winZoom || 100) / 100
      document.body.classList.toggle('win-narrow', window.innerWidth * zoom <= 905)
      document.body.classList.toggle('win-short', window.innerHeight * zoom <= 605)
      // Широкое окно — показываем доп-колонки треклиста библиотеки (Альбом/Дата).
      document.body.classList.toggle('win-lib-wide', window.innerWidth * zoom >= 1080)
    }
    apply()
    window.addEventListener('resize', apply)
    const un = useUiPrefsStore.subscribe(apply)
    return () => {
      window.removeEventListener('resize', apply)
      un()
    }
  }, [])

  // Регистрируем провайдеры: встроенный локальный + SoundCloud (поиск + стрим).
  useEffect(() => {
    bootstrapProviders()
    // Раньше площадок: офлайн-копия трека должна выигрывать у сетевого стрима.
    bootstrapOffline()
    bootstrapSoundcloud()
    bootstrapYandex()
    bootstrapYtmusic()
    bootstrapSpotify()
  }, [])

  // Глобальный клик по имени артиста (.tra-link) → страница артиста. Работает из любого места (поиск, очередь,
  // плеер, библиотека): резолвим артиста у провайдера → переход на поиск + DetailView.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('.tra-link') as HTMLElement | null
      if (!el) return
      const name = el.dataset.artist
      if (!name) return
      e.stopPropagation()
      // Клик по артисту открывает страницу артиста (DetailView) — закрываем
      // полноэкранный режим, иначе он перекрыл бы её.
      useBigPicStore.getState().closeBig()
      // Точный entity-id (напр. клик по подписке в сайдбаре) — открываем артиста
      // НАПРЯМУЮ, минуя резолв по имени (иначе можно попасть на другого артиста
      // с тем же именем). getArtist сам разбирает id (sc_artist_<id>/_p_<perm>).
      const directId = el.dataset.artistId
      if (directId) {
        useDetailStore.getState().open({
          kind: 'artist',
          providerId: el.dataset.artistProvider || 'soundcloud',
          id: directId,
          title: name,
          cover: el.dataset.artistCover || null,
          round: true,
        })
        return
      }
      const scIdRaw = el.dataset.artistScId
      const hint = {
        scId: scIdRaw ? Number(scIdRaw) : undefined,
        permalink: el.dataset.artistPermalink ?? null,
      }
      // Резолв по имени идёт у провайдера трека (data-artist-provider), а не всегда
      // у SoundCloud — иначе клик по артисту мульти-артистного YM-трека (где нет
      // точного data-artist-id) уводил бы на SC-страницу. Дефолт — soundcloud.
      const providerId = el.dataset.artistProvider || 'soundcloud'
      const prov = getProvider(providerId)
      if (!prov?.resolveArtistByName) return
      void prov.resolveArtistByName(name, hint).then((target) => {
        if (!target) return
        // Открываем глобальный оверлей поверх текущей страницы (работает с любой
        // страницы) — БЕЗ перехода на поиск и БЕЗ записи в недавние
        // (клик по ссылке-артисту не добавляется в «недавно открытые»).
        useDetailStore.getState().open({
          kind: 'artist',
          providerId,
          id: target.id,
          title: target.title,
          cover: target.cover ?? null,
          round: true,
        })
      })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  // Глобальный клик по названию альбома (.alb-link) в треклисте библиотеки →
  // страница альбома. У трека нет album-id, поэтому резолвим по имени через
  // поиск площадки (как артиста), подмешивая имя артиста для точности. Локальные
  // треки (provider==='local') страницы альбома не имеют → фильтруем текущий
  // список библиотеки по названию альбома.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('.alb-link') as HTMLElement | null
      if (!el) return
      const album = el.dataset.album
      if (!album) return
      e.stopPropagation()
      const provider = el.dataset.albumProvider || 'local'
      const artist = el.dataset.albumArtist || ''
      if (provider === 'local') {
        // Фильтр сравнивает с lowercase-полями трека → запрос в нижнем регистре.
        useLibStore.getState().setSearchQuery(album.toLowerCase())
        return
      }
      const prov = getProvider(provider)
      if (!prov) return
      useBigPicStore.getState().closeBig()
      const q = artist ? `${album} ${artist}` : album
      // Нормализация: нижний регистр, убрать пунктуацию/лишние пробелы (юникод).
      const norm = (s: string | null | undefined) =>
        (s || '')
          .toLowerCase()
          .replace(/[^\p{L}\p{N} ]+/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      const wantAlbum = norm(album)
      const wantArtist = norm(artist)
      void prov.search(q).then((res) => {
        const albums = res.albums || []
        if (!albums.length) {
          toast(tFn('lib.albumNotFound', { album }))
          return
        }
        // Скоринг: сперва совпадение НАЗВАНИЯ (иначе кандидат отбрасывается —
        // не открываем случайный альбом), затем бонус за совпадение артиста
        // (ownerName у альбома). Порог 40 = хотя бы частичное совпадение имени.
        const scored = albums
          .map((a) => {
            const title = norm(a.title)
            let score = 0
            if (title === wantAlbum) score = 100
            else if (title.includes(wantAlbum) || wantAlbum.includes(title)) score = 45
            else return { a, score: -1 }
            const owner = norm(a.ownerName)
            if (wantArtist && owner) {
              if (owner === wantArtist) score += 50
              else if (owner.includes(wantArtist) || wantArtist.includes(owner)) score += 20
            }
            return { a, score }
          })
          .filter((x) => x.score >= 40)
          .sort((x, y) => y.score - x.score)
        const best = scored[0]?.a
        if (!best) {
          // Ничего уверенно не совпало — лучше не открывать чужой альбом.
          toast(tFn('lib.albumNotFound', { album }))
          return
        }
        useDetailStore.getState().open({
          kind: 'album',
          providerId: provider,
          id: best.id,
          title: best.title,
          cover: best.cover ?? null,
          round: false,
        })
      })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  // Смена страницы закрывает детальный оверлей.
  const pageForDetail = useNavStore((s) => s.page)
  useEffect(() => {
    useDetailStore.getState().close()
  }, [pageForDetail])
  const page = useNavStore((s) => s.page)
  const infoTrack = useTrackInfoStore((s) => s.track)
  const closeTrackInfo = useTrackInfoStore((s) => s.closeTrackInfo)

  // Глобальная правая панель (очередь/текст): сдвиг контента + сторона.
  // На странице плеера панель скрыта (там свой инлайн-queue) → не сдвигаем контент.
  const grpOpen = useGrpStore((s) => s.open)
  const grpSide = useGrpStore((s) => s.side)
  // Без трека мини-плеер скрыт (там кнопки панели) — панель тоже прячем, иначе
  // её нечем закрыть. Появится снова, когда заиграет трек (open сохраняется).
  const grpCurId = useQueueStore((s) => s.curId)
  // На странице плеера панель скрыта (там свой инлайн-queue) — КРОМЕ случая, когда
  // поверх плеера открыт детальный оверлей (артист/альбом): тогда инлайн-очередь
  // перекрыта, и кнопки очередь/текст мини-плера должны открывать глобальную панель.
  const detailOpenForGrp = useDetailStore((s) => s.stack.length > 0)
  const grpVisible = grpOpen && (page !== 'player' || detailOpenForGrp) && !!grpCurId

  // Позиция нижнего бара. Меняется редко (настройка), поэтому
  // реактивная подписка допустима — пере-рендер App только на смену позиции.
  // bottom/top: бар в .main-wrap (top → CSS column-reverse). left/right: бар в
  // боковой колонке с поворотом (VerticalBarColumn). Класс playerbar-* — здесь
  // (не в APP_PREF_CLASSES, которые тоглятся императивно), т.к. App уже ре-рендерится.
  const playerBarPos = usePlayerViewStore((s) => s.playerBarPos)
  const barPosClass =
    playerBarPos === 'top'
      ? 'playerbar-top'
      : playerBarPos === 'left'
        ? 'playerbar-left'
        : playerBarPos === 'right'
          ? 'playerbar-right'
          : ''
  // Плавающий (overlay поверх контента) и компактный (узкий, по центру) режимы —
  // только для горизонтального бара (bottom/top); для боковых колонок не применимы.
  const mpFloating = usePlayerViewStore((s) => s.mpFloating)
  const mpCompact = usePlayerViewStore((s) => s.mpCompact)
  // «Во всю ширину» — бар вынимается из .main-wrap в коробку .app (absolute),
  // а .app получает padding под его высоту, поэтому сайдбар укорачивается и
  // встаёт НА бар. Взаимоисключим с floating/compact (инвариант держит стор).
  const mpFullWidth = usePlayerViewStore((s) => s.mpFullWidth)
  const mpFlush = usePlayerViewStore((s) => s.mpFlush)
  const horizontalBar = playerBarPos === 'bottom' || playerBarPos === 'top'
  // Бар вынут из потока → место под него резервирует раскладка. Пока бар скрыт
  // (нет трека / страница плеера / выключен) резерв не нужен, иначе внизу висит
  // пустая полоса и страница «съезжает». Предикат общий с самим баром.
  const barVisible = useMiniBarVisible()
  const fullActive = horizontalBar && mpFullWidth && barVisible
  const mpModeClass = [
    horizontalBar && mpFloating ? 'mp-floating' : '',
    horizontalBar && mpCompact ? 'mp-compact' : '',
    fullActive ? 'mp-full' : '',
    fullActive && mpFlush ? 'mp-flush' : '',
  ]
    .filter(Boolean)
    .join(' ')

  // Классы `.app` из UI-префов (расположение сайдбара/компакт/разделители/
  // стиль системных карточек/индикатор + cov-btns-in-bar) —
  // setSidebarPos и т.п.
  //
  // ВАЖНО (производительность): все страницы смонтированы разом (см. ниже), а
  // App — корень дерева. Реактивная подписка тут заставляла бы КАЖДЫЙ тоггл
  // перерисовывать всё приложение (страницы+плеер) → ощутимая «задержка»
  // переключателей. Поэтому: значение className читаем НЕреактивно (getState,
  // для корректного first-paint/ре-рендеров по другим причинам), а живые
  // изменения применяем ИМПЕРАТИВНО через classList по подписке на сторы —
  // ровно, без ре-рендера React.
  const appRef = useRef<HTMLDivElement>(null)
  const prefClasses = [
    ...appClassesFromPrefs(useUiPrefsStore.getState()),
    ...appClassesFromView(usePlayerViewStore.getState()),
  ].join(' ')
  useEffect(() => {
    const apply = () => {
      const el = appRef.current
      if (!el) return
      const want = new Set([
        ...appClassesFromPrefs(useUiPrefsStore.getState()),
        ...appClassesFromView(usePlayerViewStore.getState()),
      ])
      for (const c of APP_PREF_CLASSES) el.classList.toggle(c, want.has(c))
      // Стиль слайдера — body-класс, тоже императивно.
      const active = bodySliderClass(usePlayerViewStore.getState().sliderType)
      for (const c of BODY_SLIDER_CLASSES) document.body.classList.toggle(c, c === active)
      // Плоская кнопка play (без фона, крупная иконка) — body-класс, чтобы достать
      // и до #bigPicOverlay (вне .app). Всегда включена.
      document.body.classList.add('play-flat')
      // Авто-скрытие тайтлбара — body-класс (#winTitlebar рендерится вне .app).
      document.body.classList.toggle('titlebar-autohide', useUiPrefsStore.getState().titlebarAutohide)
    }
    apply()
    const un1 = useUiPrefsStore.subscribe(apply)
    const un2 = usePlayerViewStore.subscribe(apply)
    return () => {
      un1()
      un2()
    }
  }, [])

  return (
    <>
      {/* Background layer */}
      <div id="bgl" className="no-bg" />

      {/* Невидимая зона-триггер у верхней кромки для авто-скрытия тайтлбара
          (titlebar-autohide): активна только через body-класс, ловит наведение. */}
      <div className="tb-edge-trigger" aria-hidden="true" />

      {/* Custom titlebar (drag + win controls) */}
      <TitleBar />

      <div
        ref={appRef}
        className={`app${prefClasses ? ' ' + prefClasses : ''}${barPosClass ? ' ' + barPosClass : ''}${mpModeClass ? ' ' + mpModeClass : ''}${grpVisible && grpSide === 'left' ? ' grp-side-left' : ''}`}
      >
        {/* Невидимая зона-триггер у края для авто-скрытия сайдбара (sidebar-autohide):
            всегда в DOM, активна только через CSS-класс. Не трансформируется (в отличие
            от самого сайдбара), поэтому надёжно ловит наведение на край экрана. */}
        <div className="sb-edge-trigger" aria-hidden="true" />

        <Sidebar />

        {/* Вертикальный бар слева (playerbar-left) либо скрытый слот-заглушка. */}
        {playerBarPos === 'left' ? (
          <VerticalBarColumn side="left" />
        ) : (
          <div id="miniPlayerCol" style={{ display: 'none', flexShrink: 0, width: 72, flexDirection: 'column' }} />
        )}

        <div
          className="main-wrap"
          style={{
            flex: 1,
            display: 'flex',
            // top: бар уезжает наверх через reverse (инлайн перебивал бы CSS-класс
            // playerbar-top, поэтому задаём направление здесь по playerBarPos).
            flexDirection: playerBarPos === 'top' ? 'column-reverse' : 'column',
            gap: 'var(--app-gap)',
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          <div
            id="mainContentRow"
            className={grpVisible ? 'has-grp-panel' : undefined}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'row',
              overflow: 'hidden',
              minHeight: 0,
            }}
          >
            <div className="main" id="mainEl">
              <HomePage active={page === 'home'} />
              <PagePlayer active={page === 'player'} />
              <LibPage active={page === 'lib'} />
              <SearchPage active={page === 'search'} />
              <AccountPage active={page === 'account'} />
              {/* Детальный вид (артист/альбом/плейлист) — ГЛОБАЛЬНЫЙ оверлей поверх
                  любой страницы. */}
              <DetailView />
            </div>

            {/* Глобальная выезжающая боковая панель (очередь/текст) */}
            <GlobalRightPanel />
          </div>

          {/* Нижний/верхний бар (bottom = по умолчанию, top = CSS column-reverse).
              Для left/right бар уезжает в боковую колонку (ниже) — здесь не рендерим. */}
          {(playerBarPos === 'bottom' || playerBarPos === 'top') && <PlayerBar />}
        </div>

        {/* Вертикальный бар справа (playerbar-right) либо скрытый слот-заглушка. */}
        {playerBarPos === 'right' ? (
          <VerticalBarColumn side="right" />
        ) : (
          <div id="miniPlayerColRight" style={{ display: 'none', flexShrink: 0, width: 72, flexDirection: 'column' }} />
        )}
      </div>

      {/* Settings modal — рендерится поверх через portal */}
      <SettingsOverlay />

      {/* Кастомный HSV color-picker (#cpPopup) — единый попап для всех swatch */}
      <ColorPicker />

      {/* Инфо о треке — единая модалка, открывается из ctx-меню (любое окно) */}
      <TrackInfoModal track={infoTrack} onClose={closeTrackInfo} />

      {/* «Поделиться» — единая модалка (страница артиста/альбома + ПКМ-меню трека) */}
      <ShareCardModal />

      {/* «Объединение плейлистов» — единая модалка, открывается из PlMenu */}
      <MergeModal />

      {/* Редактор тегов — единый хост (drawer), переживает закрытие BigPicture */}
      <TagEditorHost />

      {/* «Новый плейлист» из «+» miniplayer/tray (кросс-оконный сценарий) */}
      <MpNewPlaylistHost />

      {/* Deep-link `bloom://play` — модалка выбора действия над треком из ссылки */}
      <DeepLinkModal />

      {/* Полноэкранный режим обложки (#bigPicOverlay) — оверлей поверх всего */}
      <BigPicture />

      {/* «Круговое меню» (#quick-wheel) — удержание Tab, плеер + навигация */}
      <QuickWheel />

      {/* Онбординг первого запуска (#onboarding) — поверх всего, только при !done */}
      <Onboarding />

      {/* Глобальный императивный toast (для движка «Волны» и др. не-React кода) */}
      <GlobalToast />

      {/* Тост прогресса скачивания плейлиста (сверху по центру) */}
      <DownloadBanner />

      {/* Модалка «Подробнее»/«Что нового» — текст и фото релиза */}
      <UpdateNotesModal />
    </>
  )
}
