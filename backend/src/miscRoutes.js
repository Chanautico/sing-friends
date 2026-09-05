import { Router } from 'express'
import prisma from './db.js'

const router = Router()

/**
 * GET /api/leaderboard — ranking global, somando os pontos de todas as atuações por
 * NOME (sem login — ver nota em scoreService.js). Usa groupBy porque não existe mais
 * uma tabela de usuários com um totalScore pronto pra consultar.
 */
router.get('/leaderboard', async (_req, res) => {
  const grouped = await prisma.scoreEntry.groupBy({
    by: ['name'],
    _sum: { points: true },
    orderBy: { _sum: { points: 'desc' } },
    take: 20,
  })

  res.json(grouped.map((g) => ({ name: g.name, totalScore: g._sum.points ?? 0 })))
})

/**
 * GET /api/rooms/public — salas marcadas como públicas na criação, mais recentes primeiro.
 * Não filtra por "tem gente conectada agora" (isso é estado ao vivo em memória, não no banco) —
 * uma sala pública listada pode já ter esvaziado; ver README para essa limitação conhecida.
 */
router.get('/rooms/public', async (_req, res) => {
  const rooms = await prisma.room.findMany({
    where: { isPublic: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { code: true, hostId: true, createdAt: true },
  })
  res.json(rooms)
})

export default router
