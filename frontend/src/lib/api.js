// Em dev, deixamos vazio de propósito: o proxy do vite.config.js já encaminha `/api` e
// `/socket.io` pro backend em localhost:3002, então caminho relativo funciona igual a uma
// chamada same-origin.
// Em produção, frontend e backend normalmente ficam em domínios DIFERENTES (ex: frontend
// na Vercel, backend no Render) — nesse caso é OBRIGATÓRIO apontar pra URL pública real
// do backend via VITE_API_URL (ver frontend/.env.example), ou toda chamada tentaria bater
// no próprio host estático do frontend, que não tem essas rotas.
export const API_URL = import.meta.env.VITE_API_URL || ''

/** Wrapper fino sobre fetch que sempre usa a base certa — use no lugar de fetch() cru para
 * qualquer chamada ao backend (rotas /api/...). */
export function apiFetch(path, options) {
  return fetch(`${API_URL}${path}`, options)
}
