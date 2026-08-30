import { useT } from '@shared/i18n'
import { Ico } from '@shared/ui/icons/solar'

/** Слайд «Финал»: приветствие по имени. Оболочка сама уводит его в fade-out. */
interface Props {
  name: string
  avatar: string | null
}

export const FinalSlide = ({ name, avatar }: Props) => {
  const t = useT()
  return (
    <div className="ob-body">
      <div className="ob-final-ava">
        {avatar ? (
          <img src={avatar} alt="" />
        ) : (
          <Ico name="user" variant="bold" width={40} height={40} style={{ color: 'var(--text)', opacity: 0.22 }} />
        )}
      </div>
      <div className="ob-final-title">{t('onb.welcome', { name })}</div>
      <div className="ob-final-sub">
        {t('onb.welcomeSub')}
        <Ico name="note" width={13} height={13} />
      </div>
    </div>
  )
}
