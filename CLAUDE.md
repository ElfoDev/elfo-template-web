# CLAUDE.md

App web fullstack na Cloudflare: front React (SPA) e API Hono rodando **no mesmo Worker**.
Este arquivo é o guia para agents e pessoas que trabalham no repo.

## Stack

- **Front** (`src/`): Vite, React 19, TanStack Router (rotas por arquivo), TanStack Query,
  Tailwind CSS v4, shadcn/ui (Radix + `class-variance-authority`), toasts com `sonner`.
- **API** (`worker/`): Hono no Cloudflare Worker. Atende `/api/*`; todo o resto é a SPA servida
  como static assets (`not_found_handling: single-page-application` em `wrangler.jsonc`).
- **Banco** (`worker/db/`): Postgres com Drizzle ORM. Produção: Neon via
  `@neondatabase/serverless` (WebSocket), uma conexão por request. Dev: PGlite local (Postgres em
  WASM), sem conta em lugar nenhum. Migrations em `drizzle/`, geradas pelo drizzle-kit.
- **Compartilhado** (`shared/`): schemas zod usados pelo Worker (validação) e pelo front (tipos).
- **Cliente tipado**: Hono RPC (`hc<AppType>`) em `src/lib/api.ts`. Os tipos da resposta vêm da
  própria rota, sem codegen.
- **Dev**: `@cloudflare/vite-plugin` roda o Worker no workerd dentro do Vite, com HMR no front
  e reload do Worker.
- **Qualidade**: Biome (lint + format), Vitest (Testing Library no front, `app.request` + PGlite
  em memória na API), Playwright (smoke + CRUD contra o build de produção).
- **Ferramentas**: Node 22, pnpm (versão fixa em `packageManager`), TypeScript strict.

## Comandos

| Comando            | O que faz                                                               |
| ------------------ | ----------------------------------------------------------------------- |
| `pnpm dev`         | Vite + Worker local em http://localhost:5173                            |
| `pnpm lint`        | Biome (lint + formatação + ordem de imports), sem alterar arquivos      |
| `pnpm format`      | Biome aplicando as correções seguras                                    |
| `pnpm typecheck`   | `tsc -b` em todos os projetos (app, worker, configs)                    |
| `pnpm test`        | Vitest (projetos `web` e `worker`)                                      |
| `pnpm build`       | Build da SPA + Worker em `dist/`                                        |
| `pnpm check`       | **lint + typecheck + test** — é o que agents e CI rodam                 |
| `pnpm e2e`         | Playwright: build + `vite preview` (workerd) + smoke tests              |
| `pnpm cf-typegen`  | Regenera `worker/env.d.ts` e `worker/runtime.d.ts` a partir do wrangler |
| `pnpm db:generate` | Gera a migration SQL em `drizzle/` a partir de `worker/db/schema.ts`    |
| `pnpm db:migrate`  | Aplica as migrations pendentes (PGlite local ou `DATABASE_URL`)         |
| `pnpm db:studio`   | Drizzle Studio (navegar/editar dados) no mesmo banco do `db:migrate`    |

Primeira vez: `pnpm install`, `cp .dev.vars.example .dev.vars` e
`pnpm exec playwright install chromium` (só para o e2e). Não precisa de banco: o `pnpm dev`
sobe um PGlite local e aplica as migrations sozinho.

## Estrutura

```
src/                      Front (SPA)
  main.tsx                Bootstrap: QueryClient + Router
  router.tsx              createRouter + registro de tipos
  routes/                 Rotas por arquivo (TanStack Router). __root.tsx = layout
  routeTree.gen.ts        GERADO pelo plugin do router (commitado; não editar)
  features/<feature>/     Código de uma feature: api.ts (queryOptions), componentes, testes
  components/ui/          Componentes shadcn/ui (copiados, podem ser editados)
  components/layout/      Header, navegação
  components/states.tsx   LoadingState / ErrorState / EmptyState
  lib/api.ts              Cliente Hono RPC + getErrorMessage
  lib/query-client.ts     QueryClient com toasts de erro globais
  test/                   Setup e helpers do Vitest (renderWithProviders, renderRoute, mockFetch)
worker/                   API (Cloudflare Worker)
  index.ts                createApp() (basePath /api), monta as rotas, exporta AppType
  types.ts                AppEnv: Bindings (Env) + Variables (db, connectDb) do Hono
  routes/<nome>.ts        Um sub-app Hono por recurso (+ <nome>.test.ts)
  db/schema.ts            Tabelas do Drizzle (fonte das migrations)
  db/client.ts            Conexão Neon por request (connectNeon) + tipo Database
  db/middleware.ts        withDb (abre/fecha a conexão em c.var.db) e connectFromEnv
  test/db.ts              createTestDb(): PGlite em memória + migrations + app de teste
  env.d.ts, runtime.d.ts  GERADOS por `pnpm cf-typegen` (tipos de Env e do runtime)
drizzle/                  Migrations SQL + meta/ (GERADAS por `pnpm db:generate`; commitadas)
drizzle.config.ts         Config do drizzle-kit (escolhe o banco, ver "Banco de dados")
scripts/local-db.ts       PGlite local do dev (servidor TCP + proxy WebSocket para o Worker)
shared/                   Schemas zod e tipos compartilhados front ↔ API
e2e/                      Playwright (smoke + CRUD de projetos)
```

