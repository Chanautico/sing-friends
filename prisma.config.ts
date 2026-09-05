import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// ATENÇÃO: antes desta correção, a URL do banco estava fixa aqui ('file:./dev.db'),
// ignorando o DATABASE_URL do .env — ou seja, `prisma migrate`/`db push` sempre mexiam no
// SQLite local, mesmo com um Postgres de produção configurado no .env. Agora lê do
// ambiente de verdade, então local e produção usam o banco certo automaticamente.
export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
})
