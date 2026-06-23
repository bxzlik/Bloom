/**
 * Маскот «Bloom-питомца» — статичная мордочка-росток. Один источник для обложки
 * витрины (GamesModal) и иконки в шапке игры (GameTopBar), чтобы они совпадали.
 */
export const PetMark = ({ size = 20, className }: { size?: number; className?: string }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path d="M32 30c-7 0-12 5-12 14 0 6 5 10 12 10s12-4 12-10c0-9-5-14-12-14Z" fill="#9CCB7A" />
    <path d="M32 32c-9-2-16-9-15-19 9-2 16 6 15 19Z" fill="#7FB45F" />
    <path d="M32 32c9-2 16-9 15-19-9-2-16 6-15 19Z" fill="#8FC06F" />
    <circle cx="27" cy="44" r="2.4" fill="#33402c" />
    <circle cx="37" cy="44" r="2.4" fill="#33402c" />
    <path d="M29 49c1.6 1.4 4.4 1.4 6 0" stroke="#33402c" strokeWidth="2" strokeLinecap="round" />
    <circle cx="22.5" cy="48" r="2.6" fill="#F4A9A0" opacity="0.7" />
    <circle cx="41.5" cy="48" r="2.6" fill="#F4A9A0" opacity="0.7" />
  </svg>
)
