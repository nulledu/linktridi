import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('E-mail ou senha inválidos.')
    } else {
      navigate('/admin')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-[350px]">
        {/* Card principal */}
        <div className="bg-white border border-[#dbdbdb] rounded-sm px-10 py-8 mb-3">
          <h1 className="text-[28px] font-light text-center text-[#262626] mb-6 tracking-tight">
            Admin
          </h1>

          <form onSubmit={handleLogin} className="space-y-2">
            <input
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2 text-[12px] bg-[#fafafa] border border-[#dbdbdb] rounded-[3px] outline-none focus:border-[#a8a8a8] placeholder-[#8e8e8e]"
            />
            <input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2 text-[12px] bg-[#fafafa] border border-[#dbdbdb] rounded-[3px] outline-none focus:border-[#a8a8a8] placeholder-[#8e8e8e]"
            />

            {error && (
              <p className="text-[12px] text-red-500 text-center pt-1">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-[7px] mt-2 bg-[#0095f6] text-white text-[14px] font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#1877f2] transition-colors"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        {/* Voltar */}
        <div className="bg-white border border-[#dbdbdb] rounded-sm py-4 text-center">
          <button
            onClick={() => navigate('/')}
            className="text-[14px] text-[#262626]"
          >
            Voltar para o perfil
          </button>
        </div>
      </div>
    </div>
  )
}
