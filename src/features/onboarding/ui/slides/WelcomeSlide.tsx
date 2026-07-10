import { useT } from '@shared/i18n'

/**
 * Слайд «Привет»: логотип приложения в пульсирующих кольцах, вордмарк и слоган.
 * Кнопка «Поехали» живёт в подвале оболочки.
 */
export const WelcomeSlide = () => {
  const t = useT()
  return (
    <div className="ob-body">
      <div className="ob-mark">
        <img src="/logo.png" alt="" className="ob-mark-img" />
      </div>
      <div className="ob-wordmark">Bloom</div>
      <div className="ob-tagline">{t('onb.tagline')}</div>
      <div className="ob-sub">{t('onb.hello.sub')}</div>
    </div>
  )
}
