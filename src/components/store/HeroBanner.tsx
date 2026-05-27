import type { HeroBannerConfig, StoreColors } from '../../types/store'

interface HeroBannerProps {
  hero: HeroBannerConfig
  colors: StoreColors
}

export default function HeroBanner({ hero, colors }: HeroBannerProps) {
  return (
    <section style={{ backgroundColor: colors.bg }}>
      {/* Mídia em destaque */}
      {hero.media_url && (
        <div className="w-full overflow-hidden">
          {hero.media_type === 'video' ? (
            <video
              src={hero.media_url}
              className="w-full aspect-video object-cover"
              autoPlay
              muted
              loop
              playsInline
            />
          ) : (
            <img
              src={hero.media_url}
              alt=""
              className="w-full aspect-video object-cover"
            />
          )}
        </div>
      )}

      {/* Texto + CTA */}
      <div className="px-5 pt-6 pb-8 text-center">
        <h1
          className="text-[26px] font-black leading-[1.2] tracking-tight mb-3"
          style={{ color: colors.text }}
        >
          {hero.headline}
        </h1>
        <p
          className="text-[14px] leading-relaxed mb-7 max-w-xs mx-auto"
          style={{ color: colors.text, opacity: 0.65 }}
        >
          {hero.subheadline}
        </p>
        <a
          href={hero.cta_url}
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-bold text-[15px] text-white shadow-lg transition-opacity hover:opacity-90 active:scale-95"
          style={{ backgroundColor: colors.primary }}
        >
          {hero.cta_text}
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </a>
      </div>
    </section>
  )
}
