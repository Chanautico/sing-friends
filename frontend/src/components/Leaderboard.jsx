import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../lib/api.js'

export default function Leaderboard() {
  const [top, setTop] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/api/leaderboard')
      .then((res) => res.json())
      .then(setTop)
      .finally(() => setLoading(false))
  }, [])

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="min-h-screen bg-slate-950 px-5 py-10">
      <div className="max-w-md mx-auto">
        <Link to="/" className="text-sm text-white/40">← Voltar</Link>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-[rgb(var(--accent-primary))] to-[rgb(var(--accent-secondary))] bg-clip-text text-transparent mt-2 mb-6">
          Ranking global
        </h1>

        {loading ? (
          <p className="text-white/40 text-sm">Carregando...</p>
        ) : top.length === 0 ? (
          <p className="text-white/40 text-sm">
            Ninguém pontuou ainda — cante uma música pra aparecer aqui.
          </p>
        ) : (
          <ul className="space-y-2">
            {top.map((u, i) => (
              <li key={u.name} className="flex items-center justify-between rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 px-4 py-3">
                <span className="flex items-center gap-3 text-white">
                  <span className="w-6 text-center">{medals[i] ?? `${i + 1}º`}</span>
                  {u.name}
                </span>
                <span className="font-bold text-lg text-[rgb(var(--accent-secondary))] tabular-nums">{u.totalScore}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
