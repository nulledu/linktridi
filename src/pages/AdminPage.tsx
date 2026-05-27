import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Profile, Post } from '../types'

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function uuid() {
  return crypto.randomUUID()
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[12px] font-semibold text-[#8e8e8e] uppercase tracking-wide mb-1">{children}</label>
}

function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 text-[14px] border border-[#dbdbdb] rounded-lg bg-white outline-none focus:border-[#a8a8a8]"
    />
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Emoji picker
// ────────────────────────────────────────────────────────────────────────────

const EMOJIS = [
  '😊','😍','🥰','😂','🤩','🥳','😎','🤑',
  '🔥','⭐','✨','💫','🌟','💥','⚡','🎯',
  '❤️','💜','💛','💚','🧡','🤍','🖤','💙',
  '🎉','🎁','🛍️','📦','🚀','💎','🏆','🥇',
  '👆','👇','👉','☝️','🤙','💪','🙌','🤝',
  '✅','⚠️','🔑','🎪','🎨','🌈','🌺','🌸',
]

function EmojiPicker({ onSelect }: { onSelect: (e: string) => void }) {
  return (
    <div
      className="absolute bottom-full left-0 mb-1 z-50 bg-white border border-[#dbdbdb] rounded-xl shadow-2xl p-2"
      style={{ width: 228 }}
    >
      <div className="grid grid-cols-8 gap-0.5">
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onSelect(e)}
            className="text-[17px] hover:bg-gray-100 rounded p-0.5 leading-none"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}

function EmojiInput({
  value, onChange, placeholder, type = 'text',
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const cursor = useRef(0)
  const [open, setOpen] = useState(false)

  function insert(emoji: string) {
    const pos = cursor.current
    const next = value.slice(0, pos) + emoji + value.slice(pos)
    onChange(next)
    setOpen(false)
    setTimeout(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(pos + emoji.length, pos + emoji.length)
    }, 0)
  }

  return (
    <div className="relative flex gap-1 items-center">
      <input
        ref={ref}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onSelect={() => { cursor.current = ref.current?.selectionStart ?? value.length }}
        placeholder={placeholder}
        className="flex-1 px-3 py-2 text-[14px] border border-[#dbdbdb] rounded-lg bg-white outline-none focus:border-[#a8a8a8]"
      />
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-[18px] flex-shrink-0 px-1 hover:scale-110 transition-transform">
        😊
      </button>
      {open && <EmojiPicker onSelect={insert} />}
    </div>
  )
}

function EmojiTextarea({
  value, onChange, placeholder, rows = 3,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const cursor = useRef(0)
  const [open, setOpen] = useState(false)

  function insert(emoji: string) {
    const pos = cursor.current
    const next = value.slice(0, pos) + emoji + value.slice(pos)
    onChange(next)
    setOpen(false)
    setTimeout(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(pos + emoji.length, pos + emoji.length)
    }, 0)
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onSelect={() => { cursor.current = ref.current?.selectionStart ?? value.length }}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2 pr-9 text-[14px] border border-[#dbdbdb] rounded-lg bg-white outline-none focus:border-[#a8a8a8] resize-none"
      />
      <button type="button" onClick={() => setOpen((v) => !v)} className="absolute right-2 top-2 text-[16px] hover:scale-110 transition-transform">
        😊
      </button>
      {open && <EmojiPicker onSelect={insert} />}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Post editor row
// ────────────────────────────────────────────────────────────────────────────

interface PostRowProps {
  post: Post
  index: number
  onChange: (post: Post) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
}

function PostRow({ post, index, onChange, onRemove, onMoveUp, onMoveDown, isFirst, isLast }: PostRowProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const thumbRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  async function uploadFile(file: File, field: 'media_url' | 'thumbnail_url') {
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `posts/${uuid()}.${ext}`
    const { data, error } = await supabase.storage.from('media').upload(path, file, { upsert: true })
    if (!error && data) {
      const { data: urlData } = supabase.storage.from('media').getPublicUrl(data.path)
      onChange({ ...post, [field]: urlData.publicUrl })
    }
    setUploading(false)
  }

  const thumbSrc = post.thumbnail_url || (post.type === 'image' ? post.media_url : null)
  const caption = post.caption || '(sem nome)'
  const hasPrice = post.price != null && post.price > 0

  return (
    <div className="border border-[#dbdbdb] rounded-xl bg-white overflow-hidden">
      {/* ── Collapsed header ── */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none hover:bg-[#fafafa] transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Thumbnail */}
        <div className="w-10 h-10 rounded-lg bg-[#f0f0f0] overflow-hidden flex-shrink-0">
          {thumbSrc
            ? <img src={thumbSrc} className="w-full h-full object-cover" alt="" />
            : <div className="w-full h-full flex items-center justify-center text-[16px]">📷</div>}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-[#8e8e8e]">#{index + 1}</span>
            <span className="text-[13px] font-semibold text-[#262626] truncate max-w-[140px]">{caption}</span>
            {post.badge && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full text-white flex-shrink-0" style={{ backgroundColor: '#FF6000' }}>
                {post.badge}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {hasPrice && (
              <span className="text-[12px] font-bold text-green-600">
                R$ {post.price!.toFixed(2).replace('.', ',')}
              </span>
            )}
            <span className="text-[11px] text-[#8e8e8e]">{post.type === 'image' ? '🖼️ imagem' : '🎬 vídeo'}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <button onClick={onMoveUp} disabled={isFirst} className="p-1 text-[#8e8e8e] disabled:opacity-30 hover:text-[#262626]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
          </button>
          <button onClick={onMoveDown} disabled={isLast} className="p-1 text-[#8e8e8e] disabled:opacity-30 hover:text-[#262626]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
          <button onClick={onRemove} className="p-1 text-red-400 hover:text-red-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <svg
            className={`w-4 h-4 text-[#8e8e8e] transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* ── Expanded fields ── */}
      {expanded && (
      <div className="border-t border-[#dbdbdb] p-3 space-y-2">

      {/* Tipo */}
      <div className="flex gap-2">
        {(['image', 'video'] as const).map((t) => (
          <button
            key={t}
            onClick={() => onChange({ ...post, type: t })}
            className={`flex-1 py-1 rounded-lg text-[13px] font-medium border transition-colors ${post.type === t ? 'bg-[#0095f6] text-white border-[#0095f6]' : 'border-[#dbdbdb] text-[#262626]'}`}
          >
            {t === 'image' ? 'Imagem' : 'Vídeo'}
          </button>
        ))}
      </div>

      {/* Upload de mídia */}
      <div>
        <Label>Mídia</Label>
        <div className="flex gap-2 items-center mb-2">
          <input
            ref={fileRef}
            type="file"
            accept={post.type === 'image' ? 'image/*' : 'video/*'}
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, 'media_url') }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="px-3 py-1.5 text-[13px] border border-[#dbdbdb] rounded-lg bg-[#fafafa] hover:bg-[#efefef] transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {uploading ? 'Enviando…' : '📁 Arquivo'}
          </button>
          {post.media_url && (
            <span className="text-[11px] text-[#0095f6] truncate">
              ✓ carregado
            </span>
          )}
        </div>
        {/* URL direta */}
        <Input
          value={post.media_url}
          onChange={(v) => onChange({ ...post, media_url: v })}
          placeholder="Ou cole uma URL (https://...)"
          type="url"
        />
        {/* Preview */}
        {post.media_url && (
          <div className="mt-2 w-full aspect-square rounded-lg overflow-hidden bg-gray-100">
            {post.type === 'video'
              ? <video src={post.media_url} className="w-full h-full object-cover" muted playsInline />
              : <img src={post.media_url} className="w-full h-full object-cover" alt="" />}
          </div>
        )}
      </div>

      {/* Thumbnail (vídeo) */}
      {post.type === 'video' && (
        <div>
          <Label>Thumbnail (opcional)</Label>
          <div className="flex gap-2 items-center mb-2">
            <input
              ref={thumbRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, 'thumbnail_url') }}
            />
            <button
              onClick={() => thumbRef.current?.click()}
              className="px-3 py-1.5 text-[13px] border border-[#dbdbdb] rounded-lg bg-[#fafafa] hover:bg-[#efefef] transition-colors whitespace-nowrap"
            >
              📁 Arquivo
            </button>
            {post.thumbnail_url && (
              <img src={post.thumbnail_url} className="w-8 h-8 object-cover rounded" alt="" />
            )}
          </div>
          <Input
            value={post.thumbnail_url ?? ''}
            onChange={(v) => onChange({ ...post, thumbnail_url: v || null })}
            placeholder="Ou cole uma URL da thumbnail"
            type="url"
          />
        </div>
      )}

      {/* Link de destino */}
      <div>
        <Label>Link de destino</Label>
        <Input value={post.destination_url} onChange={(v) => onChange({ ...post, destination_url: v })} placeholder="https://..." type="url" />
      </div>

      {/* Nome do produto (caption) */}
      <div>
        <Label>Nome do produto</Label>
        <EmojiInput value={post.caption ?? ''} onChange={(v) => onChange({ ...post, caption: v })} placeholder="Ex: KIT CHANCELA + CARIMBO" />
      </div>

      {/* Tamanho do título */}
      <div>
        <Label>Tamanho do título</Label>
        <div className="flex gap-2">
          {([['sm', 'P — Pequeno'], ['md', 'M — Médio'], ['lg', 'G — Grande']] as const).map(([key, label]) => (
            <button key={key} type="button"
              onClick={() => onChange({ ...post, title_size: key })}
              className={`flex-1 py-1.5 rounded-lg text-[12px] font-bold border transition-colors ${
                (post.title_size ?? 'md') === key ? 'bg-[#0095f6] text-white border-[#0095f6]' : 'border-[#dbdbdb] text-[#262626]'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Badge */}
      <div>
        <Label>Badge (padrão: PROMOÇÃO)</Label>
        <EmojiInput value={post.badge ?? ''} onChange={(v) => onChange({ ...post, badge: v })} placeholder="PROMOÇÃO" />
      </div>

      {/* Prefixo de preço */}
      <div>
        <Label>Prefixo do preço</Label>
        <div className="flex gap-2">
          {['POR APENAS', 'À PARTIR DE'].map((opt) => (
            <button key={opt} type="button"
              onClick={() => onChange({ ...post, price_prefix: opt })}
              className={`flex-1 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors ${(post.price_prefix ?? 'POR APENAS') === opt ? 'bg-[#0095f6] text-white border-[#0095f6]' : 'border-[#dbdbdb] text-[#262626]'}`}>
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Preço */}
      <div>
        <Label>Preço (R$)</Label>
        <input
          type="number" min={0} step={0.01}
          value={post.price ?? ''}
          onChange={(e) => onChange({ ...post, price: parseFloat(e.target.value) || null })}
          placeholder="0,00"
          className="w-full px-3 py-2 text-[14px] border border-[#dbdbdb] rounded-lg bg-white outline-none focus:border-[#a8a8a8]"
        />
      </div>

      {/* Sufixo (frete) */}
      <div>
        <Label>Texto adicional (padrão: + FRETE GRÁTIS)</Label>
        <EmojiInput value={post.price_suffix ?? ''} onChange={(v) => onChange({ ...post, price_suffix: v })} placeholder="+ FRETE GRÁTIS" />
      </div>

      {/* CTA */}
      <div>
        <Label>Botão CTA (padrão: É SÓ CLICAR AQUI!)</Label>
        <EmojiInput value={post.cta_label ?? ''} onChange={(v) => onChange({ ...post, cta_label: v })} placeholder="É SÓ CLICAR AQUI!" />
      </div>
      </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Admin Page
// ────────────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [draftProfile, setDraftProfile] = useState<Partial<Profile>>({})
  const [posts, setPosts] = useState<Post[]>([])
  const [dirty, setDirty] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const avatarRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    checkSessionAndLoad()
  }, [])

  async function checkSessionAndLoad() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      navigate('/admin/login')
      return
    }
    await loadData()
  }

  async function loadData() {
    const [{ data: profileData }, { data: postsData }] = await Promise.all([
      supabase.from('profiles').select('*').limit(1).single(),
      supabase.from('posts').select('*').order('order_index', { ascending: true }),
    ])
    if (profileData) {
      setProfile(profileData)
      setDraftProfile({ ...profileData })
    }
    setPosts(postsData ?? [])
  }

  function markDirty() {
    setDirty(true)
    setSuccessMsg(null)
  }

  function updateDraftProfile<K extends keyof Profile>(key: K, value: Profile[K]) {
    setDraftProfile((p) => ({ ...p, [key]: value }))
    markDirty()
  }

  async function uploadAvatar(file: File) {
    const ext = file.name.split('.').pop()
    const path = `avatars/${uuid()}.${ext}`
    const { data, error } = await supabase.storage.from('media').upload(path, file, { upsert: true })
    if (!error && data) {
      const { data: urlData } = supabase.storage.from('media').getPublicUrl(data.path)
      updateDraftProfile('avatar_url', urlData.publicUrl)
    }
  }

  function addPost() {
    const newPost: Post = {
      id: uuid(),
      type: 'image',
      media_url: '',
      thumbnail_url: null,
      destination_url: '',
      caption: null,
      order_index: posts.length,
      is_published: false,
      created_at: new Date().toISOString(),
      badge: 'PROMOÇÃO',
      price_prefix: 'POR APENAS',
      price: null,
      price_suffix: '+ FRETE GRÁTIS',
      cta_label: 'É SÓ CLICAR AQUI!',
      title_size: 'md',
    }
    setPosts((prev) => [...prev, newPost])
    markDirty()
  }

  function updatePost(index: number, updated: Post) {
    setPosts((prev) => prev.map((p, i) => (i === index ? updated : p)))
    markDirty()
  }

  function removePost(index: number) {
    setPosts((prev) => prev.filter((_, i) => i !== index))
    markDirty()
  }

  function movePost(index: number, direction: -1 | 1) {
    const newPosts = [...posts]
    const target = index + direction
    if (target < 0 || target >= newPosts.length) return
    ;[newPosts[index], newPosts[target]] = [newPosts[target], newPosts[index]]
    setPosts(newPosts)
    markDirty()
  }

  async function publishChanges() {
    setPublishing(true)
    setErrorMsg(null)

    try {
      if (!profile) throw new Error('Perfil não encontrado.')

      // Atualiza perfil
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({
          username: draftProfile.username,
          full_name: draftProfile.full_name,
          bio: draftProfile.bio,
          avatar_url: draftProfile.avatar_url,
          followers_count: draftProfile.followers_count,
          following_count: draftProfile.following_count,
          posts_count: posts.length,
          instagram_url: draftProfile.instagram_url ?? null,
          tiktok_url: draftProfile.tiktok_url ?? null,
          section_title: draftProfile.section_title ?? null,
          section_title_size: draftProfile.section_title_size ?? 'md',
          show_social: draftProfile.show_social ?? true,
          card_bg: draftProfile.card_bg ?? '#18181b',
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id)

      if (profileErr) throw profileErr

      // Deleta todos e reinserere com ordem atualizada (estratégia simples)
      const { error: delErr } = await supabase.from('posts').delete().eq('profile_id', profile.id)
      if (delErr) throw delErr

      const postsToInsert = posts.map((p, i) => ({
        ...p,
        profile_id: profile.id,
        order_index: i,
        is_published: true,
      }))

      const { error: insertErr } = await supabase.from('posts').insert(postsToInsert)
      if (insertErr) throw insertErr

      setDirty(false)
      setSuccessMsg('Alterações publicadas com sucesso!')
      await loadData()
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao publicar.')
    } finally {
      setPublishing(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-[#0095f6] border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-[#dbdbdb] px-4 py-3 flex items-center justify-between">
        <button onClick={() => navigate('/')} className="text-[14px] text-[#0095f6]">
          ← Perfil
        </button>
        <h1 className="text-[15px] font-semibold text-[#262626]">Painel Admin</h1>
        <div className="flex items-center gap-3">
          <a
            href="https://console.cloudinary.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-[#8e8e8e] hover:text-[#0095f6] transition-colors"
            title="Gerenciar mídias no Cloudinary"
          >
            ☁️ Mídia
          </a>
          <button onClick={handleLogout} className="text-[14px] text-[#8e8e8e]">
            Sair
          </button>
        </div>
      </header>

      <div className="max-w-[480px] mx-auto px-4 py-4 space-y-5">
        {/* ── Seção: Perfil ── */}
        <section className="bg-white border border-[#dbdbdb] rounded-xl p-4 space-y-3">
          <h2 className="text-[14px] font-semibold text-[#262626]">Perfil</h2>

          {/* Avatar */}
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
              {draftProfile.avatar_url ? (
                <img src={draftProfile.avatar_url} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="w-full h-full bg-gray-200" />
              )}
            </div>
            <div>
              <input
                ref={avatarRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f) }}
              />
              <button
                onClick={() => avatarRef.current?.click()}
                className="text-[14px] text-[#0095f6] font-semibold"
              >
                Alterar foto
              </button>
            </div>
          </div>

          <div>
            <Label>Nome de usuário</Label>
            <Input value={draftProfile.username ?? ''} onChange={(v) => updateDraftProfile('username', v)} placeholder="@usuario" />
          </div>

          <div>
            <Label>Nome completo</Label>
            <Input value={draftProfile.full_name ?? ''} onChange={(v) => updateDraftProfile('full_name', v)} placeholder="Nome Completo" />
          </div>

          <div>
            <Label>Biografia</Label>
            <EmojiTextarea value={draftProfile.bio ?? ''} onChange={(v) => updateDraftProfile('bio', v)} placeholder="Sua bio (aceita quebras de linha e links)" rows={4} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Seguidores</Label>
              <Input
                type="number"
                value={String(draftProfile.followers_count ?? 0)}
                onChange={(v) => updateDraftProfile('followers_count', Number(v))}
              />
            </div>
            <div>
              <Label>Seguindo</Label>
              <Input
                type="number"
                value={String(draftProfile.following_count ?? 0)}
                onChange={(v) => updateDraftProfile('following_count', Number(v))}
              />
            </div>
          </div>

          {/* Redes sociais */}
          <div>
            <Label>Link do Instagram</Label>
            <Input
              value={draftProfile.instagram_url ?? ''}
              onChange={(v) => updateDraftProfile('instagram_url', v || null)}
              placeholder="https://instagram.com/suamarca"
              type="url"
            />
          </div>
          <div>
            <Label>Link do TikTok</Label>
            <Input
              value={draftProfile.tiktok_url ?? ''}
              onChange={(v) => updateDraftProfile('tiktok_url', v || null)}
              placeholder="https://tiktok.com/@suamarca"
              type="url"
            />
          </div>

          {/* Exibir botões de redes sociais */}
          <div className="flex items-center justify-between py-1">
            <Label>Mostrar botões de redes sociais</Label>
            <button
              type="button"
              onClick={() => updateDraftProfile('show_social', !(draftProfile.show_social ?? true))}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                (draftProfile.show_social ?? true) ? 'bg-[#0095f6]' : 'bg-[#dbdbdb]'
              }`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${
                (draftProfile.show_social ?? true) ? 'left-6' : 'left-1'
              }`} />
            </button>
          </div>

          {/* Cor dos cards */}
          <div>
            <Label>Cor de fundo dos cards</Label>
            <div className="grid grid-cols-6 gap-2 mt-1">
              {[
                { color: '#18181b', label: 'Preto' },
                { color: '#1e293b', label: 'Slate' },
                { color: '#2d1169', label: 'Roxo' },
                { color: '#374151', label: 'Cinza escuro' },
                { color: '#6b7280', label: 'Cinza' },
                { color: '#d1d5db', label: 'Cinza claro' },
                { color: '#f3f4f6', label: 'Off-white' },
                { color: '#ffffff', label: 'Branco' },
                { color: '#fef9c3', label: 'Amarelo' },
                { color: '#fce7f3', label: 'Rosa' },
                { color: '#ede9fe', label: 'Lavânda' },
                { color: '#dbeafe', label: 'Azul' },
              ].map(({ color, label }) => (
                <button
                  key={color}
                  type="button"
                  title={label}
                  onClick={() => updateDraftProfile('card_bg', color)}
                  className="w-full aspect-square rounded-lg border-2 transition-all"
                  style={{
                    backgroundColor: color,
                    borderColor: (draftProfile.card_bg ?? '#18181b') === color ? '#0095f6' : '#dbdbdb',
                    transform: (draftProfile.card_bg ?? '#18181b') === color ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
            {/* Cor customizada */}
            <div className="flex items-center gap-2 mt-2">
              <input
                type="color"
                value={draftProfile.card_bg ?? '#18181b'}
                onChange={(e) => updateDraftProfile('card_bg', e.target.value)}
                className="w-9 h-9 rounded-lg border border-[#dbdbdb] cursor-pointer p-0.5"
              />
              <span className="text-[12px] text-[#8e8e8e]">Cor personalizada</span>
              <span className="text-[12px] font-mono text-[#262626]">{draftProfile.card_bg ?? '#18181b'}</span>
            </div>
          </div>

          <div>
            <Label>Texto acima dos produtos</Label>
            <Input
              value={draftProfile.section_title ?? ''}
              onChange={(v) => updateDraftProfile('section_title', v || null)}
              placeholder="Ex: Confira nossos produtos personalizados ✨"
            />
            <div className="flex gap-2 mt-2">
              {([['sm', 'P — Pequeno'], ['md', 'M — Médio'], ['lg', 'G — Grande']] as const).map(([key, label]) => (
                <button key={key} type="button"
                  onClick={() => updateDraftProfile('section_title_size', key)}
                  className={`flex-1 py-1.5 rounded-lg text-[12px] font-bold border transition-colors ${
                    (draftProfile.section_title_size ?? 'md') === key ? 'bg-[#0095f6] text-white border-[#0095f6]' : 'border-[#dbdbdb] text-[#262626]'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── Seção: Posts ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-[#262626]">Posts ({posts.length})</h2>
            <button
              onClick={addPost}
              className="px-3 py-1.5 text-[13px] font-semibold text-white bg-[#0095f6] rounded-lg hover:bg-[#1877f2] transition-colors"
            >
              + Adicionar
            </button>
          </div>

          {posts.map((post, i) => (
            <PostRow
              key={post.id}
              post={post}
              index={i}
              onChange={(updated) => updatePost(i, updated)}
              onRemove={() => removePost(i)}
              onMoveUp={() => movePost(i, -1)}
              onMoveDown={() => movePost(i, 1)}
              isFirst={i === 0}
              isLast={i === posts.length - 1}
            />
          ))}
        </section>

        {/* ── Mensagens de feedback ── */}
        {successMsg && (
          <p className="text-center text-[13px] text-green-600 font-medium">{successMsg}</p>
        )}
        {errorMsg && (
          <p className="text-center text-[13px] text-red-500">{errorMsg}</p>
        )}

        {/* ── Botão Publicar ── */}
        <button
          onClick={publishChanges}
          disabled={!dirty || publishing}
          className="w-full py-3 text-[15px] font-semibold text-white bg-[#0095f6] rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#1877f2] transition-colors shadow-sm"
        >
          {publishing ? 'Publicando…' : 'Publicar Alterações'}
        </button>

        <div className="pb-8" />
      </div>
    </div>
  )
}