## Convenções

- **Imports**: `@/…` → `src/`, `@shared/…` → `shared/`, `@worker/…` → `worker/`. O front só
  importa **tipos** de `worker/` (`import type { AppType } …`); nunca código de runtime.
- **Rotas da API**: sempre sob `/api`. Cada recurso é um `new Hono<AppEnv>()` em
  `worker/routes/` encadeado em `createApp()` (`worker/index.ts`) com `.route("/recurso", rotas)`.
  Mantenha o encadeamento (`.use(...).get(...).post(...)`) — é ele que preserva os tipos do
  `AppType`.
- **Validação**: `zValidator("json", schema, hook)` (`@hono/zod-validator`) com o schema de
  `shared/`; o hook responde 400 `{ error }` com a primeira mensagem do zod (veja `jsonBody` em
  `worker/routes/projects.ts`). Assim o cliente RPC também fica tipado na entrada.
- **Banco nas rotas**: `.use(withDb)` no sub-app e `c.var.db` nos handlers (Drizzle). Nunca crie
  conexão em escopo de módulo: no Worker a conexão é por request (o `withDb` fecha no fim).
- **Erros da API**: responda `{ error: string }` com o status HTTP certo (ou lance
  `HTTPException`). O front mostra `error` no toast/estado de erro via `getErrorMessage`.
- **Dados no front**: sempre TanStack Query. Defina `queryOptions` em `features/<x>/api.ts` e
  use `parseResponse(api.<rota>.$get())` (lança em respostas não-ok). Erros viram toast
  automaticamente (desligue com `meta: { silent: true }`).
- **Estados de tela**: toda tela que carrega dados cobre carregando (`LoadingState`), erro
  (`ErrorState` com `onRetry`) e vazio (`EmptyState`).
- **UI**: componentes shadcn/ui em `src/components/ui` (adicione com
  `pnpm dlx shadcn@latest add <componente>`). Confira o resultado: o CLI às vezes escreve
  `import { cn } from "cn"` e adiciona o pacote `cn` — troque por `@/lib/utils`, rode
  `pnpm remove cn` e `pnpm format`. Estilo com classes Tailwind; `cn()` para combinar.
- **Variáveis de ambiente do Worker**: não secretas em `wrangler.jsonc → vars`; secretas em
  `.dev.vars` (local) e no Cloudflare (produção, listadas em `foreman.json → secrets`). Todo
  secret também vai em `wrangler.jsonc → secrets.required`: é de lá que o `cf-typegen` tira o
  tipo, e **o wrangler só carrega do `.dev.vars` os secrets declarados ali** (e as `vars`).
  Depois de mudar bindings/vars/secrets, rode `pnpm cf-typegen` e commite os `.d.ts`.
- **Textos da UI** em português (pt-BR). Código (nomes) em inglês.
- **Formatação**: deixe o Biome decidir (`pnpm format`). Não desative regras sem comentário
  explicando o motivo.

## Como adicionar uma feature de ponta a ponta

O recurso "projects" é o exemplo completo: siga os mesmos arquivos para um recurso novo.

1. **Tabela** — em `worker/db/schema.ts` (`pgTable(...)`) e `pnpm db:generate --name <descricao>`
   (veja "Como mudar o schema" abaixo).
2. **Contrato** — `shared/projects.ts`: `projectSchema` (resposta), `createProjectSchema` e
   `updateProjectSchema` (entrada, com mensagens em pt-BR) e os tipos inferidos.
3. **Rota da API** — `worker/routes/projects.ts`:
   `projectRoutes = new Hono<AppEnv>().use(withDb).get("/", …).post("/", jsonBody(createProjectSchema), …)`.
   Converta a linha do banco para o contrato (`toProject`: datas em ISO). Responda 404
   `{ error }` quando não existir. Monte em `createApp()`: `.route("/projects", projectRoutes)`.
4. **Teste da API** — `worker/routes/projects.test.ts`: `createTestDb()` no `beforeAll`,
   `reset()` no `beforeEach` e `testDb.app.request("/api/projects", { method: "POST", … }, testEnv)`.
   Roda contra PGlite em memória com as migrations reais. Cubra o caminho feliz e os erros (400/404).
5. **Cliente** — `src/features/projects/api.ts`: `queryOptions` (lista e detalhe) e hooks de
   mutation (`useMutation` + `invalidateQueries({ queryKey: ["projects"] })`).
6. **Telas** — `src/routes/projects/index.tsx` (lista), `new.tsx` (criar), `$projectId.tsx`
   (editar/apagar); componentes em `src/features/projects/`; os três estados
   (loading/erro/vazio) e o link na navegação (`src/components/layout/app-header.tsx`). O
   `routeTree.gen.ts` é regenerado pelo `pnpm dev`/`pnpm build`.
