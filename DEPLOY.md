# Guia de Deploy — Sing&Friends

Guia técnico de ponta a ponta pra colocar o projeto no ar 24h, sem depender de nenhuma
máquina local: **backend no Render** + **frontend na Vercel** + **Postgres na AWS RDS**
(que vocês já têm configurado). Sem sistema de login — o site é aberto, qualquer pessoa
entra digitando um nome.

Frontend e backend ficam em domínios diferentes — boa parte deste guia é sobre lidar com
isso corretamente (CORS, URL do socket, variáveis de ambiente).

## 1. Variáveis de ambiente — dev vs. produção

### Backend (`backend/.env` em dev; variáveis de ambiente do Render em produção)

| Variável | Dev (local) | Produção (Render) |
|---|---|---|
| `PORT` | `3002` | O Render injeta a própria automaticamente — o código já usa `process.env.PORT \|\| 3002`, não mexe em nada |
| `DATABASE_URL` | Connection string do seu Postgres na AWS RDS | A MESMA connection string da AWS RDS |
| `FRONTEND_URL` | `http://localhost:5173` | URL real do frontend publicado na Vercel, `https://`, sem barra no final |

**Nunca** commite `.env` (já está no `.gitignore`). Em produção, essas variáveis são
cadastradas direto no painel do Render — nenhum arquivo `.env` é enviado pro servidor.

> Nota sobre o RDS: confirme que o **Security Group** do seu banco na AWS libera conexões
> vindas da internet (ou especificamente do range de IPs do Render) na porta 5432 —
> por padrão, RDS costuma vir fechado só pra dentro da própria VPC. Sem isso, o backend no
> Render não consegue nem conectar no banco.

### Frontend (`frontend/.env` em dev; variável do build da Vercel em produção)

| Variável | Dev (local) | Produção (Vercel) |
|---|---|---|
| `VITE_API_URL` | **vazio** (usa o proxy do Vite) | URL pública `https://` do backend no Render, **sem barra no final** |

⚠️ `VITE_API_URL` é embutida no build **na hora do `npm run build`**, não em runtime —
se você mudar depois de já ter publicado, precisa rodar um novo deploy na Vercel, não só
"reiniciar" (frontend estático não tem processo pra reiniciar).

## 2. O que mudou no código do cliente pra apontar pro servidor certo

`SocketContext.jsx` já usava `io('/')` (relativo — funcionava só porque em dev o proxy do
Vite cobre isso), mas **`Room.jsx` tinha duas chamadas com `http://localhost:3002`
hardcoded** — funcionaria em dev por acaso, quebraria 100% em produção assim que o
domínio mudasse.

A correção: `frontend/src/lib/api.js`, um wrapper fino:

```js
export const API_URL = import.meta.env.VITE_API_URL || ''

export function apiFetch(path, options) {
  return fetch(`${API_URL}${path}`, options)
}
```

Todo `fetch('/api/...')` do frontend usa `apiFetch('/api/...')`, e a conexão do socket:

```js
const socket = io(API_URL || undefined)
```

**Por que isso funciona nos dois ambientes:** em dev, `VITE_API_URL` fica vazio →
caminhos relativos (o proxy do `vite.config.js` resolve) e `io(undefined)` conecta
same-origin. Em produção, `VITE_API_URL` aponta pra URL real do backend no Render → toda
chamada (REST e WebSocket) vai direto pra lá, não importa o domínio do frontend.

**Sobre WSS**: você não precisa fazer nada de especial pro Socket.io usar `wss://` — ele
decide isso sozinho a partir do protocolo da URL passada. Com
`VITE_API_URL=https://seu-backend.onrender.com`, o socket.io-client conecta via `wss://`
automaticamente. O único requisito é o backend servir HTTPS de verdade — o Render já
entrega isso de graça, com certificado automático.

## 3. CORS — Express e Socket.io

Antes: `cors()` sem opções (Express) e `{ origin: '*' }` (Socket.io) — aceitava qualquer
origem. Correção em `server.js`, uma allowlist única compartilhada entre os dois:

```js
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean)

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    callback(new Error(`Origem não permitida pelo CORS: ${origin}`))
  },
  credentials: true,
}

app.use(cors(corsOptions))
// ...
const io = new Server(httpServer, { cors: corsOptions })
```

`FRONTEND_URL` no Render deve ser a URL EXATA do frontend publicado
(`https://sing-and-friends.vercel.app`, sem barra no final). Se você usa preview deploys
da Vercel (URLs diferentes por PR), separe por vírgula:
`FRONTEND_URL=https://sing-and-friends.vercel.app,https://sing-and-friends-git-main.vercel.app`.

## 4. Passo a passo — Backend no Render

1. https://render.com → **New → Web Service** → conecte o repositório.
2. Configure:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npx prisma generate --schema=../prisma/schema.prisma`
   - **Start Command**: `npm start`
   - **Instance Type**: o free tier funciona, mas "dorme" após inatividade — o primeiro
     acesso do dia demora ~30-60s pra responder (o Socket.io "trava" nesse tempo). Se isso
     for um problema real pro seu uso, considere o plano pago mais barato (elimina o sleep).
3. Em **Environment**, adicione `DATABASE_URL` (a connection string da AWS RDS) e
   `FRONTEND_URL` — `PORT` o Render já injeta sozinho.
4. Depois do primeiro deploy, aplique o schema no banco de produção — pode ser do seu
   computador mesmo, apontando temporariamente pro `DATABASE_URL` de produção:
   ```bash
   npx prisma migrate deploy
   ```
   (`migrate deploy`, não `migrate dev` — esse último pode tentar interações que não fazem
   sentido fora do seu ambiente local. Se vocês nunca criaram uma migration formal ainda e
   só usaram `db push`, rode `npx prisma db push` contra a produção da mesma forma.)
5. Anote a URL pública gerada (ex: `https://sing-and-friends-backend.onrender.com`) — é o
   valor de `VITE_API_URL` no passo do frontend.

## 5. Passo a passo — Frontend na Vercel

1. https://vercel.com → **Add New → Project** → selecione o repositório.
2. **Root Directory**: `frontend`. Framework preset: Vite (auto-detectado).
3. Em **Environment Variables**, adicione `VITE_API_URL` com a URL do backend do passo
   anterior (sem barra no final).
4. Deploy. Anote a URL gerada (ex: `https://sing-and-friends.vercel.app`).
5. **Volte no Render** e atualize `FRONTEND_URL` com essa URL real — sem isso, o CORS
   bloqueia o frontend de conversar com o backend (comportamento esperado: a allowlist da
   seção 3 bloqueia por padrão, não libera tudo por engano).

## 6. Checklist final antes de anunciar que está no ar

- [ ] Security Group do RDS libera conexão vinda do Render (porta 5432)
- [ ] `DATABASE_URL` no Render é a mesma da AWS RDS, schema aplicado (`migrate deploy`/`db push`)
- [ ] `FRONTEND_URL` no Render bate exatamente com a URL publicada na Vercel
- [ ] `VITE_API_URL` na Vercel aponta pro backend no Render, com `https://`
- [ ] Testar criar sala → adicionar música → cantar (solo e Co-op) → placar → chat, ponta a
      ponta, direto na URL de produção (não localhost)
- [ ] Testar em 2 abas/dispositivos diferentes pra confirmar que o Socket.io sincroniza
- [ ] Se o backend estiver no free tier do Render, testar o acesso "a frio" (depois de uns
      minutos sem uso) pra saber o tempo real de cold start que seus usuários vão sentir
