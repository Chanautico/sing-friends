import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useKaraokeSocket } from '../context/SocketContext.jsx'
import { apiFetch } from '../lib/api.js'
import ThemeSettings from './ThemeSettings.jsx'

export default function Home() {
  const { createRoom, joinRoom, connected } = useKaraokeSocket()
  const navigate = useNavigate()

  const [mode, setMode] = useState('create') // 'create' | 'join'
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [publicRooms, setPublicRooms] = useState([])
  const [showThemeSettings, setShowThemeSettings] = useState(false)

  useEffect(() => {
    apiFetch('/api/rooms/public')
      .then((res) => res.json())
      .then(setPublicRooms)
      .catch(() => setPublicRooms([]))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError(null)

    if (mode === 'create') {
      const { room } = await createRoom(name, isPublic)
      navigate(`/room/${room.code}`)
    } else {
      const result = await joinRoom(code.trim(), name)
      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }
      navigate(`/room/${result.room.code}`)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 gap-8 relative overflow-hidden py-10">
      {/* Glow de fundo — dá o clima "premium" sem depender de imagem nenhuma */}
      <div className="absolute -top-32 -left-24 w-96 h-96 bg-[rgb(var(--accent-primary)/0.2)] rounded-full blur-3xl" />
      <div className="absolute -bottom-32 -right-24 w-96 h-96 bg-[rgb(var(--accent-secondary)/0.2)] rounded-full blur-3xl" />

      <div className="relative w-full max-w-sm flex items-center justify-between text-xs">
        <Link to="/leaderboard" className="text-white/40 underline underline-offset-2">
          🏆 Ranking global
        </Link>
        <button onClick={() => setShowThemeSettings(true)} className="text-white/40 underline underline-offset-2">
          🎨 Personalizar
        </button>
      </div>

      <div className="relative text-center">
        <h1 className="text-5xl font-bold bg-gradient-to-r from-[rgb(var(--accent-primary))] to-[rgb(var(--accent-secondary))] bg-clip-text text-transparent">
          Sing&amp;Friends
        </h1>
        <p className="text-white/30 text-sm mt-2">{connected ? 'conectado' : 'conectando...'}</p>
      </div>

      <div className="relative flex gap-1 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 p-1">
        <button
          onClick={() => setMode('create')}
          className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors ${
            mode === 'create' ? 'bg-gradient-to-r from-[rgb(var(--accent-primary))] to-[rgb(var(--accent-secondary))] text-white' : 'text-white/50'
          }`}
        >
          Criar sala
        </button>
        <button
          onClick={() => setMode('join')}
          className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors ${
            mode === 'join' ? 'bg-gradient-to-r from-[rgb(var(--accent-primary))] to-[rgb(var(--accent-secondary))] text-white' : 'text-white/50'
          }`}
        >
          Entrar em sala
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-sm rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_0_60px_rgb(var(--accent-primary)/0.15)] p-6 space-y-4"
      >
        <div>
          <label className="text-xs uppercase tracking-wide text-white/40">Seu nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Como te chamam no microfone?"
            className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl p-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent-primary))]"
            required
          />
        </div>

        {mode === 'join' && (
          <div>
            <label className="text-xs uppercase tracking-wide text-white/40">Código da sala</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="EX: AB3F7K"
              className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl p-3 text-white font-mono tracking-widest placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent-primary))]"
              required
            />
          </div>
        )}

        {mode === 'create' && (
          <label className="flex items-center gap-2 text-sm text-white/60">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="accent-[rgb(var(--accent-primary))]"
            />
            Listar como sala pública (qualquer pessoa pode entrar direto do lobby)
          </label>
        )}

        <button
          type="submit"
          disabled={loading || !connected}
          className="w-full py-3 rounded-2xl bg-gradient-to-r from-[rgb(var(--accent-primary))] to-[rgb(var(--accent-secondary))] text-white font-semibold shadow-[0_0_24px_rgb(var(--accent-primary)/0.35)] transition-transform active:scale-95 disabled:opacity-40"
        >
          {mode === 'create' ? 'Criar sala' : 'Entrar'}
        </button>

        {error && <p className="text-sm text-rose-400">{error}</p>}
      </form>

      {publicRooms.length > 0 && (
        <div className="relative w-full max-w-sm">
          <h2 className="text-xs uppercase tracking-wide text-white/40 mb-2">Salas públicas ativas</h2>
          <ul className="space-y-2">
            {publicRooms.map((r) => (
              <li key={r.code}>
                <button
                  onClick={async () => {
                    if (!name.trim()) {
                      setError('Digite seu nome antes de entrar numa sala pública.')
                      return
                    }
                    const result = await joinRoom(r.code, name)
                    if (!result.error) navigate(`/room/${result.room.code}`)
                  }}
                  className="w-full flex items-center justify-between rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 px-4 py-3 text-sm text-white hover:border-[rgb(var(--accent-primary)/0.5)] transition-colors"
                >
                  <span className="font-mono tracking-widest">{r.code}</span>
                  <span className="text-white/40">entrar →</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showThemeSettings && <ThemeSettings onClose={() => setShowThemeSettings(false)} />}
    </div>
  )
}
