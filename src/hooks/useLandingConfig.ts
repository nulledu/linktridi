import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { LandingConfig } from '../types/landing'

export const DEFAULT_LANDING_CONFIG: LandingConfig = {
  colors: {
    primary: '#2563eb',
    secondary: '#1e40af',
    bg: '#ffffff',
    text: '#111827',
    card_bg: '#f9fafb',
  },
  hero: {
    title: 'Transforme Sua Empresa com Soluções que Geram Resultados',
    subtitle: 'Conecte sua equipe, automatize processos e acelere o crescimento com nosso ecossistema B2B.',
    media_url: '',
    media_type: 'image',
    cta_text: 'Falar com Especialista',
    cta_url: '#contato',
  },
  solutions_title: 'Nossos Ecossistemas',
  solutions: [],
}

export function useLandingConfig() {
  const [config, setConfig] = useState<LandingConfig>(DEFAULT_LANDING_CONFIG)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchConfig()
  }, [])

  async function fetchConfig() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('landing_configs')
      .select('*')
      .limit(1)
      .maybeSingle()

    if (error) {
      setError(error.message)
    } else if (data) {
      setConfig({ ...(data.config as LandingConfig), id: data.id })
    }
    setLoading(false)
  }

  return { config, loading, error, refetch: fetchConfig }
}
