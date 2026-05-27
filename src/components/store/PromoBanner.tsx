import type { PromoBannerConfig, StoreColors } from '../../types/store'

interface PromoBannerProps {
  promo: PromoBannerConfig
  colors: StoreColors
}

export default function PromoBanner({ promo, colors }: PromoBannerProps) {
  if (!promo.active || !promo.text) return null

  return (
    <div
      className="w-full py-2 px-4 text-center text-[12px] font-semibold text-white tracking-wide"
      style={{ backgroundColor: colors.primary }}
    >
      {promo.text}
    </div>
  )
}
