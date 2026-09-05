# Sing&Friends — V1.0 (Beta)

Karaokê online multiplayer, sem cadastro: qualquer pessoa entra digitando só um nome.
Salas em tempo real (Socket.io), músicas via busca integrada no YouTube com letra
sincronizada automática (LRCLIB), pontuação por presença vocal (solo ou Co-op), chat com
moderação básica, ranking global e salas públicas.

## Arquitetura

```
sing-and-friends/
  backend/               Node.js + Express + Socket.io — salas, fila, letras, chat
  frontend/              React + Vite + Tailwind — telas, player (react-player)
  prisma/schema.prisma   Modelo de dados (PostgreSQL): ScoreEntry, Room
```

Banco: **PostgreSQL** (hoje rodando na AWS RDS). O Prisma lê a connection string de
`DATABASE_URL` — no CLI (`prisma generate`/`db push`), de `prisma/.env`; no processo do
servidor (`node server.js`), de `backend/.env` (são arquivos diferentes, veja a seção 2).

## 1. Configurar o banco (Prisma)

Na raiz do projeto:

```bash
npm install
npx prisma generate
npx prisma db push
```

`prisma/.env` precisa ter `DATABASE_URL` apontando pro seu Postgres da AWS RDS. **Atenção
se você já tinha o schema antigo (com o model `User`) rodando contra esse banco**: `db
push` vai **apagar a tabela `User`** pra aplicar a remoção do login — é o esperado agora
que não há mais cadastro, mas confirme que não tem nada nela que você precise antes.

## 2. Rodar o backend

```bash
cd backend
cp .env.example .env   # preencha DATABASE_URL (mesma do prisma/.env) e FRONTEND_URL
npm install
npm run dev
```

Sobe em `http://localhost:3002` — teste com `curl http://localhost:3002/api/health`.

## 3. Rodar o frontend

Em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

Abre em `http://localhost:5173`.

## 4. Testar o fluxo completo

1. No lobby, digite um nome e **Criar sala** (marque "sala pública" se quiser que apareça
   pra qualquer um) — você recebe um código de 6 letras. Sem login: o nome é só o que
   identifica você nesta sessão.
2. Em outra aba/dispositivo: **Entrar em sala** com o código, ou clique numa das "Salas
   públicas ativas" listadas no lobby.
3. **+ adicionar** música: pesquise pelo nome → escolha um resultado na lista → o backend
   busca a letra sincronizada na LRCLIB automaticamente.
4. Escolha **Solo** ou **Co-op** (quem canta junto) → **Iniciar**. Quem canta clica
   **Ativar microfone e começar**.
5. A pontuação sobe em tempo real; ao fim da música, aparece o placar. Os pontos dessa
   atuação ficam gravados no banco associados ao NOME que você digitou (não a uma conta —
   ver seção 5) e alimentam o **🏆 Ranking global** do lobby.
6. Use o chat da sala pra conversar — mensagens com palavrão, link ou flood são
   bloqueadas antes de chegar a qualquer outra pessoa (só quem tentou mandar vê o motivo).

> **HTTPS e microfone:** `getUserMedia` só funciona em contexto seguro — `localhost`
> funciona sem problema; testar no celular via IP puro (`http://192.168...`) pode ser
> bloqueado. Pra testar no celular de verdade, publique o projeto e acesse via `https://`.

## 5. O que foi implementado nesta etapa (e o que ficou pra próxima)

### ✅ Feito nesta etapa

- **Rebranding**: título, cabeçalhos e metadados para "Sing&Friends".
- **Ranking global**: `GET /api/leaderboard`, tela `/leaderboard` no frontend.
- **Salas públicas**: checkbox ao criar sala + listagem no lobby (`GET /api/rooms/public`).
- **Sem URLs fixas de localhost**: `PORT` via variável de ambiente já existia; o frontend
  tinha `http://localhost:3002` **hardcoded** dentro do `SocketContext.jsx` (bypassando o
  proxy do Vite que já existia pra isso) — corrigido para usar `/` e o proxy em dev, sem
  nada pra trocar manualmente no deploy.
