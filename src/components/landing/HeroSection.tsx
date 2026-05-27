import type { HeroConfig, LandingColors } from '../../types/landing'

interface HeroSectionProps {
  hero: HeroConfig
  colors: LandingColors
}

export default function HeroSection({ hero, colors }: HeroSectionProps) {
  return (
    <section
      className="w-full px-5 pt-14 pb-12 flex flex-col items-center text-center"
      style={{ backgroundColor: colors.bg }}
    >
      {/* Mídia (imagem ou vídeo) */}
      {hero.media_url && (
        <div className="w-full max-w-lg mb-8 rounded-2xl overflow-hidden shadow-xl">
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

      {/* Eyebrow */}
      <span
        className="inline-block text-[11px] font-bold uppercase tracking-widest mb-3 px-3 py-1 rounded-full"
        style={{ color: colors.primary, backgroundColor: `${colors.primary}15` }}
      >
        Plataforma B2B
      </span>

      {/* H1 */}
      <h1
        className="text-[28px] font-black leading-[1.2] tracking-tight mb-4 max-w-sm"
        style={{ color: colors.text }}
      >
        {hero.title}
      </h1>

      {/* Subtítulo */}
      <p
        className="text-[15px] leading-relaxed mb-8 max-w-xs"
        style={{ color: colors.text, opacity: 0.65 }}
      >
        {hero.subtitle}
      </p>

      {/* CTA */}
      <a
        href={hero.cta_url}
        className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-[15px] text-white shadow-lg transition-opacity hover:opacity-90 active:opacity-75 active:scale-95"
        style={{ backgroundColor: colors.primary }}
      >
        {hero.cta_text}
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </a>

      {/* Prova social */}
      <p
        className="mt-5 text-[12px]"
        style={{ color: colors.text, opacity: 0.4 }}
      >
        Sem compromisso · Resposta em até 24h
      </p>
    </section>
  )
}
