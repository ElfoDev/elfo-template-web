# elfo-template-web

Template [Elfo](https://elfo.dev) de app web fullstack na Cloudflare:
front React e API Hono **no mesmo Worker**.

- **Front**: Vite, React 19, TanStack Router + Query, Tailwind CSS v4, shadcn/ui
- **API**: Hono no Cloudflare Worker (`/api/*`), cliente tipado via Hono RPC
- **Banco**: Postgres com Drizzle ORM — Neon em produção, PGlite local no dev (sem conta)
- **Auth**: Better Auth no mesmo banco — email e senha, GitHub/Google opcionais, sessão por cookie
- **Qualidade**: Biome, Vitest + Testing Library, Playwright

## Começando

Requisitos: Node 22 e pnpm (`corepack enable` usa a versão de `packageManager`).

```sh
pnpm install
cp .dev.vars.example .dev.vars
pnpm dev            # http://localhost:5173 (API em /api/health, CRUD em /projects)
```

Crie uma conta em http://localhost:5173/signup: `/projects` só abre logado, e cada usuário vê só
os próprios projetos. O login com GitHub/Google aparece quando as envs deles estão no
`.dev.vars` (veja o `.dev.vars.example`).

O `pnpm dev` não precisa de banco nem de conta: sobe um PGlite local (Postgres em WASM) em
`.wrangler/pglite` e aplica as migrations. Para usar o Neon (ex.: branch `dev`), defina
`DATABASE_URL` no `.dev.vars`.

## Comandos

```sh
pnpm check          # lint + typecheck + test (o que o CI roda)
pnpm format         # formata e organiza imports
pnpm build          # build da SPA + Worker
pnpm e2e            # Playwright (rode antes: pnpm exec playwright install chromium)
pnpm db:generate    # gera migration a partir de worker/db/schema.ts
pnpm db:migrate     # aplica migrations (PGlite local ou DATABASE_URL)
pnpm db:studio      # Drizzle Studio
```

Estrutura, convenções e o passo a passo para adicionar uma feature estão no [CLAUDE.md](./CLAUDE.md).
