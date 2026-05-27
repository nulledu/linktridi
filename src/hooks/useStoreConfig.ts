import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { StoreConfig } from '../types/store'

export const DEFAULT_STORE_CONFIG: StoreConfig = {
  brand_name: 'Minha Marca',
  brand_logo_url: '',
  whatsapp_url: '',
  colors: {
    bg: '#ffffff',
    primary: '#111827',
    text: '#111827',
    card_bg: '#f9fafb',
    price: '#16a34a',
    badge_bg: '#ef4444',
  },
  hero: {
    media_url: '',
    media_type: 'image',
    headline: 'Produtos de Alta Qualidade para o Seu Negócio',
    subheadline: 'Atacado e varejo para lojistas e empreendedores. Compre com CNPJ.',
    cta_text: 'Ver Catálogo',
    cta_url: '#produtos',
  },
  promo: {
    text: '🚛 Frete grátis para CNPJ em compras acima de R$ 500',
    active: true,
  },
  products: [],
}

export function useStoreConfig() {
  const [config, setConfig] = useState<StoreConfig>(DEFAULT_STORE_CONFIG)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchConfig()
  }, [])

  async function fetchConfig() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('store_configs')
      .select('*')
      .limit(1)
      .maybeSingle()

    if (error) {
      setError(error.message)
    } else if (data) {
      setConfig({ ...(data.config as StoreConfig), id: data.id })
    }
    setLoading(false)
  }

  return { config, loading, error, refetch: fetchConfig }
}
