import prisma from './db.js'

/**
 * Registra quantos pontos uma "atuação" fez numa música — sem login, então quem recebe
 * o crédito é o NOME que a pessoa digitou ao entrar na sala, não uma conta verificada.
 * Isso é uma escolha deliberada (o site é público, sem cadastro): o ranking vira uma
 * brincadeira entre quem usa os mesmos nomes combinados, não uma identidade confiável —
 * qualquer um pode digitar "Ana" e herdar o placar de quem jogou como "Ana" antes.
 * "Fire and forget" de propósito: não queremos que uma escrita no banco atrase o
 * broadcast em tempo real da pontuação pra sala inteira — se falhar, só loga o erro.
 */
export async function recordScoreEntry({ name, songTitle, points, roomCode }) {
  if (!name || !points || points <= 0) return
  try {
    await prisma.scoreEntry.create({ data: { name, songTitle, points, roomCode } })
  } catch (err) {
    console.error('[recordScoreEntry]', err)
  }
}
