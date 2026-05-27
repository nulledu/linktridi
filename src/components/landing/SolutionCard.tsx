import type { SolutionItem, LandingColors } from '../../types/landing'

interface SolutionCardProps {
  item: SolutionItem
  colors: LandingColors
}

export default function SolutionCard({ item, colors }: SolutionCardProps) {
  return (
    <a
      href={item.link_url || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col rounded-2xl overflow-hidden border transition-all duration-200 hover:-translate-y-1 hover:shadow-lg active:scale-[0.97]"
      style={{
        backgroundColor: colors.card_bg,
        borderColor: `${colors.primary}25`,
      }}
    >
      {/* Mídia do card */}
      <div className="aspect-square w-full overflow-hidden bg-gray-100">
        {item.media_url ? (
          item.media_type === 'video' ? (
            <video
              src={item.media_url}
              className="w-full h-full object-cover"
              muted
              loop
              playsInline
              poster={item.thumbnail_url || undefined}
            />
          ) : (
            <img
              src={item.media_url}
              alt={item.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: `${colors.primary}10` }}>
            <svg className="w-10 h-10 opacity-20" fill="currentColor" style={{ color: colors.primary }} viewBox="0 0 24 24">
              <path d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
          </div>
        )}
      </div>

      {/* Conteúdo */}
      <div className="p-3 flex flex-col gap-1">
        <h3
          className="text-[13px] font-bold leading-snug"
          style={{ color: colors.text }}
        >
          {item.title || 'Título da Solução'}
        </h3>
        <p
          className="text-[11px] leading-snug line-clamp-2"
          style={{ color: colors.text, opacity: 0.6 }}
        >
          {item.description || 'Descrição breve da solução.'}
        </p>
        <span
          className="mt-1 text-[11px] font-bold flex items-center gap-1"
          style={{ color: colors.primary }}
        >
          Saiba mais
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </span>
      </div>
    </a>
  )
}
