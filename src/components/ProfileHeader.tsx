import type { Profile } from '../types'

interface ProfileHeaderProps {
  profile: Profile
  isAdmin?: boolean
  onEditProfile?: () => void
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.0', '') + 'K'
  return n.toLocaleString('pt-BR')
}

function BioText({ text }: { text: string }) {
  // Suporta quebras de linha e links com https://
  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, li) => (
        <span key={li}>
          {line.split(/(https?:\/\/[^\s]+)/g).map((part, pi) =>
            /^https?:\/\//.test(part) ? (
              <a
                key={pi}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00376b] font-medium"
              >
                {part}
              </a>
            ) : (
              <span key={pi}>{part}</span>
            )
          )}
          {li < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  )
}

export default function ProfileHeader({ profile, isAdmin, onEditProfile }: ProfileHeaderProps) {
  return (
    <div className="px-4 pt-3 pb-1">
      {/* Linha: avatar + stats */}
      <div className="flex items-center gap-4 mb-3">
        {/* Avatar */}
        <div className="flex-shrink-0">
          <div className="w-[86px] h-[86px] rounded-full p-[3px] bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7]">
            <div className="w-full h-full rounded-full border-2 border-white/20 overflow-hidden bg-white/10">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-white/10">
                  <svg className="w-10 h-10 text-white/40" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                  </svg>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Estatísticas */}
        <div className="flex-1 flex justify-around">
          {[
            { label: 'Publicações', value: profile.posts_count },
            { label: 'Seguidores', value: profile.followers_count },
            { label: 'Seguindo', value: profile.following_count },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center">
              <span className="text-[15px] font-semibold text-white leading-tight">
                {formatCount(stat.value)}
              </span>
              <span className="text-[12px] text-white leading-tight">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Nome e bio */}
      <div className="mb-3 space-y-1">
        <p className="text-[14px] font-semibold text-white">{profile.full_name}</p>
        {profile.bio && (
          <p className="text-[14px] text-white leading-snug whitespace-pre-line">
            <BioText text={profile.bio} />
          </p>
        )}
      </div>

      {/* Botão Editar Perfil (só admin) */}
      {isAdmin && (
        <button
          onClick={onEditProfile}
          className="w-full py-[6px] text-[14px] font-semibold text-white bg-white/10 rounded-lg hover:bg-white/20 transition-colors border border-white/20"
        >
          Editar Perfil
        </button>
      )}
    </div>
  )
}