- **🐛 Bug crítico corrigido**: o servidor reconstruía a lista de usuários da sala do zero
  a cada evento (`room:join` mandava `users: [currentUser]`, `queue:add`/`song:next`
  mandavam `users: []`) — cada broadcast apagava quem já estava na tela dos outros
  participantes, e a pontuação nunca acumulava de verdade porque também era lida de um
  campo que não existia no modelo `Room` do Prisma. Corrigido separando o que é **durável**
  (fila de músicas → Prisma) do que é **estado ao vivo** (usuários conectados, música
  tocando → memória, ver `backend/src/roomManager.js`), sempre reconstruindo o payload
  completo (`buildRoomPayload`) antes de cada broadcast.

### 🗑️ Autenticação removida por completo

O projeto teve, em algum momento, registro/login com senha (bcrypt+JWT) e login social
real com Google e Apple. **Isso foi todo removido** — decisão do produto: o site é aberto,
sem cadastro, qualquer pessoa entra digitando só um nome. `backend/src/auth.js`,
`backend/src/socialAuth.js`, `frontend/src/components/Auth.jsx` e
`frontend/src/context/AuthContext.jsx` não existem mais.

Consequência direta no banco: o model `User` saiu do `prisma/schema.prisma`, e
`ScoreEntry` (que registra os pontos de cada música cantada, alimentando o ranking global)
passou a guardar o **nome digitado** em vez de uma referência a uma conta. Isso significa
que o ranking global agora é "por nome", não "por pessoa verificada" — duas pessoas usando
o mesmo nome dividem o mesmo lugar no ranking. Ver `backend/src/scoreService.js` pra mais
detalhes dessa troca.

**Se você já tinha o schema antigo rodando contra o Postgres da AWS RDS**: `npx prisma db
push` (ou `migrate`) vai **apagar a tabela `User`** pra aplicar essa mudança — qualquer
conta que existisse lá se perde. Isso é esperado dado que vocês estão abandonando login,
mas vale rodar isso conscientemente, não sem querer.

### ✅ Modo Co-op — implementado

Ao "Iniciar" a próxima música (`Room.jsx`), o grupo escolhe **Solo** ou **Co-op**. Em
Co-op, marque quem vai cantar junto — todo mundo marcado ativa o próprio microfone e
canta ao mesmo tempo, com pontuação individual (cada um no seu ritmo) e um placar
coletivo da música somando os pontos de todos os participantes. `scoreAtStart` no
servidor virou um mapa por usuário (em vez de um número único), o que é o que permite
calcular, pra cada pessoa, quantos pontos ELA ganhou nesta música específica — funciona
igual pra solo (mapa com 1 pessoa) e coop (mapa com N).

Detalhe técnico que vale saber: em Co-op, várias pessoas têm o player rodando ao mesmo
tempo, então várias avisariam o servidor "a música acabou" simultaneamente se eu deixasse
— isso faria a fila avançar mais de uma música de uma vez. Resolvido designando um
"cantor primário" (o primeiro da lista) como o único que de fato aciona o avanço da fila;
todo mundo continua cantando e pontuando normalmente.

### ✅ Chat com moderação — implementado

Chat em tempo real na tela da sala (`Chat.jsx`), com histórico das últimas 50 mensagens
guardado em memória por sala. Moderação em `backend/src/moderation.js`:
- Filtro básico de palavrões comuns em português (normaliza acento/maiúscula antes de comparar)
- Bloqueio de links (reduz spam/phishing)
- Bloqueio de flood de caracteres repetidos
- Rate limit de 5 mensagens a cada 10 segundos por conexão

**Importante**: esse filtro cobre spam e linguagem inadequada do dia a dia, mas **não** é
uma solução de moderação contra discurso de ódio ou conteúdo ilegal — isso exigiria um
serviço de moderação de verdade (ex: Perspective API do Google, endpoint de moderação da
OpenAI). Se isso for importante pro seu público, me avise que integro um desses.

