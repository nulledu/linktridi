import { useRef, useState } from 'react'
import type { Product, StoreColors } from '../../types/store'

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

interface ProductCardProps {
  product: Product
  colors: StoreColors
}

export default function ProductCard({ product, colors }: ProductCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hovered, setHovered] = useState(false)

  function handleMouseEnter() {
    setHovered(true)
    if (product.media_type === 'video' && videoRef.current) {
      videoRef.current.play().catch(() => {})
    }
  }

  function handleMouseLeave() {
    setHovered(false)
    if (product.media_type === 'video' && videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
    }
  }

  function handleCTA(e: React.MouseEvent) {
    e.preventDefault()
    if (product.checkout_url) {
      window.open(product.checkout_url, '_blank', 'noopener,noreferrer')
    }
  }

  const hasDiscount =
    product.original_price > 0 && product.original_price > product.sale_price

  const discountPct = hasDiscount
    ? Math.round(
        ((product.original_price - product.sale_price) / product.original_price) * 100
      )
    : 0

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden border border-black/5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
      style={{ backgroundColor: colors.card_bg }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Mídia */}
      <div className="relative aspect-square overflow-hidden bg-gray-100">
        {product.media_url ? (
          product.media_type === 'video' ? (
            <>
              {product.thumbnail_url && !hovered && (
                <img
                  src={product.thumbnail_url}
                  alt={product.name}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
              <video
                ref={videoRef}
                src={product.media_url}
                className="w-full h-full object-cover"
                muted
                loop
                playsInline
                preload="metadata"
              />
            </>
          ) : (
            <img
              src={product.media_url}
              alt={product.name}
              className={`w-full h-full object-cover transition-transform duration-300 ${
                hovered ? 'scale-105' : 'scale-100'
              }`}
              loading="lazy"
            />
          )
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: `${colors.primary}08` }}
          >
            <svg
              className="w-12 h-12 opacity-15"
              fill="currentColor"
              style={{ color: colors.primary }}
              viewBox="0 0 24 24"
            >
              <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* Badge personalizada */}
        {product.badge && (
          <div
            className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow"
            style={{ backgroundColor: colors.badge_bg }}
          >
            {product.badge}
          </div>
        )}

        {/* Desconto % automático (quando não há badge) */}
        {hasDiscount && !product.badge && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white bg-red-500 shadow">
            -{discountPct}%
          </div>
        )}
      </div>

      {/* Conteúdo */}
      <div className="p-3 flex flex-col gap-1 flex-1">
        <h3
          className="text-[13px] font-bold leading-snug line-clamp-2"
          style={{ color: colors.text }}
        >
          {product.name || 'Nome do Produto'}
        </h3>

        {product.description && (
          <p
            className="text-[11px] leading-snug line-clamp-1"
            style={{ color: colors.text, opacity: 0.55 }}
          >
            {product.description}
          </p>
        )}

        {/* Preços */}
        <div className="flex flex-col mt-auto pt-1.5">
          {hasDiscount && (
            <span
              className="text-[11px] line-through leading-tight"
              style={{ color: colors.text, opacity: 0.4 }}
            >
              {formatBRL(product.original_price)}
            </span>
          )}
          <span
            className="text-[18px] font-black leading-tight"
            style={{ color: colors.price }}
          >
            {formatBRL(product.sale_price)}
          </span>
        </div>

        {/* CTA */}
        <button
          onClick={handleCTA}
          className="w-full mt-1.5 py-2.5 rounded-xl text-[13px] font-bold text-white transition-opacity hover:opacity-90 active:scale-[0.97]"
          style={{ backgroundColor: colors.primary }}
        >
          Comprar Agora
        </button>
      </div>
    </div>
  )
}
