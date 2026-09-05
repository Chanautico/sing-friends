import prisma from './db.js'

// BUG CORRIGIDO NESTA VERSAO: antes, cada evento (join, queue:add, score:update...) montava
// `users` do zero na hora (as vezes `[currentUser]`, as vezes `[]`), porque o modelo Room do
// Prisma nunca teve um campo pra guardar os usuarios -- entao cada broadcast de room:update
// apagava quem ja estava na tela dos outros participantes.
//
// A sala tem duas partes bem diferentes:
//  - o que e DURAVEL (sobrevive a reinicios do servidor): a fila de musicas -- fica no Prisma.
//  - o que e AO VIVO (existe so enquanto a sala esta ativa): quem esta conectado agora, com
//    que pontuacao NESTA sessao, e qual musica esta tocando -- fica em memoria aqui.
// Pontuacao de CONTA (User.totalScore) e outra coisa: essa sim e persistida no Prisma sempre
// que o usuario esta autenticado (ver scoreService.js), entao ela sobrevive tanto a um F5
// quanto a um restart do servidor -- so o estado "ao vivo" da sala (lista de presenca) e que
// nao precisaria sobreviver a um restart mesmo (ninguem fica conectado a um servidor caido).
const liveRooms = new Map() // code -> { users: [{id, name, score, connected}], currentSong, lastActivity }

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sem O/0/I/1, pra evitar confusao ao ditar em voz alta
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function getLiveState(code) {
  if (!liveRooms.has(code)) {
    liveRooms.set(code, { users: [], currentSong: null, chat: [], lastActivity: Date.now() })
  }
  const state = liveRooms.get(code)
  state.lastActivity = Date.now() // Atualiza a atividade recente da sala sempre que acessada
  return state
}

export const roomManager = {
  async createRoom(hostId, { isPublic = false } = {}) {
    let code
    do {
      code = generateRoomCode()
      // eslint-disable-next-line no-await-in-loop
    } while (await prisma.room.findUnique({ where: { code } }))

    await prisma.room.create({ data: { code, hostId, queueJson: '[]', isPublic } })
    liveRooms.set(code, { users: [], currentSong: null, chat: [], lastActivity: Date.now() })
    return code
  },

  async getRoom(code) {
    return prisma.room.findUnique({ where: { code } })
  },

  async getQueue(code) {
    const state = getLiveState(code)
    state.lastActivity = Date.now()
    const room = await this.getRoom(code)
    return room ? JSON.parse(room.queueJson) : []
  },

  async addToQueue(code, song) {
    const state = getLiveState(code)
    state.lastActivity = Date.now()
    const queue = await this.getQueue(code)
    queue.push(song)
    await prisma.room.update({ where: { code }, data: { queueJson: JSON.stringify(queue) } })
    return queue
  },

  async removeFromQueue(code, songId) {
    const state = getLiveState(code)
    state.lastActivity = Date.now()
    let queue = await this.getQueue(code)
    queue = queue.filter((song) => song.id !== songId)
    await prisma.room.update({ where: { code }, data: { queueJson: JSON.stringify(queue) } })
    return queue
  },

  async updateQueue(code, newQueue) {
    const state = getLiveState(code)
    state.lastActivity = Date.now()
    await prisma.room.update({ where: { code }, data: { queueJson: JSON.stringify(newQueue) } })
    return newQueue
  },

  // ---------- estado ao vivo (em memoria) ----------

  getLiveState(code) {
    return getLiveState(code)
  },

  addUser(code, user) {
    const state = getLiveState(code)
    state.lastActivity = Date.now()

    // Procura se já existe alguém com o mesmo nome na sala, pra evitar duplicar ao dar F5
    // (sem login, o nome digitado é a única forma de reconhecer "a mesma pessoa voltando").
    const existingIndex = state.users.findIndex(
      (u) => u.name && user.name && u.name.trim().toLowerCase() === user.name.trim().toLowerCase()
    )

    if (existingIndex !== -1) {
      // Atualiza os dados do usuário mantendo a pontuação atual e o status conectado
      state.users[existingIndex] = {
        ...state.users[existingIndex],
        ...user,
        score: state.users[existingIndex].score || user.score || 0,
        connected: true,
      }
    } else {
      state.users.push(user)
    }

    return state
  },

  markUserConnected(code, userId, connected) {
    const state = getLiveState(code)
    state.lastActivity = Date.now()
    const user = state.users.find((u) => u.id === userId)
    if (user) user.connected = connected
    return state
  },

  // Saída EXPLÍCITA (botão "Sair da sala") — diferente de markUserConnected, que só marca
  // connected:false pra permitir reconexão (ex: a pessoa atualizou a página sem querer).
  // Aqui o usuário some da lista de vez.
  removeUser(code, userId) {
    const state = getLiveState(code)
    state.lastActivity = Date.now()
    state.users = state.users.filter((u) => u.id !== userId)
    return state
  },

  updateUserScore(code, userId, delta) {
    const state = getLiveState(code)
    state.lastActivity = Date.now()
    const user = state.users.find((u) => u.id === userId)
    if (user) user.score = (user.score || 0) + delta
    return state
  },

  setCurrentSong(code, currentSong) {
    const state = getLiveState(code)
    state.lastActivity = Date.now()
    state.currentSong = currentSong
    return state
  },

  addChatMessage(code, message) {
    const state = getLiveState(code)
    state.lastActivity = Date.now()
    state.chat.push(message)
    if (state.chat.length > 50) state.chat.shift() // mantém só o histórico recente em memória
    return state
  },
}

// Limpa salas públicas ou privadas abandonadas após 15 minutos sem ninguém ativo ou sem interação
setInterval(async () => {
  const now = Date.now()
  const FIFTEEN_MINUTES = 15 * 60 * 1000

  for (const [code, state] of liveRooms) {
    const allDisconnected = state.users.length === 0 || state.users.every((u) => !u.connected)
    const inactiveTime = now - (state.lastActivity || now)
    
    // Deleta se todos estiverem desconectados OU se passaram mais de 15 minutos sem nenhuma atividade/interação
    if (allDisconnected || inactiveTime > FIFTEEN_MINUTES) {
      // Remove do cache de memória
      liveRooms.delete(code)

      // Remove do banco de dados para não acumular salas públicas fantasmas
      try {
        await prisma.room.delete({ where: { code } }).catch(() => {})
      } catch (e) {
        // Ignora caso a sala já tenha sido apagada
      }
    }
  }
}, 5 * 60 * 1000) // Roda a verificação a cada 5 minutos