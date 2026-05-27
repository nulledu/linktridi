export interface LandingColors {
  primary: string    // ex: "#2563eb"
  secondary: string  // ex: "#1e40af"
  bg: string         // ex: "#ffffff"
  text: string       // ex: "#111827"
  card_bg: string    // ex: "#f9fafb"
}

export interface HeroConfig {
  title: string
  subtitle: string
  media_url: string
  media_type: 'image' | 'video'
  cta_text: string
  cta_url: string
}

export interface SolutionItem {
  id: string
  title: string
  description: string
  media_url: string
  media_type: 'image' | 'video'
  thumbnail_url: string
  link_url: string
  order_index: number
}

export interface LandingConfig {
  id?: string
  colors: LandingColors
  hero: HeroConfig
  solutions_title: string
  solutions: SolutionItem[]
}
