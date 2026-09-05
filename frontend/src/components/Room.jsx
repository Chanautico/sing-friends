import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useKaraokeSocket } from '../context/SocketContext.jsx'
import { apiFetch } from '../lib/api.js'
import Chat from './Chat.jsx'

export default function Room() {
  const { code } = useParams()
  const { room, userId, onSongStart, removeFromQueue, leaveRoom } = useKaraokeSocket()
  const navigate = useNavigate()

  const [isSearchOpen, setIsSearchOpen] = useState(false)

  useEffect(() => onSongStart(() => navigate(`/room/${code}/stage`)), [onSongStart, navigate, code])

  async function handleLeave() {
    await leaveRoom()
    navigate('/')
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-4 border-[rgb(var(--accent-primary))] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-white/50 text-sm">Conectando à sala {code} e carregando dados...</p>
      </div>
    )
  }

  // Garante que sempre exista pelo menos o usuário atual na lista para liberar o jogo
  let users = Array.isArray(room.users) && room.users.length > 0 
    ? room.users 
    : [{ id: userId || 'local', name: localStorage.getItem('karaoke_user_name') || 'Você', score: 0, connected: true }]

  const queue = Array.isArray(room.queue) ? room.queue : []
  const shareLink = `${window.location.origin}/room/${code}`

  return (
    <div className="min-h-screen bg-slate-950 px-5 py-8 max-w-lg mx-auto pb-16 relative">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-[rgb(var(--accent-primary))]">Sala</p>
          <h1 className="text-4xl font-bold tracking-widest text-white">{code}</h1>
          <button
            onClick={() => navigator.clipboard?.writeText(shareLink)}
            className="text-xs text-white/40 mt-1 underline underline-offset-2"
          >
            copiar link de convite
          </button>
        </div>
        <button
          onClick={handleLeave}
          className="text-xs text-rose-400 border border-rose-400/30 rounded-full px-3 py-1.5 hover:bg-rose-400/10 transition-colors shrink-0"
        >
          Sair da sala
        </button>
      </header>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-2">Cantores na sala</h2>
        <ul className="space-y-2">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 px-4 py-3"
            >
              <span className={`text-white ${u.connected !== false ? '' : 'opacity-40'}`}>
                {u.name} {u.id === userId && <span className="text-[rgb(var(--accent-primary))] text-xs">(você)</span>}
              </span>
              <span className="font-bold text-[rgb(var(--accent-secondary))] tabular-nums">{u.score || 0} pts</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-white">Fila de músicas</h2>
          
          <button
            onClick={() => setIsSearchOpen(true)}
            className="text-xs bg-gradient-to-r from-[rgb(var(--accent-primary))] to-[rgb(var(--accent-secondary))] text-white font-semibold px-3 py-1.5 rounded-full shadow-[0_0_16px_rgb(var(--accent-primary)/0.4)]"
          >
            + adicionar
          </button>
        </div>

        {queue.length === 0 ? (
          <p className="text-sm text-white/40">A fila está vazia — adicione a primeira música.</p>
        ) : (
          <ul className="space-y-2">
            {queue.map((item, i) => (
              <li
                key={item.id || i}
                className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 px-4 py-3 flex items-center gap-3 group"
              >
                <span className="font-bold text-xs text-[rgb(var(--accent-primary))]">{i + 1}</span>
                
                {item.thumbnail && (
                  <img src={item.thumbnail} alt={item.title} className="w-12 h-9 object-cover rounded-lg border border-white/10" />
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-white truncate">{item.title}</p>
                  {item.artist && <p className="text-xs text-white/40 truncate">{item.artist}</p>}
                </div>

                {(!item.lyrics || item.lyrics.length === 0) && (
                  <span className="text-[10px] text-amber-400/80 uppercase whitespace-nowrap">sem letra sinc.</span>
                )}

                <button
                  onClick={() => removeFromQueue(item.id)}
                  className="text-white/30 hover:text-rose-400 text-sm font-bold px-2 py-1 transition-colors"
                  title="Remover música"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {queue.length > 0 && !room.currentSong && users.length > 0 && <StartNextForm users={users} />}

      <Chat initialMessages={Array.isArray(room.chat) ? room.chat : []} />

      {isSearchOpen && (
        <SearchSongModal onClose={() => setIsSearchOpen(false)} />
      )}
    </div>
  )
}

function SearchSongModal({ onClose }) {
  const { addToQueue } = useKaraokeSocket()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [processingTitle, setProcessingTitle] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await apiFetch(`/api/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      if (Array.isArray(data)) {
        setResults(data)
      } else {
        setResults([])
        setErrorMsg('Nenhum resultado encontrado.')
      }
    } catch (err) {
      console.error('Erro ao buscar músicas:', err)
      setResults([])
      setErrorMsg('Falha ao conectar com o servidor.')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectVideo = async (video) => {
    setProcessingTitle(video.title)
    let lyrics = []
    let hasLyrics = false

    try {
      const cleanTitle = video.title
        .replace(/\[.*?\]|\(.*?\)/g, '')
        .replace(/official music video|lyrics|audio/gi, '')
        .trim()

      const lyricsRes = await apiFetch(`/api/lyrics?title=${encodeURIComponent(cleanTitle)}&artist=${encodeURIComponent(video.artist)}`)
      
      if (lyricsRes.ok) {
        const lyricsData = await lyricsRes.json()
        lyrics = lyricsData.lyrics || []
        hasLyrics = lyricsData.hasLyrics || false
      }
    } catch (err) {
      console.warn('Aviso: Letra sincronizada não encontrada, prosseguindo com o vídeo.')
    }

    const songData = {
      title: video.title,
      artist: video.artist,
      youtubeUrl: video.url,
      thumbnail: video.thumbnail,
      lyrics: lyrics,
      hasLyrics: hasLyrics
    }

    addToQueue(songData)
    setProcessingTitle(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-xl w-full p-6 flex flex-col gap-5 shadow-2xl relative">
        
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">Buscar Música no YouTube</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white text-lg font-bold">✕</button>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            placeholder="Digite o nome da música ou artista..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[rgb(var(--accent-primary))]"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-gradient-to-r from-[rgb(var(--accent-primary))] to-[rgb(var(--accent-secondary))] text-white font-semibold px-5 py-3 rounded-xl transition-transform active:scale-95 disabled:opacity-50"
          >
            {loading ? 'Buscando...' : '🔍 Buscar'}
          </button>
        </form>

        {processingTitle && (
          <div className="text-center py-2 text-[rgb(var(--accent-primary))] font-medium animate-pulse text-sm">
            Sincronizando letra para "{processingTitle}"... 🎶
          </div>
        )}

        {errorMsg && (
          <p className="text-center text-rose-400 text-sm">{errorMsg}</p>
        )}

        <div className="flex flex-col gap-3 max-h-[55vh] overflow-y-auto pr-1">
          {Array.isArray(results) && results.map((video) => (
            <div
              key={video.videoId}
              onClick={() => !processingTitle && handleSelectVideo(video)}
              className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 cursor-pointer transition-all group"
            >
              <img
                src={video.thumbnail}
                alt={video.title}
                className="w-24 h-16 object-cover rounded-xl border border-white/10 group-hover:scale-105 transition-transform"
              />
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold truncate group-hover:text-[rgb(var(--accent-primary))] transition-colors">
                  {video.title}
                </p>
                <p className="text-white/50 text-sm truncate">{video.artist}</p>
                <span className="text-xs text-[rgb(var(--accent-secondary))] mt-1 inline-block">{video.duration}</span>
              </div>
            </div>
          ))}

          {!loading && results.length === 0 && !errorMsg && (
            <p className="text-center text-white/30 py-8">Digite algo acima para pesquisar suas músicas favoritas.</p>
          )}
        </div>

      </div>
    </div>
  )
}

function StartNextForm({ users }) {
  const { nextSong } = useKaraokeSocket()
  const [mode, setMode] = useState('solo') // 'solo' | 'coop'
  const [singerId, setSingerId] = useState(users[0]?.id ?? '')
  // Co-op começa com todo mundo marcado — desmarcar quem só quer assistir dessa vez.
  const [coopIds, setCoopIds] = useState(() => new Set(users.map((u) => u.id)))

  function toggleCoopUser(id) {
    setCoopIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleStart() {
    if (mode === 'coop') nextSong(null, 'coop', Array.from(coopIds))
    else nextSong(singerId, 'solo')
  }

  const coopDisabled = mode === 'coop' && coopIds.size === 0

  return (
    <section className="rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 p-5 mt-4">
      <h2 className="text-lg font-semibold text-white mb-3">Começar a próxima música</h2>

      <div className="flex gap-1 rounded-full bg-white/5 border border-white/10 p-1 mb-4 w-fit">
        <button
          type="button"
          onClick={() => setMode('solo')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            mode === 'solo' ? 'bg-gradient-to-r from-[rgb(var(--accent-primary))] to-[rgb(var(--accent-secondary))] text-white' : 'text-white/50'
          }`}
        >
          Solo
        </button>
        <button
          type="button"
          onClick={() => setMode('coop')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            mode === 'coop' ? 'bg-gradient-to-r from-[rgb(var(--accent-primary))] to-[rgb(var(--accent-secondary))] text-white' : 'text-white/50'
          }`}
        >
          Co-op (cantar junto)
        </button>
      </div>

      {mode === 'solo' ? (
        <>
          <label className="text-xs uppercase tracking-wide text-white/40">Quem vai cantar?</label>
          <select
            value={singerId}
            onChange={(e) => setSingerId(e.target.value)}
            className="w-full mt-1 mb-3 bg-white/5 border border-white/10 rounded-xl p-3 text-white"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id} className="bg-slate-900">
                {u.name}
              </option>
            ))}
          </select>
        </>
      ) : (
        <div className="mb-3">
          <p className="text-xs uppercase tracking-wide text-white/40 mb-2">Quem vai cantar junto?</p>
          <div className="flex flex-wrap gap-2">
            {users.map((u) => (
              <label
                key={u.id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm cursor-pointer border transition-colors ${
                  coopIds.has(u.id) ? 'bg-[rgb(var(--accent-primary)/0.2)] border-[rgb(var(--accent-primary)/0.5)] text-white' : 'bg-white/5 border-white/10 text-white/50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={coopIds.has(u.id)}
                  onChange={() => toggleCoopUser(u.id)}
                  className="accent-[rgb(var(--accent-primary))]"
                />
                {u.name}
              </label>
            ))}
          </div>
          <p className="text-[11px] text-white/30 mt-2">
            Todo mundo marcado canta ao mesmo tempo, com microfone próprio — o placar coletivo
            e o individual de cada um sobem juntos durante a música.
          </p>
        </div>
      )}

      <button
        onClick={handleStart}
        disabled={coopDisabled}
        className="w-full py-3 rounded-2xl bg-gradient-to-r from-[rgb(var(--accent-primary))] to-[rgb(var(--accent-secondary))] text-white font-semibold shadow-[0_0_24px_rgb(var(--accent-primary)/0.35)] transition-transform active:scale-95 disabled:opacity-40"
      >
        ▶ Iniciar
      </button>
    </section>
  )
}