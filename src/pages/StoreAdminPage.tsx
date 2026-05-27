import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { DEFAULT_STORE_CONFIG } from '../hooks/useStoreConfig'
import type {
  StoreConfig,
  StoreColors,
  HeroBannerConfig,
  PromoBannerConfig,
  Product,
} from '../types/store'
import PromoBanner from '../components/store/PromoBanner'
import StoreHeader from '../components/store/StoreHeader'
import HeroBanner from '../components/store/HeroBanner'
import ProductGrid from '../components/store/ProductGrid'

// ─────────────────────────────────────────────────────────────────────────────
// Atoms reutilizáveis no editor
// ─────────────────────────────────────────────────────────────────────────────

function FL({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-bold text-[#6b7280] uppercase tracking-wide mb-1">
      {children}
    </label>
  )
}

function TI({
  value, onChange, placeholder, type = 'text',
}: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 text-[13px] border border-[#e5e7eb] rounded-lg bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
    />
  )
}

function NI({
  value, onChange, placeholder,
}: { value: number; onChange: (v: number) => void; placeholder?: string }) {
  return (
    <input
      type="number"
      min={0}
      step={0.01}
      value={value === 0 ? '' : value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      placeholder={placeholder ?? '0,00'}
      className="w-full px-3 py-2 text-[13px] border border-[#e5e7eb] rounded-lg bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
    />
  )
}

function TA({
  value, onChange, placeholder, rows = 2,
}: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-2 text-[13px] border border-[#e5e7eb] rounded-lg bg-white outline-none focus:border-blue-400 resize-none"
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Color Row
// ─────────────────────────────────────────────────────────────────────────────

const COLOR_LABELS: Record<keyof StoreColors, string> = {
  bg: 'Fundo da Loja',
  primary: 'Cor da Marca (Botões)',
  text: 'Cor do Texto',
  card_bg: 'Fundo dos Cards',
  price: 'Cor do Preço',
  badge_bg: 'Cor das Etiquetas',
}

function ColorRow({ colorKey, value, onChange }: {
  colorKey: keyof StoreColors
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[13px] text-[#374151] flex-1 mr-3 leading-tight">
        {COLOR_LABELS[colorKey]}
      </span>
      <div className="flex items-center gap-2 flex-shrink-0">
        <label className="relative cursor-pointer">
          <div
            className="w-8 h-8 rounded-lg border-2 border-white shadow-md ring-1 ring-gray-200 hover:scale-110 transition-transform"
            style={{ backgroundColor: value }}
          />
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) onChange(e.target.value) }}
          maxLength={7}
          className="w-[82px] px-2 py-1 text-[12px] font-mono border border-[#e5e7eb] rounded-lg bg-white outline-none focus:border-blue-400 uppercase"
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Media Uploader
// ─────────────────────────────────────────────────────────────────────────────

function MediaUploader({ mediaUrl, mediaType, onUrlChange, onTypeChange }: {
  mediaUrl: string
  mediaType: 'image' | 'video'
  onUrlChange: (url: string) => void
  onTypeChange: (t: 'image' | 'video') => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function upload(file: File) {
    setUploading(true)
    const path = `store/${crypto.randomUUID()}.${file.name.split('.').pop()}`
    const { data, error } = await supabase.storage.from('media').upload(path, file, { upsert: true })
    if (!error && data) {
      const { data: u } = supabase.storage.from('media').getPublicUrl(data.path)
      onUrlChange(u.publicUrl)
      onTypeChange(file.type.startsWith('video') ? 'video' : 'image')
    }
    setUploading(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {(['image', 'video'] as const).map((t) => (
          <button key={t} type="button" onClick={() => onTypeChange(t)}
            className={`flex-1 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors ${mediaType === t ? 'bg-blue-600 text-white border-blue-600' : 'border-[#e5e7eb] text-[#374151]'}`}>
            {t === 'image' ? '🖼 Imagem' : '🎬 Vídeo'}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input ref={ref} type="file" accept={mediaType === 'image' ? 'image/*' : 'video/*'} className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f) }} />
        <button type="button" onClick={() => ref.current?.click()} disabled={uploading}
          className="px-3 py-2 text-[12px] border border-[#e5e7eb] rounded-lg bg-[#f9fafb] hover:bg-[#f3f4f6] disabled:opacity-50 font-medium">
          {uploading ? 'Enviando…' : 'Escolher arquivo'}
        </button>
        {mediaUrl && <span className="text-[11px] text-blue-600">✓ Carregado</span>}
      </div>
      {mediaUrl && (
        <div className="w-full h-20 rounded-xl overflow-hidden bg-gray-100">
          {mediaType === 'video'
            ? <video src={mediaUrl} className="w-full h-full object-cover" muted playsInline />
            : <img src={mediaUrl} alt="" className="w-full h-full object-cover" />}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Uploader de logo da marca (só imagem)
// ─────────────────────────────────────────────────────────────────────────────

function LogoUploader({ logoUrl, onUrlChange }: { logoUrl: string; onUrlChange: (url: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function upload(file: File) {
    setUploading(true)
    const path = `store/logos/${crypto.randomUUID()}.${file.name.split('.').pop()}`
    const { data, error } = await supabase.storage.from('media').upload(path, file, { upsert: true })
    if (!error && data) {
      const { data: u } = supabase.storage.from('media').getPublicUrl(data.path)
      onUrlChange(u.publicUrl)
    }
    setUploading(false)
  }

  return (
    <div className="flex items-center gap-3">
      <div className="w-12 h-12 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] overflow-hidden flex items-center justify-center">
        {logoUrl
          ? <img src={logoUrl} alt="" className="w-full h-full object-contain" />
          : <svg className="w-6 h-6 text-gray-300" fill="currentColor" viewBox="0 0 24 24"><path d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>}
      </div>
      <div>
        <input ref={ref} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f) }} />
        <button type="button" onClick={() => ref.current?.click()} disabled={uploading}
          className="text-[13px] text-blue-600 font-semibold disabled:opacity-50">
          {uploading ? 'Enviando…' : logoUrl ? 'Trocar logo' : 'Enviar logo'}
        </button>
        <p className="text-[11px] text-[#9ca3af] mt-0.5">PNG/SVG transparente</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Editor de produto (collapsible)
// ─────────────────────────────────────────────────────────────────────────────

const BADGE_PRESETS = ['Mais Vendido', 'Novidade', 'Promoção', 'Exclusivo', 'Lançamento']

function ProductEditor({ item, index, total, onChange, onRemove, onMove }: {
  item: Product
  index: number
  total: number
  onChange: (p: Product) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
}) {
  const [open, setOpen] = useState(index === 0)

  return (
    <div className="border border-[#e5e7eb] rounded-xl overflow-hidden bg-white">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-[#f9fafb]">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 flex-1 text-left">
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-[13px] font-semibold text-[#374151] truncate max-w-[140px]">
            {item.name || `Produto #${index + 1}`}
          </span>
          {/* Toggle ativo */}
          <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
            {item.is_active ? 'Ativo' : 'Oculto'}
          </span>
        </button>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-25">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-25">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
          <button type="button" onClick={onRemove} className="p-1 text-red-400 hover:text-red-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      {/* Corpo */}
      {open && (
        <div className="p-3 space-y-3">
          {/* Ativo/inativo */}
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-[#374151] font-medium">Visível na vitrine</span>
            <button type="button" onClick={() => onChange({ ...item, is_active: !item.is_active })}
              className={`relative w-10 h-5 rounded-full transition-colors ${item.is_active ? 'bg-green-500' : 'bg-gray-200'}`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${item.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          <div>
            <FL>Nome do produto</FL>
            <TI value={item.name} onChange={(v) => onChange({ ...item, name: v })} placeholder="Nome do produto" />
          </div>

          <div>
            <FL>Descrição curta</FL>
            <TA value={item.description} onChange={(v) => onChange({ ...item, description: v })} placeholder="Descrição breve para o card" rows={2} />
          </div>

          {/* Preços lado a lado */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FL>Preço De (riscado)</FL>
              <NI value={item.original_price} onChange={(v) => onChange({ ...item, original_price: v })} placeholder="0,00" />
            </div>
            <div>
              <FL>Preço Por ★</FL>
              <NI value={item.sale_price} onChange={(v) => onChange({ ...item, sale_price: v })} placeholder="0,00" />
            </div>
          </div>

          {/* Mídia */}
          <div>
            <FL>Foto / Vídeo do produto</FL>
            <MediaUploader
              mediaUrl={item.media_url}
              mediaType={item.media_type}
              onUrlChange={(url) => onChange({ ...item, media_url: url })}
              onTypeChange={(t) => onChange({ ...item, media_type: t })}
            />
          </div>

          {/* Badge */}
          <div>
            <FL>Etiqueta (badge)</FL>
            <div className="flex flex-wrap gap-1 mb-2">
              {BADGE_PRESETS.map((b) => (
                <button key={b} type="button"
                  onClick={() => onChange({ ...item, badge: item.badge === b ? '' : b })}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${item.badge === b ? 'bg-red-500 text-white border-red-500' : 'border-[#e5e7eb] text-[#374151]'}`}>
                  {b}
                </button>
              ))}
            </div>
            <TI value={item.badge} onChange={(v) => onChange({ ...item, badge: v })} placeholder="Ou digite uma etiqueta personalizada" />
          </div>

          {/* Link checkout */}
          <div>
            <FL>Link de checkout / compra</FL>
            <TI value={item.checkout_url} onChange={(v) => onChange({ ...item, checkout_url: v })} placeholder="https://..." type="url" />
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Painel editor (3 abas)
// ─────────────────────────────────────────────────────────────────────────────

type EditorTab = 'visual' | 'vitrine' | 'produtos'

interface EditorPanelProps {
  draft: StoreConfig
  onColors: (k: keyof StoreColors, v: string) => void
  onBrand: (k: 'brand_name' | 'brand_logo_url' | 'whatsapp_url', v: string) => void
  onPromo: (k: keyof PromoBannerConfig, v: string | boolean) => void
  onHero: (k: keyof HeroBannerConfig, v: string) => void
  onAddProduct: () => void
  onUpdateProduct: (i: number, p: Product) => void
  onRemoveProduct: (i: number) => void
  onMoveProduct: (i: number, dir: -1 | 1) => void
}

function EditorPanel({ draft, onColors, onBrand, onPromo, onHero, onAddProduct, onUpdateProduct, onRemoveProduct, onMoveProduct }: EditorPanelProps) {
  const [tab, setTab] = useState<EditorTab>('visual')

  const TABS: { key: EditorTab; label: string; icon: string }[] = [
    { key: 'visual', label: 'Visual', icon: '🎨' },
    { key: 'vitrine', label: 'Vitrine', icon: '🏪' },
    { key: 'produtos', label: 'Produtos', icon: '📦' },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-[#e5e7eb] bg-white flex-shrink-0">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors ${tab === t.key ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50' : 'text-[#6b7280] hover:text-[#374151]'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── ABA VISUAL ── */}
        {tab === 'visual' && (
          <div className="space-y-4">
            <div>
              <p className="text-[13px] font-bold text-[#374151] mb-3">Identidade da Marca</p>
              <div className="space-y-3">
                <div>
                  <FL>Nome da marca</FL>
                  <TI value={draft.brand_name} onChange={(v) => onBrand('brand_name', v)} placeholder="Nome da marca" />
                </div>
                <div>
                  <FL>Logo</FL>
                  <LogoUploader logoUrl={draft.brand_logo_url} onUrlChange={(url) => onBrand('brand_logo_url', url)} />
                </div>
                <div>
                  <FL>Link WhatsApp</FL>
                  <TI value={draft.whatsapp_url} onChange={(v) => onBrand('whatsapp_url', v)} placeholder="https://wa.me/55..." type="url" />
                </div>
              </div>
            </div>
            <div>
              <p className="text-[13px] font-bold text-[#374151] mb-3">Cores da Marca</p>
              <div className="divide-y divide-[#f3f4f6]">
                {(Object.keys(draft.colors) as (keyof StoreColors)[]).map((k) => (
                  <ColorRow key={k} colorKey={k} value={draft.colors[k]} onChange={(v) => onColors(k, v)} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── ABA VITRINE ── */}
        {tab === 'vitrine' && (
          <div className="space-y-4">
            {/* Faixa promo */}
            <div className="border border-[#e5e7eb] rounded-xl p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-bold text-[#374151]">Faixa de Oferta</p>
                <button type="button" onClick={() => onPromo('active', !draft.promo.active)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${draft.promo.active ? 'bg-green-500' : 'bg-gray-200'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${draft.promo.active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <div>
                <FL>Texto da faixa</FL>
                <TI value={draft.promo.text} onChange={(v) => onPromo('text', v)} placeholder="🚛 Frete grátis para CNPJ acima de R$ 500" />
              </div>
            </div>

            {/* Hero */}
            <div className="border border-[#e5e7eb] rounded-xl p-3 space-y-3">
              <p className="text-[13px] font-bold text-[#374151]">Banner Principal</p>
              <div>
                <FL>Mídia do banner</FL>
                <MediaUploader
                  mediaUrl={draft.hero.media_url}
                  mediaType={draft.hero.media_type}
                  onUrlChange={(url) => onHero('media_url', url)}
                  onTypeChange={(t) => onHero('media_type', t)}
                />
              </div>
              <div>
                <FL>Título principal</FL>
                <TA value={draft.hero.headline} onChange={(v) => onHero('headline', v)} placeholder="Texto impactante focado no benefício" rows={2} />
              </div>
              <div>
                <FL>Subtítulo</FL>
                <TA value={draft.hero.subheadline} onChange={(v) => onHero('subheadline', v)} placeholder="Detalhe o valor para o cliente B2B" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FL>Texto do botão</FL>
                  <TI value={draft.hero.cta_text} onChange={(v) => onHero('cta_text', v)} placeholder="Ver Catálogo" />
                </div>
                <div>
                  <FL>URL do botão</FL>
                  <TI value={draft.hero.cta_url} onChange={(v) => onHero('cta_url', v)} placeholder="#produtos" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── ABA PRODUTOS ── */}
        {tab === 'produtos' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-[#374151]">Produtos ({draft.products.length})</span>
              <button type="button" onClick={onAddProduct}
                className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Adicionar produto
              </button>
            </div>
            {draft.products.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-[#9ca3af] border-2 border-dashed border-[#e5e7eb] rounded-xl">
                Nenhum produto cadastrado.
                <br />Clique em "Adicionar produto" para começar.
              </div>
            ) : (
              <div className="space-y-2">
                {draft.products.map((p, i) => (
                  <ProductEditor key={p.id} item={p} index={i} total={draft.products.length}
                    onChange={(updated) => onUpdateProduct(i, updated)}
                    onRemove={() => onRemoveProduct(i)}
                    onMove={(dir) => onMoveProduct(i, dir)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview (moldura mobile)
// ─────────────────────────────────────────────────────────────────────────────

function StorePreview({ draft }: { draft: StoreConfig }) {
  return (
    <div className="flex flex-col items-center py-6 px-4 bg-[#f3f4f6] min-h-full">
      <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3">
        Preview (mobile)
      </p>
      <div className="w-full max-w-[375px] rounded-3xl shadow-2xl overflow-hidden border-4 border-[#1f2937]"
        style={{ backgroundColor: draft.colors.bg }}>
        <PromoBanner promo={draft.promo} colors={draft.colors} />
        <StoreHeader config={draft} />
        <HeroBanner hero={draft.hero} colors={draft.colors} />
        <ProductGrid products={draft.products} colors={draft.colors} />
        {draft.products.filter(p => p.is_active).length === 0 && (
          <div className="py-8 text-center text-[12px]" style={{ color: draft.colors.text, opacity: 0.35 }}>
            Adicione produtos na aba "Produtos"
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────

export default function StoreAdminPage() {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<StoreConfig>(DEFAULT_STORE_CONFIG)
  const [configId, setConfigId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'editor' | 'preview'>('editor')
  const [publishing, setPublishing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => { authAndLoad() }, [])

  async function authAndLoad() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { navigate('/admin/login'); return }
    const { data } = await supabase.from('store_configs').select('*').limit(1).maybeSingle()
    if (data) { setConfigId(data.id); setDraft({ ...(data.config as StoreConfig), id: data.id }) }
  }

  function mark() { setDirty(true); setSuccessMsg(null) }

  function onColors(k: keyof StoreColors, v: string) { setDraft(p => ({ ...p, colors: { ...p.colors, [k]: v } })); mark() }
  function onBrand(k: 'brand_name' | 'brand_logo_url' | 'whatsapp_url', v: string) { setDraft(p => ({ ...p, [k]: v })); mark() }
  function onPromo(k: keyof PromoBannerConfig, v: string | boolean) { setDraft(p => ({ ...p, promo: { ...p.promo, [k]: v } })); mark() }
  function onHero(k: keyof HeroBannerConfig, v: string) { setDraft(p => ({ ...p, hero: { ...p.hero, [k]: v } })); mark() }

  function addProduct() {
    const p: Product = {
      id: crypto.randomUUID(), name: '', description: '',
      original_price: 0, sale_price: 0,
      media_url: '', media_type: 'image', thumbnail_url: '',
      badge: '', checkout_url: '',
      order_index: draft.products.length, is_active: true,
    }
    setDraft(prev => ({ ...prev, products: [...prev.products, p] })); mark()
  }

  function updateProduct(i: number, p: Product) { setDraft(prev => ({ ...prev, products: prev.products.map((x, idx) => idx === i ? p : x) })); mark() }
  function removeProduct(i: number) { setDraft(prev => ({ ...prev, products: prev.products.filter((_, idx) => idx !== i) })); mark() }
  function moveProduct(i: number, dir: -1 | 1) {
    const arr = [...draft.products]; const t = i + dir
    if (t < 0 || t >= arr.length) return
    ;[arr[i], arr[t]] = [arr[t], arr[i]]; arr.forEach((p, idx) => (p.order_index = idx))
    setDraft(prev => ({ ...prev, products: arr })); mark()
  }

  async function publish() {
    setPublishing(true); setErrorMsg(null)
    const payload = { config: { ...draft }, updated_at: new Date().toISOString() }
    let error
    if (configId) {
      ;({ error } = await supabase.from('store_configs').update(payload).eq('id', configId))
    } else {
      const { data, error: e } = await supabase.from('store_configs').insert(payload).select('id').single()
      error = e; if (data) setConfigId(data.id)
    }
    if (error) { setErrorMsg(error.message) } else { setDirty(false); setSuccessMsg('Vitrine publicada com sucesso! ✓') }
    setPublishing(false)
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-white border-b border-[#e5e7eb] z-20">
        <button onClick={() => navigate('/store')} className="text-[13px] text-blue-600 font-semibold">← Vitrine</button>
        <div className="flex flex-col items-center">
          <h1 className="text-[14px] font-bold text-[#111827]">Editor da Loja</h1>
          {dirty && <span className="text-[10px] text-amber-500 font-semibold">● Rascunho não publicado</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={publish} disabled={!dirty || publishing}
            className="px-3 py-1.5 text-[12px] font-bold text-white bg-blue-600 rounded-lg disabled:opacity-40 hover:bg-blue-700 transition-colors shadow-sm">
            {publishing ? '…' : 'Publicar'}
          </button>
          <button onClick={async () => { await supabase.auth.signOut(); navigate('/') }} className="text-[12px] text-[#9ca3af]">Sair</button>
        </div>
      </header>

      {/* Mobile tabs */}
      <div className="md:hidden flex-shrink-0 flex border-b border-[#e5e7eb]">
        {(['editor', 'preview'] as const).map((v) => (
          <button key={v} type="button" onClick={() => setMobileView(v)}
            className={`flex-1 py-2 text-[13px] font-semibold transition-colors ${mobileView === v ? 'border-b-2 border-blue-600 text-blue-600' : 'text-[#6b7280]'}`}>
            {v === 'editor' ? '✏️ Editar' : '👁 Preview'}
          </button>
        ))}
      </div>

      {/* Feedback */}
      {(successMsg || errorMsg) && (
        <div className={`flex-shrink-0 px-4 py-2 text-[13px] font-medium text-center ${successMsg ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {successMsg ?? errorMsg}
        </div>
      )}

      {/* Corpo */}
      <div className="flex-1 flex overflow-hidden">
        <div className={`${mobileView === 'editor' ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-[420px] md:border-r border-[#e5e7eb] overflow-hidden flex-shrink-0`}>
          <EditorPanel draft={draft} onColors={onColors} onBrand={onBrand} onPromo={onPromo} onHero={onHero}
            onAddProduct={addProduct} onUpdateProduct={updateProduct} onRemoveProduct={removeProduct} onMoveProduct={moveProduct} />
        </div>
        <div className={`${mobileView === 'preview' ? 'flex' : 'hidden'} md:flex flex-1 overflow-y-auto`}>
          <div className="w-full"><StorePreview draft={draft} /></div>
        </div>
      </div>
    </div>
  )
}
