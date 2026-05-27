import type { Post } from '../types'
import PostCard from './PostCard'

interface PostGridProps {
  posts: Post[]
  cardBg?: string
}

export function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 px-3 pb-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl overflow-hidden animate-pulse" style={{ backgroundColor: '#18181b' }}>
          <div className="aspect-square" style={{ backgroundColor: '#27272a' }} />
          <div className="p-5 space-y-3">
            <div className="h-2.5 rounded w-1/4" style={{ backgroundColor: '#3f3f46' }} />
            <div className="h-7 rounded w-3/4" style={{ backgroundColor: '#3f3f46' }} />
            <div className="h-4 rounded w-1/2" style={{ backgroundColor: '#3f3f46' }} />
            <div className="h-12 rounded-xl mt-3" style={{ backgroundColor: '#3f3f46' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function PostGrid({ posts, cardBg }: PostGridProps) {
  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <svg className="w-14 h-14 mb-3 opacity-40" fill="none" stroke="#fff" strokeWidth={1} viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        <p className="text-[14px] font-semibold text-white">Sem publicações ainda</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 px-3 pb-8">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} cardBg={cardBg} />
      ))}
    </div>
  )
}
