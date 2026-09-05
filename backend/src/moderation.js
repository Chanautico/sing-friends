// Filtro BÁSICO de chat: palavrões comuns em português, spam de links e flood de
// caracteres repetidos. NÃO é uma lista de slurs/discurso de ódio — cobrir isso direito
// exige um serviço de moderação de verdade (ex: Perspective API do Google, ou a endpoint
// de moderação da OpenAI), não uma lista fixa de palavras no código. Trate isto como a
// higiene básica de um MVP, não como a solução final de moderação.

const BASIC_PROFANITY = [
  'porra', 'caralho', 'merda', 'puta', 'putz', 'fodase', 'foda-se', 'cacete',
  'desgraca', 'arrombado', 'arrombada', 'corno', 'cuzao', 'bosta',
]

const URL_REGEX = /(https?:\/\/|www\.)\S+/i
const REPEATED_CHAR_REGEX = /(.)\1{9,}/ // ex: "aaaaaaaaaaaa" — flood clássico
const MAX_LENGTH = 300

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos, pra "É" e "e" baterem igual
}

/**
 * Retorna { allowed: true, text } se a mensagem passar, ou { allowed: false, reason }
 * com uma explicação curta pro remetente (só ele vê o motivo — a mensagem nunca chega
 * a ser enviada pra sala se for bloqueada).
 */
export function moderateMessage(rawText) {
  const text = (rawText ?? '').trim()

  if (!text) return { allowed: false, reason: 'Mensagem vazia.' }
  if (text.length > MAX_LENGTH) return { allowed: false, reason: `Mensagem muito longa (máx. ${MAX_LENGTH} caracteres).` }
  if (URL_REGEX.test(text)) return { allowed: false, reason: 'Links não são permitidos no chat.' }
  if (REPEATED_CHAR_REGEX.test(text)) return { allowed: false, reason: 'Muitos caracteres repetidos.' }

  const normalized = normalize(text)
  const hasProfanity = BASIC_PROFANITY.some((word) => normalized.includes(normalize(word)))
  if (hasProfanity) return { allowed: false, reason: 'Mensagem contém linguagem inadequada.' }

  return { allowed: true, text }
}
