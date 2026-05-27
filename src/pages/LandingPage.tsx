import { useLandingConfig } from '../hooks/useLandingConfig'
import HeroSection from '../components/landing/HeroSection'
import SolutionsGrid from '../components/landing/SolutionsGrid'

export default function LandingPage() {
  const { config, loading } = useLandingConfig()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: config.colors.bg }}>
      <HeroSection hero={config.hero} colors={config.colors} />
      <SolutionsGrid
        title={config.solutions_title}
        solutions={config.solutions}
        colors={config.colors}
      />

      {/* Rodapé minimalista */}
      <footer
        className="w-full py-8 text-center text-[12px]"
        style={{ color: config.colors.text, opacity: 0.35 }}
      >
        © {new Date().getFullYear()} · Todos os direitos reservados
      </footer>
    </div>
  )
}
