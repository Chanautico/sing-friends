import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useKaraokeSocket } from '../context/SocketContext.jsx'
import { apiFetch } from '../lib/api.js'

const YOUTUBE_URL_REGEX = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/

export default function AddSong() {
  const { code } = useParams()
  const { addToQueue } = useKaraokeSocket()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [status, setStatus] = useState('idle') // idle | searching | error
  const [error, setError] = useState(null)
  const [noLyricsWarning, setNoLyricsWarning] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim() || !youtubeUrl.trim()) return

    if (!YOUTUBE_URL_REGEX.test(youtubeUrl.trim())) {
      setError('Cole um link válido do YouTube (youtube.com/watch?v=... ou youtu.be/...).')
      return
    }

    setStatus('searching')
    setError(null)
    setNoLyricsWarning(null)

    // Busca a letra sincronizada na LRCLIB. Se não encontrar, a música ainda é adicionada —
    // só entra sem highlight de linha (o KaraokePlayer mostra "♪" no lugar da letra).
    let lyrics = []
    let resolvedTitle = title.trim()
    let resolvedArtist = artist.trim() || undefined

    try {
      const params = new URLSearchParams({ title: resolvedTitle })
      if (resolvedArtist) params.set('artist', resolvedArtist)
      const res = await apiFetch(`/api/lyrics?${params.toString()}`)
      const data = await res.json()

      if (res.ok && data.hasSyncedLyrics) {
        lyrics = data.lyrics
        resolvedTitle = data.title || resolvedTitle
        resolvedArtist = data.artist || resolvedArtist
      } else {
        setNoLyricsWarning(
          data.error || 'Letra sincronizada não encontrada — a música vai entrar na fila sem highlight de linha.'
        )
      }
    } catch {
      setNoLyricsWarning('Não deu pra buscar a letra agora — a música vai entrar na fila sem sincronização.')
    }

    addToQueue({ title: resolvedTitle, artist: resolvedArtist, youtubeUrl: youtubeUrl.trim(), lyrics })

    if (lyrics.length === 0) {
      setTimeout(() => navigate(`/room/${code}`), 1800) // dá tempo de ler o aviso acima
    } else {
      navigate(`/room/${code}`)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-5 py-10 flex items-center justify-center">
      <div className="w-full max-w-lg rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_0_60px_rgb(var(--accent-primary)/0.12)] p-8">
        <h1 className="text-2xl font-bold text-white mb-1">Adicionar música</h1>
        <p className="text-sm text-white/40 mb-6">Sala {code}</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-xs uppercase tracking-wide text-white/40">Link do YouTube</label>
            <input
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent-primary))]"
              required
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-white/40">Título da música</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Someone Like You"
              className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent-primary))]"
              required
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-white/40">Artista (opcional, ajuda a achar a letra certa)</label>
            <input
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="Ex: Adele"
              className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent-primary))]"
            />
          </div>

          <button
            type="submit"
            disabled={status === 'searching'}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-[rgb(var(--accent-primary))] to-[rgb(var(--accent-secondary))] text-white font-semibold shadow-[0_0_30px_rgb(var(--accent-primary)/0.35)] transition-transform active:scale-95 disabled:opacity-40"
          >
            {status === 'searching' ? 'Buscando letra...' : 'Adicionar à fila'}
          </button>

          {error && <p className="text-sm text-rose-400">{error}</p>}
          {noLyricsWarning && <p className="text-sm text-amber-400">{noLyricsWarning}</p>}
        </form>
      </div>
    </div>
  )
}
