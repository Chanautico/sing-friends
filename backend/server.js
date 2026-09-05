import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import http from 'node:http'
import { Server } from 'socket.io'
import yts from 'yt-search'
import { roomManager } from './src/roomManager.js'
import { moderateMessage } from './src/moderation.js'
import miscRoutes from './src/miscRoutes.js'
import { recordScoreEntry } from './src/scoreService.js'

// Allowlist de origens permitidas — inclui explicitamente o seu domínio da Vercel
// e permite adicionar mais via variável de ambiente FRONTEND_URL se necessário.
const defaultOrigins = ['https://sing-friends.vercel.app', 'http://localhost:5173']
const envOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean)

const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])]

const corsOptions = {
  origin(origin, callback) {
    // `origin` vem undefined em chamadas sem navegador (curl, health checks) — permite.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    callback(new Error(`Origem não permitida pelo CORS: ${origin}`))
  },
  credentials: true,
}

const app = express()
app.use(cors(corsOptions)) // mesma allowlist usada no Socket.io, logo abaixo
app.use(express.json())
app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.use('/api', miscRoutes) // /api/leaderboard, /api/rooms/public

// --- ROTA DE BUSCA DE LETRAS COM FALLBACK INTELIGENTE ---
app.get('/api/lyrics', async (req, res) => {
  let { title, artist } = req.query
  if (!title) return res.status(400).json({ error: 'Titulo nao fornecido' })

  const cleanStr = (str) => {
    if (!str) return ''
    return str
      .replace(/\[.*?\]|\(.*?\)/g, '')
      .replace(/official music video|lyrics|audio|clipe oficial|hd|hq|vocal cover/gi, '')
      .trim()
  }

  const cleanedTitle = cleanStr(title)
  const cleanedArtist = cleanStr(artist)

  const attempts = [
    `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanedTitle)}&artist_name=${encodeURIComponent(cleanedArtist)}`,
    `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanedArtist} ${cleanedTitle}`)}`,
    `https://lrclib.net/api/search?q=${encodeURIComponent(cleanedTitle)}`,
  ]

  let foundData = { lyrics: [], hasLyrics: false }

  for (const url of attempts) {
    try {
      const response = await fetch(url)
      if (!response.ok) continue
      const data = await response.json()

      if (data && data.syncedLyrics) {
        foundData = { lyrics: parseSyncLyrics(data.syncedLyrics), hasLyrics: true }
        break
      }

      if (Array.isArray(data) && data.length > 0) {
        const match = data.find((item) => item.syncedLyrics) || data[0]
        if (match && match.syncedLyrics) {
          foundData = { lyrics: parseSyncLyrics(match.syncedLyrics), hasLyrics: true }
          break
        }
      }
    } catch (err) {
      console.warn(`Tentativa de busca de letra falhou para URL: ${url}`, err.message)
    }
  }

  res.json(foundData)
})

function parseSyncLyrics(syncedString) {
  if (!syncedString) return []
  const lines = syncedString.split('\n')
  const parsed = []

  for (const line of lines) {
    const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/)
    if (match) {
      const minutes = parseInt(match[1], 10)
      const seconds = parseInt(match[2], 10)
      const milliseconds = parseInt(match[3].padEnd(3, '0'), 10)
      const timeMs = minutes * 60000 + seconds * 1000 + milliseconds
      const text = match[4].trim()
      parsed.push({ time: timeMs / 1000, text })
    }
  }
  return parsed
}

// --- ROTA DE BUSCA INTEGRADA (YouTube) ---
app.get('/api/search', async (req, res) => {
  const query = req.query.q
  if (!query) return res.status(400).json({ error: 'Termo de busca nao fornecido' })

  try {
    const searchResult = await yts(query)
    const videos = (searchResult?.videos || []).slice(0, 6).map((v) => ({
      videoId: v.videoId,
      title: v.title,
      artist: v.author?.name || 'Desconhecido',
      duration: v.timestamp || '0:00',
      thumbnail: v.thumbnail || '',
      url: v.url,
    }))
    res.json(videos)
  } catch (error) {
    console.error('Erro na busca do YouTube:', error)
    res.json([])
  }
})

const httpServer = http.createServer(app)
const io = new Server(httpServer, { cors: corsOptions }) // mesma allowlist do Express acima

/** Monta o payload completo da sala (fila durável no Prisma + estado ao vivo em memória). */
async function buildRoomPayload(code) {
  const room = await roomManager.getRoom(code)
  if (!room) return null
  const state = roomManager.getLiveState(code)
  return {
    code: room.code,
    hostId: room.hostId,
    isPublic: room.isPublic,
    users: state.users,
    queue: JSON.parse(room.queueJson),
    currentSong: state.currentSong,
    chat: state.chat,
  }
}

