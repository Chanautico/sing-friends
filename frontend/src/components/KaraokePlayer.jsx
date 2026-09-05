import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactPlayer from 'react-player/youtube'
import { useKaraokeSocket } from '../context/SocketContext.jsx'
import { useMicLevel } from '../hooks/useMicLevel.js'
import WaveformMeter from './WaveformMeter.jsx'
import Scoreboard from './Scoreboard.jsx'

const TIER = {
  PERFECT: { min: 0.32, points: 15, label: 'Perfeito!' },
  GOOD: { min: 0.14, points: 8, label: 'Bom!' },
}
const MAX_COMBO_BONUS = 0.6 

export default function KaraokePlayer() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { room, userId, endSong, reportScoreDelta, onSongEnded } = useKaraokeSocket()

  const mic = useMicLevel()
  const playerRef = useRef(null)

  const [hasStarted, setHasStarted] = useState(false)
  const [isPlaying, setIsPlaying] = useState(true)
  const [videoVolume, setVideoVolume] = useState(0.8)
  const [currentTime, setCurrentTime] = useState(0)
  const [showScoreboard, setShowScoreboard] = useState(false)
  const [combo, setCombo] = useState(0)
  const [popups, setPopups] = useState([]) 

  const currentSong = room?.currentSong
  const isCoop = currentSong?.mode === 'coop'
  const isSinger = isCoop ? currentSong.singerIds?.includes(userId) : currentSong?.singerId === userId
  // Em Co-op, todo mundo marcado tem seu próprio microfone rodando (isSinger=true pra
  // todos) — mas só UMA pessoa deve avisar o servidor que a música acabou, senão N
  // clientes chamariam song:end ao mesmo tempo e a fila avançaria mais de uma música de
  // uma vez. Convenção: o primeiro da lista de participantes assume esse papel.
  const isPrimarySinger = isCoop ? currentSong?.singerIds?.[0] === userId : isSinger
  const song = currentSong?.queueItem || currentSong

  const cleanYouTubeUrl = (rawUrl) => {
    if (!rawUrl) return null;
    const match = rawUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    if (match && match[1]) {
      return `https://www.youtube.com/watch?v=${match[1]}`;
    }
    return rawUrl;
  };

  const rawLink = song?.youtubeUrl || song?.videoUrl || song?.url || null;
  const videoLink = cleanYouTubeUrl(rawLink);

  const lineTrackingRef = useRef({ index: -1, samples: [] })

  useEffect(() => onSongEnded(() => setShowScoreboard(true)), [onSongEnded])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isPlaying && hasStarted) {
        setIsPlaying(false);
        setTimeout(() => setIsPlaying(true), 100);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isPlaying, hasStarted]);

  const addPopup = useCallback((text, tier) => {
    const id = Date.now() + Math.random()
    setPopups((p) => [...p, { id, text, tier }])
    setTimeout(() => setPopups((p) => p.filter((popup) => popup.id !== id)), 1100)
  }, [])

  const finalizeLine = useCallback(
    (samples) => {
      if (!samples || samples.length === 0) return
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length

      let tier = null
      if (avg >= TIER.PERFECT.min) tier = TIER.PERFECT
      else if (avg >= TIER.GOOD.min) tier = TIER.GOOD

      if (!tier) {
        setCombo(0)
        return
      }

      setCombo((c) => {
        const nextCombo = c + 1
        const bonus = 1 + Math.min(nextCombo * 0.05, MAX_COMBO_BONUS)
        const points = Math.round(tier.points * bonus)
        reportScoreDelta(points)
        addPopup(nextCombo >= 5 ? `${tier.label} combo x${nextCombo}!` : tier.label, tier === TIER.PERFECT ? 'perfect' : 'good')
        return nextCombo
      })
    },
    [reportScoreDelta, addPopup]
  )

  const handleProgress = useCallback(
    ({ playedSeconds }) => {
      setCurrentTime(playedSeconds)
      if (!isSinger || !song?.lyrics?.length || !isPlaying) return

      const lineIndex = song.lyrics.findIndex((l, i) => {
        const next = song.lyrics[i + 1]
        return playedSeconds >= l.time && (!next || playedSeconds < next.time)
      })

      const tracking = lineTrackingRef.current
      if (lineIndex !== tracking.index && tracking.index !== -1) {
        finalizeLine(tracking.samples)
        lineTrackingRef.current = { index: lineIndex, samples: [] }
      } else if (tracking.index === -1) {
        lineTrackingRef.current.index = lineIndex
      }

      // Validação rigorosa: ignora palmas e barulhos secos exigindo tom dentro da faixa vocal humana (85Hz a 1000Hz)
      if (lineIndex >= 0) {
        const hasHumanVoicePitch = mic.pitch >= 85 && mic.pitch <= 1000 && mic.note !== null
        const hasValidVolume = mic.volume > 0.1
        
        // Só conta ponto se for uma frequência vocal real com volume adequado
        const isSinging = hasHumanVoicePitch && hasValidVolume
        lineTrackingRef.current.samples.push(isSinging ? 1 : 0)
      }
    },
    [isSinger, song, finalizeLine, mic.pitch, mic.note, mic.volume, isPlaying]
  )

  async function handleStart() {
    if (isSinger) await mic.start()
    setHasStarted(true)
    setIsPlaying(true)
  }

  const handleEnded = useCallback(() => {
    if (currentTime < 15) return

    finalizeLine(lineTrackingRef.current.samples)
    if (isSinger) mic.stop() // cada participante desliga o PRÓPRIO microfone
    if (isPrimarySinger) endSong() // só um avisa o servidor, evita avançar a fila 2x em Co-op
  }, [currentTime, finalizeLine, isSinger, isPrimarySinger, mic, endSong])

  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleSkip = () => {
    if (isSinger) mic.stop();
    if (isPrimarySinger) endSong();
    navigate(`/room/${code}`);
  };

  const handleLeaveRoom = () => {
    if (isSinger) mic.stop();
    if (isPrimarySinger) endSong();
    navigate(`/room/${code}`); 
  };

  if (!currentSong || !song) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 gap-4">
        <p className="text-white/50 text-lg">Aguardando início da música...</p>
        <button
          onClick={() => navigate(`/room/${code}`)}
          className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/25 border border-white/10 text-white font-medium transition-colors"
        >
          ← Voltar para a Sala
        </button>
      </div>
    )
  }

  const lineIndex = song.lyrics?.findIndex((l, i) => {
    const next = song.lyrics[i + 1]
    return currentTime >= l.time && (!next || currentTime < next.time)
  })
  const prevLine = lineIndex > 0 ? song.lyrics[lineIndex - 1] : null
  const currentLine = lineIndex >= 0 ? song.lyrics[lineIndex] : null
  const nextLine = lineIndex >= 0 ? song.lyrics[lineIndex + 1] : song.lyrics?.[0]

  const myScore = room.users.find((u) => u.id === userId)?.score ?? 0

  // Soma, pra todo mundo participando (1 pessoa em solo, N em Co-op), os pontos ganhos
  // DESDE o início desta música — não o placar total da sessão, que incluiria músicas
  // anteriores. `scoreAtStart` é o retrato do placar de cada um no instante em que a
  // música começou (vem do servidor, ver server.js).
  const participantIds = isCoop ? currentSong.singerIds ?? [] : currentSong.singerId ? [currentSong.singerId] : []
  const coopSongScore = participantIds.reduce((sum, id) => {
    const user = room.users.find((u) => u.id === id)
    const start = currentSong.scoreAtStart?.[id] ?? 0
    return sum + Math.max(0, (user?.score ?? 0) - start)
  }, 0)

  return (
    <div className="relative min-h-screen bg-slate-950 overflow-hidden flex flex-col items-center justify-center">
      
      {hasStarted && videoLink && (
        <div className="absolute inset-0">
          <ReactPlayer
            ref={playerRef}
            url={videoLink}
            playing={isPlaying}
            controls={false}
            volume={videoVolume}
            width="100%"
            height="100%"
            progressInterval={100}
            onProgress={handleProgress}
            onEnded={handleEnded}
            onReady={(player) => {
              const elapsed = Math.max(0, (Date.now() - currentSong.startedAt) / 1000)
              player.seekTo(elapsed, 'seconds')
            }}
            config={{ 
              youtube: { 
                playerVars: { 
                  modestbranding: 1, 
                  rel: 0, 
                  iv_load_policy: 3,
                  enablejsapi: 1,
                  origin: window.location.origin
                } 
              } 
            }}
            style={{ pointerEvents: 'none' }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/40 to-slate-950/90" />
        </div>
      )}

      {hasStarted && !videoLink && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
           <p className="text-red-400 font-bold bg-black/50 p-4 rounded">Erro: Link do vídeo não encontrado para esta música.</p>
        </div>
      )}

      {!hasStarted ? (
        <StartScreen song={song} isSinger={isSinger} onStart={handleStart} micError={mic.error} />
      ) : (
        <div className="relative z-10 w-full max-w-2xl px-6 flex flex-col items-center gap-8 pb-20">
          
          <div className="w-full flex items-center justify-between rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 px-5 py-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-[rgb(var(--accent-primary))]">
                {isCoop
                  ? `Modo Co-op — cantando junto: ${currentSong.singerIds.map((id) => room.users.find((u) => u.id === id)?.name).filter(Boolean).join(', ')}`
                  : isSinger
                  ? 'Você está cantando'
                  : `${room.users.find((u) => u.id === currentSong.singerId)?.name ?? '...'} está cantando`}
              </p>
              <p className="text-white font-semibold">{song.title}{song.artist ? ` — ${song.artist}` : ''}</p>
            </div>
            {isSinger && (
              <div className="text-right">
                {isCoop && (
                  <p className="text-xs text-white/40">
                    grupo: <span className="text-[rgb(var(--accent-secondary))] font-semibold">{coopSongScore}</span>
                  </p>
                )}
                <p className="text-2xl font-bold text-[rgb(var(--accent-secondary))] tabular-nums">{myScore}</p>
                {combo > 1 && <p className="text-xs text-[rgb(var(--accent-primary))]">combo x{combo}</p>}
              </div>
            )}
          </div>

          <div className="text-center min-h-[9rem] flex flex-col items-center justify-center gap-3">
            <p className="text-lg text-white/30 transition-opacity duration-300">{prevLine?.text ?? '\u00A0'}</p>
            <p
              key={lineIndex}
              className={`text-3xl md:text-4xl font-bold text-white transition-all duration-300 ${isPlaying ? 'drop-shadow-[0_0_18px_rgb(var(--accent-primary)/0.5)]' : 'opacity-50'}`}
            >
              {currentLine?.text ?? '♪'}
            </p>
            <p className="text-lg text-white/40 transition-opacity duration-300">{nextLine?.text ?? '\u00A0'}</p>
          </div>

          <div className="relative h-10 w-full flex items-center justify-center">
            {popups.map((p) => (
              <span
                key={p.id}
                className={`absolute font-bold text-lg animate-float-up ${
                  p.tier === 'perfect' ? 'text-[rgb(var(--accent-primary))]' : 'text-[rgb(var(--accent-secondary))]'
                }`}
              >
                {p.text}
              </span>
            ))}
          </div>

          <div className="w-full flex flex-col items-center gap-4">
            {isSinger && (
              <WaveformMeter bars={mic.bars} volume={mic.volume} active={mic.isActive && isPlaying} />
            )}

            <div className="w-full max-w-xs flex items-center gap-3">
              <span className="text-white/40 text-sm">🔊</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={videoVolume}
                onChange={(e) => setVideoVolume(Number(e.target.value))}
                className="flex-1 accent-[rgb(var(--accent-primary))]"
                aria-label="Volume do vídeo"
              />
            </div>
          </div>
        </div>
      )}

      {hasStarted && (
        <div className="absolute bottom-6 w-full max-w-xl px-6 flex justify-between gap-4 z-20">
          <button 
            onClick={togglePlayPause}
            className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 text-white font-medium transition-colors"
          >
            {isPlaying ? '⏸ Pausar' : '▶️ Continuar'}
          </button>
          
          {isSinger && (
            <button 
              onClick={handleSkip}
              className="flex-1 py-3 rounded-xl bg-[rgb(var(--accent-secondary)/0.2)] hover:bg-[rgb(var(--accent-secondary)/0.4)] backdrop-blur-md border border-[rgb(var(--accent-secondary)/0.3)] text-[rgb(var(--accent-secondary))] font-medium transition-colors"
            >
              ⏭ Pular Música
            </button>
          )}

          <button 
            onClick={handleLeaveRoom}
            className="flex-1 py-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/40 backdrop-blur-md border border-rose-500/30 text-rose-100 font-medium transition-colors"
          >
            🚪 Sair da Sala
          </button>
        </div>
      )}

      {showScoreboard && (
        <Scoreboard
          users={room.users}
          onClose={() => {
            setShowScoreboard(false)
            navigate(`/room/${code}`)
          }}
        />
      )}
    </div>
  )
}

function StartScreen({ song, isSinger, onStart, micError }) {
  return (
    <div className="relative z-10 max-w-sm w-full mx-6 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_0_60px_rgb(var(--accent-primary)/0.15)] px-8 py-10 text-center">
      <p className="text-xs uppercase tracking-widest text-[rgb(var(--accent-primary))] mb-2">Prontos?</p>
      <h1 className="text-2xl font-bold text-white mb-1">{song.title}</h1>
      {song.artist && <p className="text-white/40 mb-6">{song.artist}</p>}

      <button
        onClick={onStart}
        className="w-full py-4 rounded-2xl bg-gradient-to-r from-[rgb(var(--accent-primary))] to-[rgb(var(--accent-secondary))] text-white font-semibold shadow-[0_0_30px_rgb(var(--accent-primary)/0.4)] transition-transform active:scale-95"
      >
        {isSinger ? '🎤 Ativar microfone e começar' : '👀 Assistir'}
      </button>

      {isSinger && (
        <p className="text-xs text-white/30 mt-4">
          O navegador vai pedir permissão de microfone — sem ela, a pontuação não funciona.
        </p>
      )}
      {micError && <p className="text-xs text-rose-400 mt-3">{micError}</p>}
    </div>
  )
}