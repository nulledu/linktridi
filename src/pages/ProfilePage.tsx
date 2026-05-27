import { useNavigate } from 'react-router-dom'
import { useProfile } from '../hooks/useProfile'
import { usePosts } from '../hooks/usePosts'
import PostGrid, { GridSkeleton } from '../components/PostGrid'

export default function ProfilePage() {
  const navigate = useNavigate()
  const { profile } = useProfile()
  const { posts, loading } = usePosts()

  return (
    <div className="min-h-screen max-w-[480px] mx-auto" style={{ backgroundColor: '#2D1169' }}>

      {/* ── Identidade da marca ── */}
      <div className="flex flex-col items-center pt-8 pb-5 px-6 relative">
        {/* Botão admin invisível */}
        <button
          onClick={() => navigate('/admin/login')}
          className="absolute top-3 right-3 p-2 text-white/20 hover:text-white/50 transition-colors"
          aria-label="Admin"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94H9.978c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* Logo */}
        {profile?.avatar_url ? (
          <div className="w-24 h-24 rounded-2xl overflow-hidden mb-4 shadow-2xl ring-2 ring-white/10">
            <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-24 h-24 rounded-2xl bg-white/10 mb-4 flex items-center justify-center shadow-2xl">
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

