import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfile } from '../hooks/useProfile'
import { usePosts } from '../hooks/usePosts'
import PostGrid, { GridSkeleton } from '../components/PostGrid'

export default function ProfilePage() {
  const navigate = useNavigate()
  const { profile } = useProfile()
  const { posts, loading } = usePosts()

  const clickCount = useRef(0)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleLogoClick() {
    clickCount.current += 1
    if (clickTimer.current) clearTimeout(clickTimer.current)
    if (clickCount.current >= 10) {
      clickCount.current = 0
      navigate('/admin/login')
      return
    }
    clickTimer.current = setTimeout(() => { clickCount.current = 0 }, 2000)
  }

  return (
    <div className="min-h-screen max-w-[480px] mx-auto" style={{ backgroundColor: '#2D1169' }}>

      {/* ── Identidade da marca ── */}
      <div className="flex flex-col items-center pt-8 pb-5 px-6 relative">
        {/* Logo */}
        {profile?.avatar_url ? (
          <div
            className="w-24 h-24 rounded-2xl overflow-hidden mb-4 shadow-2xl ring-2 ring-white/10 cursor-pointer"
            onClick={handleLogoClick}
          >
            <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div
            className="w-24 h-24 rounded-2xl bg-white/10 mb-4 flex items-center justify-center shadow-2xl cursor-pointer"
            onClick={handleLogoClick}
          >
            <svg className="w-10 h-10 text-white/30" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
        )}

        {/* Nome */}
        {profile?.full_name && (
          <h1 className="text-[22px] font-black text-white tracking-tight text-center leading-tight mb-1">
            {profile.full_name}
          </h1>
        )}

        {/* Bio / tagline */}
        {profile?.bio && (
          <p className="text-[13px] text-white text-center leading-snug max-w-[260px]">
            {profile.bio}
          </p>
        )}

        {/* Cards de redes sociais */}
        {profile?.show_social !== false && (profile?.instagram_url || profile?.tiktok_url) && (
          <div className="flex gap-3 mt-4">
            {profile.instagram_url && (
              <a
                href={profile.instagram_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-[13px] text-white shadow-lg transition-transform active:scale-95"
                style={{ background: 'linear-gradient(135deg, #f9ce34, #ee2a7b, #6228d7)' }}
              >
                {/* Instagram icon */}
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
                Instagram
              </a>
            )}
            {profile.tiktok_url && (
              <a
                href={profile.tiktok_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-[13px] text-white shadow-lg transition-transform active:scale-95"
                style={{ backgroundColor: '#010101' }}
              >
                {/* TikTok icon */}
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.17 8.17 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z" />
                </svg>
                TikTok
              </a>
            )}
          </div>
        )}

        {/* Linha divisória */}
        <div className="w-16 h-0.5 rounded-full mt-5" style={{ backgroundColor: '#7c3aed' }} />
      </div>

      {/* ── Título da seção de produtos ── */}
      {profile?.section_title && (
        <div className="px-4 pb-3 pt-1">
          <p
            className="font-semibold text-white text-center leading-snug"
            style={{ fontSize: profile.section_title_size === 'sm' ? '11px' : profile.section_title_size === 'lg' ? '18px' : '13px' }}
          >
            {profile.section_title}
          </p>
        </div>
      )}

      {/* ── Grade de produtos ── */}
      {loading ? <GridSkeleton /> : <PostGrid posts={posts} cardBg={profile?.card_bg ?? undefined} />}
    </div>
  )
}

