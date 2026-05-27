import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { DEFAULT_LANDING_CONFIG } from '../hooks/useLandingConfig'
import type { LandingConfig, LandingColors, HeroConfig, SolutionItem } from '../types/landing'
import HeroSection from '../components/landing/HeroSection'
import SolutionsGrid from '../components/landing/SolutionsGrid'

// ─────────────────────────────────────────────────────────────────────────────
// Pequenos utilitários de UI reutilizados no painel
// ─────────────────────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-bold text-[#8e8e8e] uppercase tracking-wide mb-1">
      {children}
    </label>
  )
}

function TextInput({
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
      className="w-full px-3 py-2 text-[13px] border border-[#e5e7eb] rounded-lg bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-colors"
    />
  )
}

function TextareaInput({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-2 text-[13px] border border-[#e5e7eb] rounded-lg bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-colors resize-none"
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Color picker com swatch + input hex
// ─────────────────────────────────────────────────────────────────────────────

const COLOR_LABELS: Record<keyof LandingColors, string> = {
  primary: 'Cor Principal (CTA, destaques)',
  secondary: 'Cor Secundária',
  bg: 'Fundo da Página',
  text: 'Cor do Texto',
  card_bg: 'Fundo dos Cards',
}

function ColorRow({
  colorKey,
  value,
  onChange,
}: {
  colorKey: keyof LandingColors
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[13px] text-[#374151] flex-1 mr-3 leading-tight">
        {COLOR_LABELS[colorKey]}
      </span>
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Swatch / color picker nativo */}
        <label className="relative cursor-pointer">
          <div
            className="w-8 h-8 rounded-lg border-2 border-white shadow-md ring-1 ring-gray-200 transition-transform hover:scale-110"
            style={{ backgroundColor: value }}
          />
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </label>
        {/* Hex input */}
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value
            if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v)
          }}
          maxLength={7}
          className="w-[82px] px-2 py-1 text-[12px] font-mono border border-[#e5e7eb] rounded-lg bg-white outline-none focus:border-blue-400 uppercase"
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Media uploader (imagem ou vídeo)
// ─────────────────────────────────────────────────────────────────────────────

function MediaUploader({
  mediaUrl,
  mediaType,
  onUrlChange,
  onTypeChange,
}: {
  mediaUrl: string
  mediaType: 'image' | 'video'
  onUrlChange: (url: string) => void
  onTypeChange: (t: 'image' | 'video') => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(file: File) {
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `landing/${crypto.randomUUID()}.${ext}`
    const { data, error } = await supabase.storage
      .from('media')
      .upload(path, file, { upsert: true })
    if (!error && data) {
      const { data: urlData } = supabase.storage.from('media').getPublicUrl(data.path)
      onUrlChange(urlData.publicUrl)
      onTypeChange(file.type.startsWith('video') ? 'video' : 'image')
    }
    setUploading(false)
  }

  return (
    <div className="space-y-2">
      {/* Tipo de mídia */}
      <div className="flex gap-2">
        {(['image', 'video'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTypeChange(t)}
            className={`flex-1 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors ${
              mediaType === t
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-[#e5e7eb] text-[#374151]'
            }`}
          >
            {t === 'image' ? '🖼 Imagem' : '🎬 Vídeo'}
          </button>
        ))}
      </div>

      {/* Upload */}
      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept={mediaType === 'image' ? 'image/*' : 'video/*'}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="px-3 py-2 text-[12px] border border-[#e5e7eb] rounded-lg bg-[#f9fafb] hover:bg-[#f3f4f6] disabled:opacity-50 transition-colors font-medium"
        >
          {uploading ? 'Enviando…' : 'Escolher arquivo'}
        </button>
        {mediaUrl && (
          <span className="text-[11px] text-blue-600 truncate max-w-[110px]">
            ✓ Mídia carregada
          </span>
        )}
      </div>

      {/* Preview pequeno */}
      {mediaUrl && (
        <div className="w-full h-24 rounded-xl overflow-hidden bg-gray-100">
          {mediaType === 'video' ? (
            <video src={mediaUrl} className="w-full h-full object-cover" muted playsInline />
          ) : (
            <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Editor de um card de solução
// ─────────────────────────────────────────────────────────────────────────────

function SolutionEditor({
  item,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  item: SolutionItem
  index: number
  total: number
  onChange: (updated: SolutionItem) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
}) {
  const [open, setOpen] = useState(index === 0)

  return (
    <div className="border border-[#e5e7eb] rounded-xl overflow-hidden bg-white">
      {/* Cabeçalho do card */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-[#f9fafb]">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 flex-1 text-left"
        >
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-[13px] font-semibold text-[#374151] truncate max-w-[160px]">
            {item.title || `Card #${index + 1}`}
          </span>
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-25"
            title="Mover para cima"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-25"
            title="Mover para baixo"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1 text-red-400 hover:text-red-600"
            title="Remover"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Corpo (collapsible) */}
      {open && (
        <div className="p-3 space-y-3">
          <div>
            <FieldLabel>Título</FieldLabel>
            <TextInput
              value={item.title}
              onChange={(v) => onChange({ ...item, title: v })}
              placeholder="Nome da solução"
            />
          </div>
          <div>
            <FieldLabel>Descrição curta</FieldLabel>
            <TextareaInput
              value={item.description}
              onChange={(v) => onChange({ ...item, description: v })}
              placeholder="Breve descrição do que entrega"
              rows={2}
            />
          </div>
          <div>
            <FieldLabel>Mídia do card</FieldLabel>
            <MediaUploader
              mediaUrl={item.media_url}
              mediaType={item.media_type}
              onUrlChange={(url) => onChange({ ...item, media_url: url })}
              onTypeChange={(t) => onChange({ ...item, media_type: t })}
            />
          </div>
          <div>
            <FieldLabel>Link de destino</FieldLabel>
            <TextInput
              value={item.link_url}
              onChange={(v) => onChange({ ...item, link_url: v })}
              placeholder="https://..."
              type="url"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Painel de Editor (3 abas)
// ─────────────────────────────────────────────────────────────────────────────

type EditorTab = 'visual' | 'hero' | 'solutions'

const EDITOR_TABS: { key: EditorTab; label: string; emoji: string }[] = [
  { key: 'visual', label: 'Visual', emoji: '🎨' },
  { key: 'hero', label: 'Hero', emoji: '🦸' },
  { key: 'solutions', label: 'Soluções', emoji: '⚡' },
]

interface EditorPanelProps {
  draft: LandingConfig
  onUpdateColors: (key: keyof LandingColors, value: string) => void
  onUpdateHero: (key: keyof HeroConfig, value: string) => void
  onUpdateSolutionsTitle: (value: string) => void
  onAddSolution: () => void
  onUpdateSolution: (index: number, updated: SolutionItem) => void
  onRemoveSolution: (index: number) => void
  onMoveSolution: (index: number, dir: -1 | 1) => void
}

function EditorPanel({
  draft,
  onUpdateColors,
  onUpdateHero,
  onUpdateSolutionsTitle,
  onAddSolution,
  onUpdateSolution,
  onRemoveSolution,
  onMoveSolution,
}: EditorPanelProps) {
  const [tab, setTab] = useState<EditorTab>('visual')

  return (
    <div className="flex flex-col h-full">
      {/* Abas do editor */}
      <div className="flex border-b border-[#e5e7eb] bg-white flex-shrink-0">
        {EDITOR_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors ${
              tab === t.key
                ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50'
                : 'text-[#6b7280] hover:text-[#374151]'
            }`}
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo das abas */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ─── ABA: VISUAL ─── */}
        {tab === 'visual' && (
          <div>
            <p className="text-[13px] font-bold text-[#374151] mb-3">
              Esquema de Cores da Marca
            </p>
            <div className="divide-y divide-[#f3f4f6]">
              {(Object.keys(draft.colors) as (keyof LandingColors)[]).map((key) => (
                <ColorRow
                  key={key}
                  colorKey={key}
                  value={draft.colors[key]}
                  onChange={(v) => onUpdateColors(key, v)}
                />
              ))}
            </div>
            <p className="text-[11px] text-[#9ca3af] mt-3 leading-relaxed">
              Todas as alterações são aplicadas ao preview em tempo real. Clique em
              "Publicar" para torná-las visíveis ao público.
            </p>
          </div>
        )}

        {/* ─── ABA: HERO ─── */}
        {tab === 'hero' && (
          <div className="space-y-4">
            <div>
              <FieldLabel>Título principal (H1)</FieldLabel>
              <TextareaInput
                value={draft.hero.title}
                onChange={(v) => onUpdateHero('title', v)}
                placeholder="Frase de impacto focada na dor do cliente"
                rows={3}
              />
            </div>
            <div>
              <FieldLabel>Subtítulo</FieldLabel>
              <TextareaInput
                value={draft.hero.subtitle}
                onChange={(v) => onUpdateHero('subtitle', v)}
                placeholder="Explique o valor e a solução"
                rows={3}
              />
            </div>
            <div>
              <FieldLabel>Mídia do hero</FieldLabel>
              <MediaUploader
                mediaUrl={draft.hero.media_url}
                mediaType={draft.hero.media_type}
                onUrlChange={(url) => onUpdateHero('media_url', url)}
                onTypeChange={(t) => onUpdateHero('media_type', t)}
              />
            </div>
            <div>
              <FieldLabel>Texto do botão CTA</FieldLabel>
              <TextInput
                value={draft.hero.cta_text}
                onChange={(v) => onUpdateHero('cta_text', v)}
                placeholder="Ex: Falar com Especialista"
              />
            </div>
            <div>
              <FieldLabel>URL do CTA</FieldLabel>
              <TextInput
                value={draft.hero.cta_url}
                onChange={(v) => onUpdateHero('cta_url', v)}
                placeholder="https:// ou #ancora"
                type="url"
              />
            </div>
          </div>
        )}

        {/* ─── ABA: SOLUÇÕES ─── */}
        {tab === 'solutions' && (
          <div className="space-y-4">
            <div>
              <FieldLabel>Título da seção</FieldLabel>
              <TextInput
                value={draft.solutions_title}
                onChange={onUpdateSolutionsTitle}
                placeholder="Ex: Nossos Ecossistemas"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-[#374151]">
                Cards ({draft.solutions.length})
              </span>
              <button
                type="button"
                onClick={onAddSolution}
                className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Adicionar card
              </button>
            </div>

            {draft.solutions.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-[#9ca3af] border-2 border-dashed border-[#e5e7eb] rounded-xl">
                Nenhum card ainda.
                <br />
                Clique em "Adicionar card" para começar.
              </div>
            ) : (
              <div className="space-y-2">
                {draft.solutions.map((item, i) => (
                  <SolutionEditor
                    key={item.id}
                    item={item}
                    index={i}
                    total={draft.solutions.length}
                    onChange={(updated) => onUpdateSolution(i, updated)}
                    onRemove={() => onRemoveSolution(i)}
                    onMove={(dir) => onMoveSolution(i, dir)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview da landing (moldura mobile)
// ─────────────────────────────────────────────────────────────────────────────

function LandingPreview({ draft }: { draft: LandingConfig }) {
  return (
    <div className="flex flex-col items-center py-6 px-4 bg-[#f3f4f6] min-h-full">
      <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3">
        Preview (mobile)
      </p>
      <div
        className="w-full max-w-[375px] rounded-3xl shadow-2xl overflow-hidden border-4 border-[#1f2937]"
        style={{ backgroundColor: draft.colors.bg }}
      >
        <HeroSection hero={draft.hero} colors={draft.colors} />
        <SolutionsGrid
          title={draft.solutions_title}
          solutions={draft.solutions}
          colors={draft.colors}
        />
        {draft.solutions.length === 0 && (
          <div className="py-6 text-center text-[12px]" style={{ color: draft.colors.text, opacity: 0.4 }}>
            Adicione cards na aba "Soluções"
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal: LandingAdminPage
// ─────────────────────────────────────────────────────────────────────────────

export default function LandingAdminPage() {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<LandingConfig>(DEFAULT_LANDING_CONFIG)
  const [configId, setConfigId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'editor' | 'preview'>('editor')
  const [publishing, setPublishing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    checkAuthAndLoad()
  }, [])

  async function checkAuthAndLoad() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      navigate('/admin/login')
      return
    }
    const { data } = await supabase
      .from('landing_configs')
      .select('*')
      .limit(1)
      .maybeSingle()
    if (data) {
      setConfigId(data.id)
      setDraft({ ...(data.config as LandingConfig), id: data.id })
    }
  }

  // ── Mutações do rascunho ─────────────────────────────────────────────────

  function markDirty() {
    setDirty(true)
    setSuccessMsg(null)
  }

  function updateColors(key: keyof LandingColors, value: string) {
    setDraft((prev) => ({ ...prev, colors: { ...prev.colors, [key]: value } }))
    markDirty()
  }

  function updateHero(key: keyof HeroConfig, value: string) {
    setDraft((prev) => ({ ...prev, hero: { ...prev.hero, [key]: value } }))
    markDirty()
  }

  function updateSolutionsTitle(value: string) {
    setDraft((prev) => ({ ...prev, solutions_title: value }))
    markDirty()
  }

  function addSolution() {
    const newItem: SolutionItem = {
      id: crypto.randomUUID(),
      title: '',
      description: '',
      media_url: '',
      media_type: 'image',
      thumbnail_url: '',
      link_url: '',
      order_index: draft.solutions.length,
    }
    setDraft((prev) => ({ ...prev, solutions: [...prev.solutions, newItem] }))
    markDirty()
  }

  function updateSolution(index: number, updated: SolutionItem) {
    setDraft((prev) => ({
      ...prev,
      solutions: prev.solutions.map((s, i) => (i === index ? updated : s)),
    }))
    markDirty()
  }

  function removeSolution(index: number) {
    setDraft((prev) => ({
      ...prev,
      solutions: prev.solutions.filter((_, i) => i !== index),
    }))
    markDirty()
  }

  function moveSolution(index: number, dir: -1 | 1) {
    const arr = [...draft.solutions]
    const target = index + dir
    if (target < 0 || target >= arr.length) return
    ;[arr[index], arr[target]] = [arr[target], arr[index]]
    arr.forEach((s, i) => (s.order_index = i))
    setDraft((prev) => ({ ...prev, solutions: arr }))
    markDirty()
  }

  // ── Publicar ─────────────────────────────────────────────────────────────

  async function publishChanges() {
    setPublishing(true)
    setErrorMsg(null)

    const payload = {
      config: { ...draft },
      updated_at: new Date().toISOString(),
    }

    let error
    if (configId) {
      ;({ error } = await supabase
        .from('landing_configs')
        .update(payload)
        .eq('id', configId))
    } else {
      const { data, error: e } = await supabase
        .from('landing_configs')
        .insert(payload)
        .select('id')
        .single()
      error = e
      if (data) setConfigId(data.id)
    }

    if (error) {
      setErrorMsg(error.message)
    } else {
      setDirty(false)
      setSuccessMsg('Alterações publicadas com sucesso! ✓')
    }
    setPublishing(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* ── Header ── */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-white border-b border-[#e5e7eb] z-20">
        <button
          onClick={() => navigate('/')}
          className="text-[13px] text-blue-600 font-semibold"
        >
          ← Perfil
        </button>

        <div className="flex flex-col items-center">
          <h1 className="text-[14px] font-bold text-[#111827]">Editor da LP</h1>
          {dirty && (
            <span className="text-[10px] text-amber-500 font-semibold">● Rascunho não publicado</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={publishChanges}
            disabled={!dirty || publishing}
            className="px-3 py-1.5 text-[12px] font-bold text-white bg-blue-600 rounded-lg disabled:opacity-40 hover:bg-blue-700 transition-colors shadow-sm"
          >
            {publishing ? '…' : 'Publicar'}
          </button>
          <button
            onClick={handleLogout}
            className="text-[12px] text-[#9ca3af] hover:text-[#374151]"
          >
            Sair
          </button>
        </div>
      </header>

      {/* ── Abas mobile: Editar / Preview ── */}
      <div className="md:hidden flex-shrink-0 flex border-b border-[#e5e7eb]">
        {(['editor', 'preview'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setMobileView(v)}
            className={`flex-1 py-2 text-[13px] font-semibold transition-colors ${
              mobileView === v
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-[#6b7280]'
            }`}
          >
            {v === 'editor' ? '✏️ Editar' : '👁 Preview'}
          </button>
        ))}
      </div>

      {/* ── Mensagens de feedback ── */}
      {(successMsg || errorMsg) && (
        <div
          className={`flex-shrink-0 px-4 py-2 text-[13px] font-medium text-center ${
            successMsg ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
          }`}
        >
          {successMsg ?? errorMsg}
        </div>
      )}

      {/* ── Corpo: split view (desktop) / tabs (mobile) ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div
          className={`${
            mobileView === 'editor' ? 'flex' : 'hidden'
          } md:flex flex-col w-full md:w-[400px] md:border-r border-[#e5e7eb] overflow-hidden flex-shrink-0`}
        >
          <EditorPanel
            draft={draft}
            onUpdateColors={updateColors}
            onUpdateHero={updateHero}
            onUpdateSolutionsTitle={updateSolutionsTitle}
            onAddSolution={addSolution}
            onUpdateSolution={updateSolution}
            onRemoveSolution={removeSolution}
            onMoveSolution={moveSolution}
          />
        </div>

        {/* Preview */}
        <div
          className={`${
            mobileView === 'preview' ? 'flex' : 'hidden'
          } md:flex flex-1 overflow-y-auto`}
        >
          <div className="w-full">
            <LandingPreview draft={draft} />
          </div>
        </div>
      </div>
    </div>
  )
}
