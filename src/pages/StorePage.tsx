import { useStoreConfig } from '../hooks/useStoreConfig'
import PromoBanner from '../components/store/PromoBanner'
import StoreHeader from '../components/store/StoreHeader'
import HeroBanner from '../components/store/HeroBanner'
import ProductGrid, { ProductGridSkeleton } from '../components/store/ProductGrid'

export default function StorePage() {
  const { config, loading } = useStoreConfig()

  return (
    <div className="min-h-screen" style={{ backgroundColor: config.colors.bg }}>
      <PromoBanner promo={config.promo} colors={config.colors} />
      <StoreHeader config={config} />
      <HeroBanner hero={config.hero} colors={config.colors} />

      {/* Separador do catálogo */}
      <div className="px-3 pt-4 pb-2" style={{ backgroundColor: config.colors.bg }}>
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <div className="flex-1 h-px bg-black/8" />
          <span
            className="text-[11px] font-bold uppercase tracking-widest"
            style={{ color: config.colors.text, opacity: 0.35 }}
          >
            Catálogo
          </span>
          <div className="flex-1 h-px bg-black/8" />
        </div>
      </div>

      {loading ? (
        <ProductGridSkeleton />
      ) : (
        <ProductGrid products={config.products} colors={config.colors} />
      )}

      {!loading && config.products.filter((p) => p.is_active).length === 0 && (
        <div
          className="py-20 text-center text-[14px]"
          style={{ color: config.colors.text, opacity: 0.35 }}
        >
          Nenhum produto disponível no momento.
        </div>
      )}

      <footer
        className="w-full py-8 text-center text-[12px]"
        style={{ color: config.colors.text, opacity: 0.3 }}
      >
        © {new Date().getFullYear()} {config.brand_name} · Todos os direitos reservados
      </footer>
    </div>
  )
}
