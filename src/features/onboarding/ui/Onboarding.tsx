import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useThemeStore, THEME_PRESETS } from '@features/settings'
import { useProfileStore } from '@features/profile'
import { compressCover } from '@features/library'
import { useOnboardingStore } from '../model/onboardingStore'
import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'
import { WelcomeSlide } from './slides/WelcomeSlide'
import { ProfileSlide } from './slides/ProfileSlide'
import { ThemeSlide } from './slides/ThemeSlide'
import { LibrarySlide } from './slides/LibrarySlide'
import { FinalSlide } from './slides/FinalSlide'

/**
 * Онбординг первого запуска `#onboarding` — мастер из пяти слайдов:
 * «Привет» → «Профиль» → «Тема» → «Библиотека» → «Финал».
 *
 * Переходы: во время смены слайда уходящий и приходящий рендерятся вместе
 * (`prev` !== null) и разъезжаются по горизонтали; направление `dir` (1 вперёд,
 * −1 назад) определяет, в какую сторону. Через EXIT_MS уходящий размонтируется.
 * Сама анимация — в shared/styles/onboarding.css (.ob-enter / .ob-leave).
 *
 * Тема применяется live на клик (applyTheme → CSS-переменные), поэтому карточка
 * онбординга перекрашивается сама. Профиль (ник/аватар/баннер) коммитится в
 * useProfileStore один раз, при переходе на «Финал», — чтобы «Назад» не оставлял
 * следов. Папки библиотеки — исключение: они уходят в Rust сразу (см. LibrarySlide).
 *
 * Показ гейтит useOnboardingStore.done. В DEV показать заново: `showOnboarding()`.
 */

/** Длительность перекрытия слайдов, мс. Должна покрывать .ob-enter / .ob-leave. */
const EXIT_MS = 360
/** Сколько «Финал» висит перед угасанием оверлея, мс. */
const FINAL_MS = 1900
/** Длительность obOut, мс. */
const FADE_MS = 420

const WELCOME = 0
const LAST_FORM = 3
const FINAL = 4
/** Точки прогресса — только шаги-формы. */
const FORM_STEPS = [1, 2, 3]

export const Onboarding = () => {
  const t = useT()
  const done = useOnboardingStore((s) => s.done)
  const finish = useOnboardingStore((s) => s.finish)
  const applyTheme = useThemeStore((s) => s.applyTheme)
  const setProfile = useProfileStore((s) => s.setProfile)

  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [cover, setCover] = useState<string | null>(null)
  const [theme, setTheme] = useState<string>(
    () => useThemeStore.getState().activeThemeId || THEME_PRESETS[0]!.id,
  )

  const [step, setStep] = useState(WELCOME)
  const [prev, setPrev] = useState<number | null>(null)
  const [dir, setDir] = useState<1 | -1>(1)
  const [exiting, setExiting] = useState(false)

  const timers = useRef<number[]>([])
  const after = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }
  useEffect(() => () => timers.current.forEach(window.clearTimeout), [])

  // Снять уходящий слайд после того, как отыграет его анимация.
  useEffect(() => {
    if (prev === null) return
    const id = window.setTimeout(() => setPrev(null), EXIT_MS)
    return () => window.clearTimeout(id)
  }, [prev])

  if (done) return null

  const go = (next: number) => {
    if (next === step || prev !== null) return // перехода не начинаем поверх идущего
    setDir(next > step ? 1 : -1)
    setPrev(step)
    setStep(next)
  }

  const pickTheme = (id: string) => {
    setTheme(id)
    // applyTheme принудительно гасит autoAccent (пресет несёт свой accent).
    // В онбординге тумблер стоит рядом с сеткой, поэтому его состояние возвращаем.
    const auto = useThemeStore.getState().autoAccent
    applyTheme(id) // live: CSS-переменные меняются, карточка перекрашивается
    if (auto) useThemeStore.getState().setAutoAccent(true)
  }

  /** Записать профиль, показать «Финал», затем погасить оверлей. */
  const complete = () => {
    const nm = name.trim() || t('common.defaultUser')
    // Тему НЕ применяем повторно: она уже применена live на клик, а лишний
    // applyTheme здесь сбросил бы включённый пользователем autoAccent.

    const patch: Parameters<typeof setProfile>[0] = { name: nm }
    if (avatar) patch.avatar = avatar
    setProfile(patch)
    // Обложку → баннер профиля (сжатие до 800px).
    if (cover) {
      void compressCover(cover, 800, 0.88)
        .then((c) => setProfile({ banner: c }))
        .catch(() => setProfile({ banner: cover }))
    }

    go(FINAL)
    after(FINAL_MS, () => {
      setExiting(true)
      after(FADE_MS, () => finish())
    })
  }

  const next = () => (step === LAST_FORM ? complete() : go(step + 1))

  const renderSlide = (i: number) => {
    switch (i) {
      case 0:
        return <WelcomeSlide />
      case 1:
        return (
          <ProfileSlide
            name={name}
            onName={setName}
            avatar={avatar}
            onAvatar={setAvatar}
            cover={cover}
            onCover={setCover}
            onSubmit={next}
          />
        )
      case 2:
        return <ThemeSlide active={theme} onPick={pickTheme} />
      case 3:
        return <LibrarySlide />
      default:
        return <FinalSlide name={name.trim() || t('common.defaultUser')} avatar={avatar} />
    }
  }

  const centered = (i: number) => i === WELCOME || i === FINAL
  const slideCls = (i: number, role: 'enter' | 'leave') =>
    `ob-slide ob-${role}${centered(i) ? ' ob-slide-center' : ''}`

  const progress = (step / FINAL) * 100

  return createPortal(
    <div id="onboarding" className={exiting ? 'ob-exiting' : undefined}>
      <div className="ob-orb ob-orb-1" />
      <div className="ob-orb ob-orb-2" />

      <div className="ob-shell">
        <div className="ob-progress">
          <div className="ob-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="ob-stage">
          {prev !== null && (
            <div key={`s${prev}`} className={slideCls(prev, 'leave')} data-dir={dir}>
              {renderSlide(prev)}
            </div>
          )}
          <div key={`s${step}`} className={slideCls(step, 'enter')} data-dir={dir}>
            {renderSlide(step)}
          </div>
        </div>

        {step === WELCOME && (
          <div className="ob-foot">
            <button className="ob-btn ob-btn-primary ob-btn-block" onClick={() => go(1)}>
              {t('onb.hello.cta')}
              <Ico name="arrowRight" width={13} height={13} />
            </button>
          </div>
        )}

        {step >= 1 && step <= LAST_FORM && (
          <div className="ob-foot">
            <button className="ob-btn ob-btn-ghost" onClick={() => go(step - 1)}>
              <Ico name="arrowLeft" width={13} height={13} />
              {t('onb.back')}
            </button>

            <div className="ob-dots">
              {FORM_STEPS.map((i) => (
                <div key={i} className={`ob-dot${i === step ? ' active' : ''}`} />
              ))}
            </div>

            <button className="ob-btn ob-btn-primary" onClick={next}>
              {step === LAST_FORM ? t('onb.done') : t('onb.next')}
              <Ico name={step === LAST_FORM ? 'check' : 'arrowRight'} width={13} height={13} />
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