io.on('connection', (socket) => {
  socket.data.roomCode = null
  socket.data.userId = null

  socket.on('room:create', async ({ hostName, isPublic }, callback) => {
    const hostId = 'guest_' + Math.random().toString(36).substring(2, 9)
    const code = await roomManager.createRoom(hostId, { isPublic: Boolean(isPublic) })

    socket.data.roomCode = code
    socket.data.userId = hostId
    socket.join(code)

    roomManager.addUser(code, {
      id: hostId,
      name: hostName?.trim() || 'Anfitriao',
      score: 0,
      connected: true,
    })

    callback({ room: await buildRoomPayload(code), userId: hostId })
  })

  socket.on('room:join', async ({ code, name }, callback) => {
    code = code?.toUpperCase()
    const room = await roomManager.getRoom(code)
    if (!room) return callback({ error: 'Sala nao encontrada' })

    const userId = 'guest_' + Math.random().toString(36).substring(2, 9)

    socket.data.roomCode = code
    socket.data.userId = userId
    socket.join(code)

    const state = roomManager.getLiveState(code)
    const existing = state.users.find((u) => u.id === userId)
    if (existing) {
      existing.connected = true // reconectando (ex: F5) -- nao duplica na lista
    } else {
      roomManager.addUser(code, {
        id: userId,
        name: name?.trim() || 'Convidado',
        score: 0,
        connected: true,
      })
    }

    const payloadRoom = await buildRoomPayload(code)
    callback({ room: payloadRoom, userId })
    io.to(code).emit('room:update', payloadRoom)
  })

  socket.on('queue:add', async ({ code, song, addedBy }, callback) => {
    const newSong = { id: 'song_' + Math.random().toString(36).substring(2, 9), ...song, addedBy }
    await roomManager.addToQueue(code, newSong)
    io.to(code).emit('room:update', await buildRoomPayload(code))
    callback?.({ ok: true })
  })

  socket.on('queue:remove', async ({ code, songId }, callback) => {
    await roomManager.removeFromQueue(code, songId)
    io.to(code).emit('room:update', await buildRoomPayload(code))
    callback?.({ ok: true })
  })

  // `mode`: 'solo' (padrão) ou 'coop'. Em coop, `singerIds` é a lista de quem vai cantar
  // junto — se não vier nenhuma lista, assume todo mundo conectado na sala no momento.
  socket.on('song:next', async ({ code, singerId, mode = 'solo', singerIds }, callback) => {
    const queue = await roomManager.getQueue(code)
    const nextItem = queue.shift()
    if (!nextItem) return callback?.({ error: 'Fila vazia.' })
    await roomManager.updateQueue(code, queue)

    const state = roomManager.getLiveState(code)
    const participantIds =
      mode === 'coop' ? (singerIds?.length ? singerIds : state.users.map((u) => u.id)) : [singerId]

    // `scoreAtStart` agora é um mapa { userId: placar no início } — funciona igual pra
    // solo (mapa com 1 chave) e coop (mapa com N chaves), e é o que permite calcular,
    // pra CADA participante, quantos pontos ESSA música específica rendeu.
    const scoreAtStart = {}
    for (const id of participantIds) {
      scoreAtStart[id] = state.users.find((u) => u.id === id)?.score ?? 0
    }

    const currentSong = {
      ...nextItem,
      mode,
      singerId: mode === 'solo' ? singerId : null,
      singerIds: mode === 'coop' ? participantIds : null,
      startedAt: Date.now(),
      scoreAtStart,
    }
    roomManager.setCurrentSong(code, currentSong)

    io.to(code).emit('room:update', await buildRoomPayload(code))
    io.to(code).emit('song:start', currentSong)
    callback?.({ ok: true })
  })

  socket.on('song:end', async ({ code }, callback) => {
    const state = roomManager.getLiveState(code)
    const finished = state.currentSong

    if (finished) {
      const participantIds = finished.mode === 'coop' ? finished.singerIds : [finished.singerId]
      for (const pid of participantIds) {
        const singer = state.users.find((u) => u.id === pid)
        const pointsThisSong = (singer?.score ?? 0) - (finished.scoreAtStart?.[pid] ?? 0)
        if (singer?.name && pointsThisSong > 0) {
          // Sem login: o "dono" da pontuação é o nome que a pessoa digitou ao entrar na
          // sala, não uma conta verificada — ver nota em scoreService.js/README sobre essa troca.
          recordScoreEntry({ name: singer.name, songTitle: finished.title, points: pointsThisSong, roomCode: code })
        }
      }
    }

    // Se ainda houver musicas na fila, avanca automaticamente para a proxima — o
    // auto-avanco sempre entra em modo solo (quem adicionou a música canta); pra Co-op,
    // é preciso escolher explicitamente na sala (ver StartNextForm no Room.jsx).
    const queue = await roomManager.getQueue(code)
    let nextSongData = null
    if (queue.length > 0) {
      const nextItem = queue.shift()
      await roomManager.updateQueue(code, queue)
      const singerId = nextItem.addedBy || state.users[0]?.id
      const nextSinger = state.users.find((u) => u.id === singerId)
      nextSongData = {
        ...nextItem,
        mode: 'solo',
        singerId,
        singerIds: null,
        startedAt: Date.now(),
        scoreAtStart: { [singerId]: nextSinger?.score ?? 0 },
      }
    }
    roomManager.setCurrentSong(code, nextSongData)

    io.to(code).emit('room:update', await buildRoomPayload(code))
    if (nextSongData) io.to(code).emit('song:start', nextSongData)
    else io.to(code).emit('song:ended', true)

    callback?.({ ok: true })
  })

  // Pontuacao: sem login, o placar existe só enquanto a sala está ativa (em memória) —
  // o que sobrevive de verdade é o registro por música em ScoreEntry (ver song:end acima
  // e scoreService.js), que alimenta o /api/leaderboard sem depender de conta nenhuma.
  socket.on('score:update', async ({ code, userId, delta }) => {
    roomManager.updateUserScore(code, userId, delta) // fica só no placar AO VIVO da sessão
    io.to(code).emit('room:update', await buildRoomPayload(code))
  })

  // Chat: rate limit simples por socket (máx. 5 mensagens a cada 10s) + moderação de
  // conteúdo (ver src/moderation.js) ANTES de a mensagem chegar a qualquer outra pessoa —
  // se for bloqueada, só quem tentou mandar recebe o motivo, a sala inteira nem sabe que
  // uma tentativa aconteceu.
  socket.on('chat:message', ({ code, text }, callback) => {
    const roomCode = code || socket.data.roomCode
    if (!roomCode || !socket.data.userId) return callback?.({ error: 'Você não está em uma sala.' })

    const now = Date.now()
    socket.data.chatTimestamps = (socket.data.chatTimestamps || []).filter((t) => now - t < 10_000)
    if (socket.data.chatTimestamps.length >= 5) {
      return callback?.({ error: 'Você está enviando mensagens rápido demais — espere um pouco.' })
    }

    const result = moderateMessage(text)
    if (!result.allowed) return callback?.({ error: result.reason })

    socket.data.chatTimestamps.push(now)

    const state = roomManager.getLiveState(roomCode)
    const sender = state.users.find((u) => u.id === socket.data.userId)
    const message = {
      id: 'msg_' + Math.random().toString(36).slice(2, 9),
      userId: socket.data.userId,
      name: sender?.name ?? 'Alguém',
      text: result.text,
      createdAt: now,
    }

    roomManager.addChatMessage(roomCode, message)
    io.to(roomCode).emit('chat:message', message) // incremental — não refaz o room:update inteiro
    callback?.({ ok: true })
  })

  // Saída explícita da sala (botão "Sair da sala") — diferente do disconnect abaixo:
  // aqui a pessoa é removida de vez da lista, não só marcada como desconectada.
  socket.on('room:leave', async ({ code }, callback) => {
    const roomCode = code || socket.data.roomCode
    if (roomCode && socket.data.userId) {
      roomManager.removeUser(roomCode, socket.data.userId)
      const payloadRoom = await buildRoomPayload(roomCode)
      if (payloadRoom) io.to(roomCode).emit('room:update', payloadRoom)
    }
    socket.leave(roomCode)
    socket.data.roomCode = null
    socket.data.userId = null
    callback?.({ ok: true })
  })

  socket.on('disconnect', async () => {
    const { roomCode, userId } = socket.data
    if (!roomCode || !userId) return
    roomManager.markUserConnected(roomCode, userId, false)
    const payloadRoom = await buildRoomPayload(roomCode)
    if (payloadRoom) io.to(roomCode).emit('room:update', payloadRoom)
  })
})

const PORT = process.env.PORT || 3002
httpServer.listen(PORT, () => console.log(`Backend do Sing&Friends rodando na porta ${PORT}`))