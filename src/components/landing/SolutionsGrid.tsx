import type { SolutionItem, LandingColors } from '../../types/landing'
import SolutionCard from './SolutionCard'

interface SolutionsGridProps {
  title: string
  solutions: SolutionItem[]
  colors: LandingColors
}

export default function SolutionsGrid({ title, solutions, colors }: SolutionsGridProps) {
  if (solutions.length === 0) return null

  return (
    <section
      className="w-full px-4 py-10"
      style={{ backgroundColor: colors.bg }}
    >
      {/* Divisor */}
      <div
        className="w-12 h-1 rounded-full mx-auto mb-5"
        style={{ backgroundColor: colors.primary }}
      />

      <h2
        className="text-[20px] font-black text-center mb-6 tracking-tight"
        style={{ color: colors.text }}
      >
        {title}
      </h2>

      <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
        {solutions
          .slice()
          .sort((a, b) => a.order_index - b.order_index)
          .map((item) => (
            <SolutionCard key={item.id} item={item} colors={colors} />
          ))}
      </div>
    </section>
  )
}