### ⏭️ Ainda não implementado

Nenhum item pendente no momento — ver seções abaixo pelo que foi entregue nesta rodada.

### ✅ Personalização de tema — implementado

4 temas (Neon, Sunset, Ocean, Mono), aplicados via `data-theme` no `<html>` e variáveis CSS
(`--accent-primary`/`--accent-secondary`, ver `index.css`) — todos os componentes usam
essas variáveis em vez de cor fixa, então trocar o tema muda o app inteiro na hora, sem
recarregar a página. Acessível pelo botão **🎨 Personalizar** no lobby. Sem conta de
usuário, o tema escolhido fica salvo só no `localStorage` do navegador — cada dispositivo
escolhe o seu.

### ✅ Botão "Sair da sala" — implementado

No cabeçalho da tela da sala (`Room.jsx`), ao lado do código — remove a pessoa da lista
de usuários (evento `room:leave`) e volta pro lobby. Diferente de um F5/fechar aba sem
querer (que só marca como desconectado, permitindo voltar depois com o mesmo nome), sair
pelo botão é definitivo: a pessoa some da sala pra sempre, e teria que entrar de novo.

## 6. Bugs reais encontrados testando de verdade (não só lendo o código)

Desta vez o zip enviado veio com `node_modules` já instalado, o que permitiu ir além da
leitura manual: validei a sintaxe de **todo** o frontend com o parser real do Babel
(`@babel/parser`) e tentei subir o backend de verdade (com um `DATABASE_URL` fake, já que
não há Postgres neste sandbox). Isso pegou dois bugs que `node --check` sozinho nunca
acusaria, porque são erros de resolução de módulo/referência, não de sintaxe:

1. **`backend/src/db.js` quebrava ao subir o servidor**: `import { PrismaClient } from
   '@prisma/client'` falhava com `SyntaxError: Named export 'PrismaClient' not found` — o
   client gerado pelo Prisma é CommonJS, e o Node nem sempre analisa named exports de CJS
   corretamente. Corrigido para `import pkg from '@prisma/client'; const { PrismaClient }
   = pkg`.
2. **`frontend/src/components/Room.jsx` usava `removeFromQueue`** (no botão ✕ de cada
   item da fila) **sem desestruturar essa função do `useKaraokeSocket()`** — quebraria com
   `ReferenceError` ao clicar. Corrigido.

Também notei que a rota `/room/:code/add` (`AddSong.jsx`) ficou órfã — a busca de música
migrou pra um modal inline dentro do `Room.jsx` (`SearchSongModal`), e nada mais navega
pra `/add`. Não apaguei o arquivo (baixo risco deixar aí), só fica registrado caso vocês
queiram limpar depois.

## 7. Limitações conhecidas

- A listagem de "salas públicas" não verifica se ainda tem gente conectada — pode mostrar
  uma sala que já esvaziou (o estado de presença é em memória, não persistido).
- Ranking global é por **nome digitado**, não por conta verificada — duas pessoas com o
  mesmo nome dividem posição no ranking (consequência direta de não ter mais login).
- **Não consegui rodar `vite build`/`prisma generate` de ponta a ponta neste ambiente** —
  o `node_modules` enviado tem binários nativos (esbuild, rollup, Query Engine do Prisma)
  compilados pra Windows; este sandbox é Linux e sem acesso à internet pra baixar os
  equivalentes. Rode `npm install` no seu ambiente (resolve os binários certos pra sua
  plataforma) e **`npx prisma generate` de novo** depois de puxar essas mudanças — o
  client que estava gerado no zip é da versão ANTERIOR do schema (ainda tinha `User`),
  então está desatualizado mesmo além do problema de plataforma.

## 8. Deploy

Guia técnico completo (variáveis de ambiente, CORS, passo a passo) em
**[`DEPLOY.md`](./DEPLOY.md)** — atualizado pra Render (backend) + Vercel (frontend), que
é a combinação que vocês decidiram usar.
