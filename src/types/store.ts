export interface StoreColors {
  bg: string        // fundo da página
  primary: string   // cor da marca (botões, accents)
  text: string      // cor do texto principal
  card_bg: string   // fundo dos cards
  price: string     // cor do preço de venda
  badge_bg: string  // cor das etiquetas/badges
}

export interface HeroBannerConfig {
  media_url: string
  media_type: 'image' | 'video'
  headline: string
  subheadline: string
  cta_text: string
  cta_url: string
}

export interface PromoBannerConfig {
  text: string
  active: boolean
}

export interface Product {
  id: string
  name: string
  description: string
  original_price: number
  sale_price: number
  media_url: string
  media_type: 'image' | 'video'
  thumbnail_url: string
  badge: string
  checkout_url: string
  order_index: number
  is_active: boolean
}

export interface StoreConfig {
  id?: string
  brand_name: string
  brand_logo_url: string
  whatsapp_url: string
  colors: StoreColors
  hero: HeroBannerConfig
  promo: PromoBannerConfig
  products: Product[]
}