7. **Testes do front** — `src/features/projects/projects.test.tsx`: `renderRoute("/projects")`
   renderiza o app inteiro (rotas reais) e um `fetch` falso responde a API. Para componentes
   isolados, `renderWithProviders` + `mockFetch` (veja `src/features/health/`). Fluxo crítico:
   um caso no `e2e/` (veja `e2e/projects.spec.ts`).
8. `pnpm check` verde (e `pnpm e2e` se mexeu em fluxo coberto).

## Banco de dados

### Como funciona

- **Produção**: `DATABASE_URL` (secret no Cloudflare) aponta para o Neon. O Worker usa
  `drizzle-orm/neon-serverless` com um `Pool` por request (`connectNeon` em `worker/db/client.ts`);
  o `withDb` encerra o pool com `waitUntil` no fim do request.
- **Dev sem conta** (padrão): sem `DATABASE_URL` no `.dev.vars`, o `pnpm dev` sobe um PGlite
  persistido em `.wrangler/pglite/data`, aplica as migrations pendentes e passa a URL para o
  Worker. Como o driver do Neon fala Postgres sobre WebSocket, `scripts/local-db.ts` expõe o
  PGlite em uma porta TCP (para drizzle-kit/psql; a URL aparece no terminal) e um proxy
  WebSocket → TCP (para o Worker). Para zerar o banco local: pare o dev e apague `.wrangler/pglite`.
- **Dev com Neon**: coloque `DATABASE_URL` no `.dev.vars` (ex.: a branch `dev` do Neon) e o
  `pnpm dev` usa ela. Nunca aponte para o banco de produção.
- **Preview/e2e** (`pnpm preview`, `pnpm e2e`): PGlite **em memória**, novo a cada execução.
- **Testes** (`pnpm test`): `createTestDb()` (`worker/test/db.ts`) cria um PGlite em memória por
  arquivo de teste com as migrations de `drizzle/` aplicadas e injeta no app via
  `createApp({ connectDb })`. Sem rede, sem Docker.
- `GET /api/health` faz `select 1` e mostra o banco em `services` ("database").

### Como mudar o schema

1. Edite `worker/db/schema.ts` (nova tabela, coluna, índice…).
2. `pnpm db:generate --name <o_que_mudou>` → cria `drizzle/NNNN_<o_que_mudou>.sql` e atualiza
   `drizzle/meta/`. Revise o SQL gerado.
3. `pnpm db:migrate` aplica no banco do dev (ou reinicie o `pnpm dev`, que aplica ao subir). Os
   testes já usam a migration nova automaticamente.
4. Atualize os schemas de `shared/`, as rotas e os testes; `pnpm check`.
5. Commite o schema **e** os arquivos de `drizzle/` juntos.

Para onde o drizzle-kit (`db:migrate`, `db:studio`) aponta, em ordem (`drizzle.config.ts`):
`DATABASE_URL` do ambiente/`.dev.vars` → o PGlite do `pnpm dev` aberto (via TCP) → o diretório
`.wrangler/pglite/data` direto (com o dev parado). Migrations em produção: rode
`DATABASE_URL=<url> pnpm db:migrate` (ou no pipeline de deploy) **antes** de publicar o código
que depende delas, e prefira mudanças compatíveis com a versão anterior (adicionar antes de remover).

### Hyperdrive (opcional)

O padrão (driver do Neon por WebSocket, conexão por request) não precisa de nada além da
`DATABASE_URL`. O [Hyperdrive](https://developers.cloudflare.com/hyperdrive/) mantém um pool de
conexões perto do banco e pode cachear leituras; vale a pena quando cada request faz muitas
queries ou a latência até o Neon pesa. Para ativar:

1. `pnpm wrangler hyperdrive create <nome> --connection-string="<url do Neon>"` e descomente o
   binding `hyperdrive` em `wrangler.jsonc` com o id gerado; `pnpm cf-typegen`.
2. O Hyperdrive fala Postgres por TCP, não WebSocket: em `worker/db/client.ts` use
   `drizzle-orm/node-postgres` com `pg` (`pnpm add pg`) e
   `new Pool({ connectionString: env.HYPERDRIVE.connectionString })`, ainda por request.
3. No dev, aponte o binding para o PGlite com `localConnectionString` no binding (ou a variável
   `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`) usando a URL TCP mostrada pelo
   `pnpm dev`. A porta é aleatória; fixe com `LOCAL_DB_PORT=5433 pnpm dev`.
4. Os testes não mudam (usam `createApp({ connectDb })` com PGlite).

## Regras

- **Nunca commite secrets.** `.dev.vars` e `.env*` estão no `.gitignore`; documente variáveis
  novas em `.dev.vars.example` com valor de exemplo.
- **Migrations sempre geradas e commitadas** (`pnpm db:generate`). Nunca edite uma migration já
  aplicada nem os arquivos de `drizzle/meta/`; gere outra.
- **Mantenha `pnpm check` verde.** Não pule, desative ou apague testes para fazer passar.
- Não edite arquivos gerados (`src/routeTree.gen.ts`, `worker/env.d.ts`, `worker/runtime.d.ts`);
  regenere-os.
- Dependências novas: versões estáveis, adicionadas com `pnpm add` (o lockfile vai junto no
  commit).
