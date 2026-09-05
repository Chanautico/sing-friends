// Import via default + destructuring: o cliente gerado pelo Prisma é CommonJS, e o Node
// não consegue analisar estaticamente named exports de módulos CJS em todos os casos —
// `import { PrismaClient } from '@prisma/client'` falha em runtime com
// "SyntaxError: Named export 'PrismaClient' not found", mesmo com o pacote instalado
// certinho. Esta é a forma que o próprio Node recomenda pra contornar isso.
import pkg from '@prisma/client'
const { PrismaClient } = pkg

const prisma = new PrismaClient()

export default prisma