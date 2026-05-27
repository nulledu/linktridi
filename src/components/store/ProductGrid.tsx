import type { Product, StoreColors } from '../../types/store'
import ProductCard from './ProductCard'

interface ProductGridProps {
  products: Product[]
  colors: StoreColors
}

function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 px-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-2xl overflow-hidden animate-pulse">
          <div className="aspect-square bg-gray-100" />
          <div className="p-3 space-y-2">
            <div className="h-3 bg-gray-100 rounded w-3/4" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
            <div className="h-5 bg-gray-100 rounded w-1/3" />
            <div className="h-9 bg-gray-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function ProductGrid({ products, colors }: ProductGridProps) {
  const active = products
    .filter((p) => p.is_active)
    .sort((a, b) => a.order_index - b.order_index)

  if (active.length === 0) return null

  return (
    <section className="py-5" id="produtos" style={{ backgroundColor: colors.bg }}>
      <div className="grid grid-cols-2 gap-3 px-3 max-w-lg mx-auto">
        {active.map((p) => (
          <ProductCard key={p.id} product={p} colors={colors} />
        ))}
      </div>
    </section>
  )
}

export { ProductGridSkeleton }
