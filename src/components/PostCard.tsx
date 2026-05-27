import type { Post } from '../types'

interface PostCardProps {
  post: Post
  cardBg?: string
}

function formatBRL(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Retorna true se a cor hex for percebida como clara (luminância > 50%) */
function isLightColor(hex: string): boolean {
  const h = hex.replace('#', '')
  if (h.length < 6) return false
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5
}

export default function PostCard({ post, cardBg }: PostCardProps) {
  function handleClick() {
    if (post.destination_url) {
      window.open(post.destination_url, '_blank', 'noopener,noreferrer')
    }
  }

  const badge = post.badge
  const category = post.price_prefix
  const priceSuffix = post.price_suffix
  const ctaLabel = post.cta_label || 'Comprar agora'
  const hasPrice = post.price != null && post.price > 0
  const titleSize = post.title_size === 'sm' ? '10px' : post.title_size === 'lg' ? '18px' : '13px'

  const light = isLightColor(cardBg ?? '#18181b')
  const titleColor   = light ? '#18181b' : '#ffffff'
  const prefixColor  = light ? '#52525b' : '#71717a'
  const suffixColor  = light ? '#71717a' : '#a1a1aa'

  return (
    <div
      onClick={handleClick}
      className="rounded-2xl overflow-hidden flex flex-col cursor-pointer select-none transition-all active:scale-[0.97] will-change-transform"
      style={{ backgroundColor: cardBg ?? '#18181b', boxShadow: '0 0 18px rgba(139,92,246,0.35), 0 8px 32px rgba(0,0,0,0.5)' }}
    >
      {/* Mídia */}
      <div className="relative w-full aspect-square overflow-hidden" style={{ backgroundColor: '#eef2ff' }}>
        {post.type === 'image' ? (
          <img
            src={post.media_url}
            alt={post.caption ?? ''}
            className="w-full h-full object-cover"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <video
            src={post.media_url}
            className="w-full h-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
          />
        )}
      </div>

      {/* Conteúdo */}
      <div className="flex flex-col px-3 pt-3 pb-3 gap-1.5 flex-1">
        {/* Badge */}
        {badge && (
          <div>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide uppercase text-white"
              style={{ backgroundColor: '#FF6000' }}
            >
              🔥 {badge}
            </span>
          </div>
        )}
        {/* Título */}
        {post.caption && (
          <h3
            className="font-black leading-tight"
            style={{ fontSize: titleSize, color: titleColor }}
          >
            {post.caption}
          </h3>
        )}

        {/* Prefixo + Preço (só aparece se preço estiver preenchido) */}
        {hasPrice && (
          <>
            {category && (
              <p className="text-[9px] font-bold uppercase tracking-[0.22em]" style={{ color: prefixColor }}>
                {category}
              </p>
            )}
            <p className="text-[15px] font-black leading-none" style={{ color: '#22c55e' }}>
              R$ {formatBRL(post.price!)}
            </p>
          </>
        )}

        {/* Garantia / sufixo */}
        {priceSuffix && (
          <p className="text-[10px] flex items-start gap-1" style={{ color: suffixColor }}>
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="#22c55e" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            {priceSuffix}
          </p>
        )}

        <div className="flex-1 min-h-[10px]" />

        {/* Botão CTA */}
        <button
          type="button"
          className="w-full py-2.5 rounded-xl text-[11px] font-black text-white uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all active:brightness-90"
          style={{ backgroundColor: '#16a34a' }}
        >
          {ctaLabel}
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
          </svg>
        </button>
      </div>
    </div>
  )
}
