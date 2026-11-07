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
- **Auth** (`worker/auth.ts`): [Better Auth](https://www.better-auth.com) com adapter Drizzle no
  mesmo Postgres, endpoints em `/api/auth/*` e sessão por cookie. Email + senha sempre ligado;
  GitHub e Google ligam sozinhos quando as envs existem. Middleware `requireUser` na API; no front,
  cliente do Better Auth + TanStack Query e rotas protegidas no TanStack Router.
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
    _authenticated.tsx    Guard: tudo em _authenticated/ exige login (→ /login?redirect=…)
    login, signup, logout Páginas de entrar, criar conta e sair
  routeTree.gen.ts        GERADO pelo plugin do router (commitado; não editar)
  features/<feature>/     Código de uma feature: api.ts (queryOptions), componentes, testes
  components/ui/          Componentes shadcn/ui (copiados, podem ser editados)
  components/layout/      Header, navegação
  components/states.tsx   LoadingState / ErrorState / EmptyState
  lib/api.ts              Cliente Hono RPC + getErrorMessage
  lib/auth-client.ts      Cliente do Better Auth (use via features/auth/api.ts)
  lib/query-client.ts     QueryClient com toasts de erro globais
  test/                   Setup e helpers do Vitest (renderWithProviders, renderRoute, mockFetch)
worker/                   API (Cloudflare Worker)
  index.ts                createApp() (basePath /api), monta as rotas, exporta AppType
  types.ts                AppEnv: Bindings (Env) + Variables (db, user, session…) do Hono
  auth.ts                 Config do Better Auth (createAuth), getAuth(c) e requireUser
  email.ts                sendEmail(): ponto para plugar um provedor de email
  routes/<nome>.ts        Um sub-app Hono por recurso (+ <nome>.test.ts)
  routes/auth.ts          /api/auth/* → Better Auth (+ GET /api/auth/providers)
  db/schema.ts            Tabelas do Drizzle (fonte das migrations)
  db/client.ts            Conexão Neon por request (connectNeon) + tipo Database
  db/middleware.ts        withDb (abre/fecha a conexão em c.var.db) e connectFromEnv
  test/db.ts              createTestDb(): PGlite em memória + migrations + app de teste
  test/auth.ts            signUp(app): cria usuário e devolve o cookie da sessão
  env.d.ts, runtime.d.ts  GERADOS por `pnpm cf-typegen` (tipos de Env e do runtime)
drizzle/                  Migrations SQL + meta/ (GERADAS por `pnpm db:generate`; commitadas)
drizzle.config.ts         Config do drizzle-kit (escolhe o banco, ver "Banco de dados")
scripts/local-db.ts       PGlite local do dev (servidor TCP + proxy WebSocket para o Worker)
shared/                   Schemas zod e tipos compartilhados front ↔ API
e2e/                      Playwright (smoke, auth, CRUD de projetos)
.github/workflows/        ci.yml (PRs e pushes), deploy.yml (production/staging), foreman.yml (Elfo)
.github/scripts/          Passos do deploy: secrets, nome do Worker, Neon, wrangler, smoke test
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
- **Rotas que exigem login**: `.use(withDb, requireUser)` e `c.var.user` nos handlers. Dados de
  usuário têm coluna `userId` e **toda** query filtra por `c.var.user.id` (inclusive update/delete);
  recurso de outro usuário responde 404, como se não existisse. Veja "Autenticação" abaixo.
- **Erros da API**: responda `{ error: string }` com o status HTTP certo (ou lance
  `HTTPException`). O front mostra `error` no toast/estado de erro via `getErrorMessage`.
- **Dados no front**: sempre TanStack Query. Defina `queryOptions` em `features/<x>/api.ts` e
  use `parseResponse(api.<rota>.$get())` (lança em respostas não-ok). Erros viram toast
  automaticamente (desligue com `meta: { silent: true }`).
- **Estados de tela**: toda tela que carrega dados cobre carregando (`LoadingState`), erro
  (`ErrorState` com `onRetry`) e vazio (`EmptyState`).
- **Telas que exigem login**: crie o arquivo dentro de `src/routes/_authenticated/` (a URL não
  muda: `_authenticated/projects/index.tsx` é `/projects`; o id da rota é
  `/_authenticated/projects/`). Quem está logado: `useQuery(sessionQueryOptions())`.
- **UI**: componentes shadcn/ui em `src/components/ui` (adicione com
  `pnpm dlx shadcn@latest add <componente>`). Confira o resultado: o CLI às vezes escreve
  `import { cn } from "cn"` e adiciona o pacote `cn` — troque por `@/lib/utils`, rode
  `pnpm remove cn` e `pnpm format`. Estilo com classes Tailwind; `cn()` para combinar.
- **Variáveis de ambiente do Worker**: não secretas em `wrangler.jsonc → vars`; secretas em
  `.dev.vars` (local) e nos secrets do GitHub Actions, que o deploy grava no Worker (as listadas
  em `foreman.json → secrets`, mais a `DATABASE_URL`; ver "Deploy"). Todo
  secret **obrigatório** também vai em `wrangler.jsonc → secrets.required`: é de lá que o
  `cf-typegen` tira o tipo, e **o wrangler só carrega do `.dev.vars` os secrets declarados ali**
  (e as `vars`). Depois de mudar bindings/vars/secrets, rode `pnpm cf-typegen` e commite os `.d.ts`.
- **Secrets opcionais** (ex.: OAuth): **não** vão em `secrets.required` (o `wrangler deploy`
  falha se faltar algum de lá). Declare o tipo em `worker/types.ts` (`interface Env`, campo
  opcional), adicione o nome em `OPTIONAL_SECRETS` no `vite.config.ts` (é ele que os passa do
  `.dev.vars` para o Worker no `pnpm dev`) e liste em `foreman.json → secrets` com
  `"optional": true`.
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
   `projectRoutes = new Hono<AppEnv>().use(withDb, requireUser).get("/", …).post("/", jsonBody(createProjectSchema), …)`.
   Converta a linha do banco para o contrato (`toProject`: datas em ISO). Responda 404
   `{ error }` quando não existir. Monte em `createApp()`: `.route("/projects", projectRoutes)`.
4. **Teste da API** — `worker/routes/projects.test.ts`: `createTestDb()` no `beforeAll`,
   `reset()` + `signUp(testDb.app)` no `beforeEach` e
   `testDb.app.request("/api/projects", { method: "POST", headers: { Cookie: user.cookie }, … }, testEnv)`.
   Roda contra PGlite em memória com as migrations reais. Cubra o caminho feliz e os erros (400/404).
5. **Cliente** — `src/features/projects/api.ts`: `queryOptions` (lista e detalhe) e hooks de
   mutation (`useMutation` + `invalidateQueries({ queryKey: ["projects"] })`).
6. **Telas** — `src/routes/_authenticated/projects/index.tsx` (lista), `new.tsx` (criar),
   `$projectId.tsx` (editar/apagar); componentes em `src/features/projects/`; os três estados
   (loading/erro/vazio) e o link na navegação (`src/components/layout/app-header.tsx`). O
   `routeTree.gen.ts` é regenerado pelo `pnpm dev`/`pnpm build`.
7. **Testes do front** — `src/features/projects/projects.test.tsx`: `renderRoute("/projects")`
   renderiza o app inteiro (rotas reais) e um `fetch` falso responde a API. Para componentes
   isolados, `renderWithProviders` + `mockFetch` (veja `src/features/health/`). Fluxo crítico:
   um caso no `e2e/` (veja `e2e/projects.spec.ts`).
   Rotas protegidas: `renderRoute` já entra logado (`makeSession()`); passe
   `{ session: null }` para testar deslogado. No e2e, `signUpViaApi` (`e2e/helpers.ts`) loga o
   navegador com um usuário novo.
8. **Dono** — se o recurso é de um usuário (quase sempre): coluna `userId` com FK para `users`,
   `.use(withDb, requireUser)` na rota e o filtro por `c.var.user.id` em toda query; nos testes,
   `signUp(testDb.app)` para ter o cookie e um caso com dois usuários (veja "autorização" em
   `worker/routes/projects.test.ts`). Telas em `src/routes/_authenticated/`.
9. `pnpm check` verde (e `pnpm e2e` se mexeu em fluxo coberto).

## Autenticação

### Como funciona

- **Better Auth** (`worker/auth.ts` → `createAuth`) com o adapter Drizzle no mesmo banco. Tabelas
  `users`, `sessions`, `accounts` (uma por forma de login; a senha fica aqui, com hash scrypt) e
  `verifications` (mais `rate_limits`, os contadores do rate limit) em `worker/db/schema.ts`. Ids
  são texto gerado pelo Better Auth.
- A instância é **por request** (a conexão do banco também é): `getAuth(c)` cria na primeira
  chamada, depois do `withDb`. Não guarde em escopo de módulo.
- Endpoints em `/api/auth/*` (`worker/routes/auth.ts`): `sign-up/email`, `sign-in/email`,
  `sign-out`, `get-session`, `sign-in/social`, `callback/<provider>`… Mais
  `GET /api/auth/providers` (nosso), que diz ao front quais botões sociais mostrar.
- **Sessão por cookie** `httpOnly` (`better-auth.session_token`; `__Secure-` em HTTPS), assinado
  com `BETTER_AUTH_SECRET`. Front e API na mesma origem: o cookie vai sozinho, sem CORS.
- **`requireUser`** lê a sessão do cookie; sem sessão responde 401 `{ error }`; com sessão expõe
  `c.var.user` e `c.var.session`.
- **Front**: `authClient` (`src/lib/auth-client.ts`) embrulhado em TanStack Query em
  `src/features/auth/api.ts`: `sessionQueryOptions()` é a fonte de verdade (guard e menu leem dela)
  e `useSignIn`/`useSignUp`/`useSignOut` limpam o cache ao trocar de usuário. Um 401 de qualquer
  query zera a sessão no cache e o guard manda para `/login?redirect=…` (`safeRedirect` em
  `shared/auth.ts` só aceita caminhos internos).

### Configuração

| Variável                                                | Onde                        | Obrigatória | Para quê                                        |
| ------------------------------------------------------- | --------------------------- | ----------- | ----------------------------------------------- |
| `BETTER_AUTH_SECRET`                                    | secret (`secrets.required`) | produção    | Assina os cookies. Elfo gera (`generate: true`) |
| `BETTER_AUTH_URL`                                       | `wrangler.jsonc → vars`     | não         | URL fixa; vazia (padrão) = origem do request    |
| `OAUTH_GITHUB_CLIENT_ID` / `OAUTH_GITHUB_CLIENT_SECRET` | secret opcional             | não         | Liga o login com GitHub (precisa dos dois)      |
| `OAUTH_GOOGLE_CLIENT_ID` / `OAUTH_GOOGLE_CLIENT_SECRET` | secret opcional             | não         | Liga o login com Google (precisa dos dois)      |

- **URL do app**: com `BETTER_AUTH_URL` vazia, a URL base do Better Auth é a origem de cada
  request, e a origem do próprio request é sempre confiável (`trustedOrigins`). Por isso o
  primeiro deploy funciona no `*.workers.dev`, o staging no `<nome>-staging.*.workers.dev` e um
  domínio próprio, sem configurar nada. `BETTER_AUTH_URL` vale para production **e** staging:
  deixe vazia, a não ser que precise de uma URL fixa nos links de email/callbacks.
- **Dev/preview/e2e**: sem `BETTER_AUTH_SECRET` no `.dev.vars`, o `vite.config.ts` usa uma chave
  fixa só de desenvolvimento (nunca vai para o build). Em produção, sem o secret, `/api/auth/*`
  e as rotas protegidas respondem 503.
- **OAuth**: callback URL = `<origem>/api/auth/callback/github` (ou `/google`). Um app OAuth por
  ambiente (localhost e produção têm URLs diferentes). Onde criar: descrições em `foreman.json`
  e comentários em `.dev.vars.example`. Os nomes levam o prefixo `OAUTH_` porque o Elfo não
  aceita secrets que começam com `GITHUB_` (reservado do GitHub Actions): **não** declare
  `GITHUB_*` em `foreman.json`.

### Segurança: vínculo de contas e rate limit

- **Sem vínculo automático por email com conta não verificada** (_account pre-hijacking_): alguém
  cadastra email + senha com o email da vítima, sem provar que é dele, e espera a vítima entrar com
  GitHub/Google; se o login social fosse vinculado àquela conta, o atacante seguiria dono dela pela
  senha. Em `createAuth` (`account.accountLinking`) o vínculo implícito só vale se o email da
  conta local **já foi verificado** (`requireLocalEmailVerified: true`, sem `trustedProviders`) e,
  enquanto `REQUIRE_EMAIL_VERIFICATION = false`, fica desligado (`disableImplicitLinking`). Efeito:
  quem tem conta com senha e tenta entrar com um provedor cujo email é o mesmo recebe
  `account_not_linked` na volta do OAuth; para usar os dois, entra com a senha e vincula o provedor
  logado (`authClient.linkSocial`). Ao ligar a verificação de email, o vínculo passa a funcionar para
  contas verificadas. Não afrouxe essas opções sem rever o risco. Teste do cenário: "login social"
  em `worker/routes/auth.test.ts`.
- **Rate limit no banco**: `rateLimit: { enabled: true, storage: "database" }` (tabela
  `rate_limits`, migration em `drizzle/`). A memória (padrão do Better Auth) é por isolate e não
  limita nada no Workers, e o Better Auth só liga o limite sozinho com `NODE_ENV=production`, que
  o Worker não define: por isso é explícito. Padrão: 100 requests/10s por rota e 3/10s em
  `sign-in`/`sign-up`/`change-*` (429 com `X-Retry-After`). O IP vem de `cf-connecting-ip`
  (`advanced.ipAddress`): a borda da Cloudflare o sobrescreve, então não dá para forjar. Nos
  testes, `authRequest` (`worker/test/auth.ts`) usa um IP novo a cada chamada; no e2e, o `test` de
  `e2e/helpers.ts` faz o mesmo por teste. Quem não passa pela Cloudflare (ex.: `pnpm preview`)
  aceita o header de qualquer cliente.
- **Senha**: mínimo de 8 e máximo de 128 caracteres (`PASSWORD_MIN_LENGTH`/`PASSWORD_MAX_LENGTH`
  em `shared/auth.ts`, aplicados no formulário e no Better Auth).

### Verificação de email

Desligada por padrão (`REQUIRE_EMAIL_VERIFICATION = false` em `worker/auth.ts`), mas o hook já
está ligado: o Better Auth chama `sendVerificationEmail` → `sendEmail()` em `worker/email.ts`, que
por enquanto só registra o link no log. Para ativar: implemente `sendEmail` com um provedor
(Resend, Postmark, SES…; a API key vira um secret novo), mude a constante para `true` e trate o
erro `EMAIL_NOT_VERIFIED` no login (a mensagem já está em `src/features/auth/api.ts`).

### Mudando o Better Auth

Plugins e opções que adicionam campos/tabelas (2FA, organizações, username…) exigem o mesmo campo
em `worker/db/schema.ts` (nomes em camelCase no TS, snake_case no banco, tabelas no plural) e uma
migration (`pnpm db:generate`). Confira os campos esperados na doc do plugin. Teste os fluxos com
`signUp`/`authRequest` de `worker/test/auth.ts`.

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
`.wrangler/pglite/data` direto (com o dev parado). Em production e staging, o deploy roda
`pnpm db:migrate` na conexão direta **antes** de publicar o Worker novo; se o deploy falhar
depois disso, o banco fica com o schema novo e o código velho. Por isso as migrations precisam ser
compatíveis com a versão anterior (adicionar antes de remover; renomear/apagar num PR seguinte).

### Projetos sem dono (`projects.user_id` nullable)

A migration que introduziu a autenticação **não apaga dados**: `projects.user_id` nasceu
_nullable_. Projetos criados antes do login ficam com `user_id` nulo; como toda query filtra por
`user_id` do usuário logado, eles simplesmente não aparecem para ninguém (continuam no banco). Para
apertar a coluna para `NOT NULL` depois:

1. Decida o destino de cada linha órfã: atribua a um usuário
   (`UPDATE projects SET user_id = '<id do usuário>' WHERE user_id IS NULL;`) ou apague
   (`DELETE FROM projects WHERE user_id IS NULL;`). Confira antes com
   `SELECT count(*) FROM projects WHERE user_id IS NULL;`.
2. Em `worker/db/schema.ts`, volte a `.notNull()` em `projects.userId` e rode
   `pnpm db:generate --name projects_user_id_not_null` (gera `ALTER COLUMN ... SET NOT NULL`).
3. Aplique o passo 1 **antes** da migration nova (no mesmo deploy, ou à mão no banco): com linhas
   nulas ela falha. Se quiser tudo na migration, adicione o `UPDATE`/`DELETE` no início do SQL
   gerado, antes de ser aplicada em qualquer banco.

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

## Deploy

Cloudflare Workers + Neon, por `.github/workflows/deploy.yml` (passos em `.github/scripts/`).

- **Branches**: `production` publica produção (environment `production`, Worker `<nome>`, branch
  padrão do Neon). `staging`, se existir, publica staging (environment `staging`, Worker
  `<nome>-staging`, branch `staging` do Neon, criada pela API no primeiro deploy a partir da
  padrão). Com `staging`, abra PRs para `staging`; produção recebe PRs de promoção. Sem ela, PRs
  vão direto para `production`.
- **Cada deploy**: confere os secrets → `pnpm check` → `pnpm build` → migrations
  (`pnpm db:migrate` na conexão direta) → `wrangler deploy --secrets-file` (código e secrets na
  mesma versão) → smoke test (`/`, `/api/health` com o banco `ok`, e um login inválido em
  `/api/auth/sign-in/email` que precisa dar 401). Um deploy por ambiente de cada vez.
- **Secrets** (gravados pelo Elfo no repositório): `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL` + `DATABASE_URL_POOLED` (produção: direta para
  migrations, com pooling para o app), `NEON_API_KEY` + `NEON_PROJECT_ID` (staging) e os do app.
  O Worker recebe os de `foreman.json → secrets` que existirem no repositório e a `DATABASE_URL`
  com pooling do ambiente. Secret novo do app: declare em `foreman.json → secrets` (nunca
  `CLOUDFLARE_*`, `NEON_*`, `DATABASE_URL*` nem `GITHUB_*`), não precisa mexer no workflow.
  Secrets do environment do GitHub (`staging` ou `production`) sobrepõem os do repositório com o
  mesmo nome: use para um `BETTER_AUTH_SECRET` ou um app OAuth só do staging.
- **Dados do staging**: a branch `staging` do Neon nasce como cópia da padrão (schema, histórico
  de migrations e dados, inclusive usuários e sessões). Para recomeçar, apague a branch no Neon: o
  próximo deploy de staging cria outra a partir da produção.
- **`/api/health`** é o que o smoke test usa: se mudar a rota, mantenha `status: "ok"` quando o
  banco responde, ou ajuste `.github/scripts/smoke-test.sh`.
- **Domínio próprio**: `routes` em `wrangler.jsonc` (só produção; o deploy de staging tira as
  `routes`). `workers_dev` fica `true`: o smoke test usa a URL do workers.dev.
- Nunca imprima connection strings ou secrets nos workflows; as URLs do Neon que não vêm de
  `secrets` são mascaradas (`::add-mask::`) e ficam em arquivos no `$RUNNER_TEMP`.

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
