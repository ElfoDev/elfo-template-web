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

## Deploy

Cloudflare Workers (front e API no mesmo Worker) com Postgres no Neon. Pelo Elfo não tem passo
manual:

1. No board do projeto no [Elfo](https://elfo.dev), abra **Settings → Deploy** e conecte a
   Cloudflare e o Neon. O Elfo grava os secrets do GitHub Actions (Cloudflare, Neon e
   `BETTER_AUTH_SECRET`) e **dispara o primeiro deploy sozinho**.
2. O app sobe em `https://<repositório>.<sua-conta>.workers.dev`, com login funcionando (o
   Better Auth usa a URL de cada request, não precisa configurar `BETTER_AUTH_URL`). A URL
   aparece no board e no resumo do workflow **Deploy**.

Daí em diante, todo merge publica (`.github/workflows/deploy.yml`): `pnpm check` → build →
migrations → `wrangler deploy` com os secrets → smoke test (página, `/api/health` com o banco e o
login).

| Branch               | Ambiente         | Worker                  | Banco (Neon)                                                                             |
| -------------------- | ---------------- | ----------------------- | ---------------------------------------------------------------------------------------- |
| `production`         | `production`     | `<repositório>`         | branch padrão do projeto                                                                 |
| `staging` (opcional) | `staging`        | `<repositório>-staging` | branch `staging`, criada no 1º deploy (cópia da padrão)                                  |
| PR aberto (preview)  | `preview-pr-<n>` | `<repositório>-pr-<n>`  | branch `preview/pr-<n>`, criada no 1º deploy do PR (cópia da `staging`, senão da padrão) |

- **Staging** é opcional: marque "Staging" ao criar o board no Elfo (ele cria a branch `staging`
  e os agents abrem PRs para ela). Ir para produção = um PR de `staging` (ou só do card) para
  `production`. Sem a branch `staging`, só existe produção.
- **Nome do Worker**: o do repositório, ou a variável `CLOUDFLARE_WORKER_NAME` (Settings →
  Secrets and variables → Actions → Variables).
- **Preview de cada PR** (`.github/workflows/preview.yml`): todo PR para `production` ou
  `staging` ganha o próprio app, em `https://<repositório>-pr-<n>.<sua-conta>.workers.dev`, com
  banco próprio (a branch `preview/pr-<n>` do Neon, com as migrations do PR). A URL aparece num
  comentário do PR (atualizado a cada push) e no card do Elfo. Fechar ou mergear o PR apaga o
  Worker e a branch do Neon.
- **Custo dos previews**: um Worker e uma branch do Neon (com um compute, que suspende sem uso)
  por PR aberto, apagados quando o PR fecha. O plano do Neon limita quantas branches o projeto
  pode ter (e as horas de compute): com muitos PRs abertos ao mesmo tempo, o deploy do preview
  falha dizendo isso; feche PRs antigos ou apague branches `preview/pr-*` que sobraram. Os
  previews precisam de `NEON_API_KEY` e `NEON_PROJECT_ID` (o Elfo grava ao conectar o Neon); sem
  eles, o preview é pulado e o PR recebe um comentário dizendo o que conectar. PRs de fork e do
  Dependabot não têm preview.
- **Secrets do app**: os listados em `foreman.json → secrets` (e passados pelo nome em
  `.github/workflows/deploy.yml` e `preview.yml`) vão para o Worker a cada deploy (os opcionais,
  como o OAuth, só se estiverem gravados no repositório). Um secret do environment `staging` no
  GitHub (Settings → Environments) vale só para o staging; os previews usam os do repositório.
- **Banco do staging e dos previews**: a branch `staging` do Neon nasce como cópia da produção, e
  a de cada preview como cópia do staging (sem staging, da produção), inclusive os usuários. Para
  recomeçar, apague a branch no Neon; o próximo deploy (ou push no PR) cria outra.

### Domínio próprio

1. O domínio precisa estar na mesma conta da Cloudflare.
2. Em `wrangler.jsonc`, descomente `routes` com o seu domínio:
   `"routes": [{ "pattern": "app.minhaempresa.com.br", "custom_domain": true }]`, e faça o merge
   em `production`. O staging ignora `routes` e continua no workers.dev.
3. Login: nada a fazer (cada domínio usa a própria origem). Para GitHub/Google, cadastre o callback
   `https://<domínio>/api/auth/callback/<github|google>` no app OAuth.

Se o deploy falhar por permissão no domínio, o token da Cloudflare precisa de acesso à zona
(Zone → Workers Routes: Edit). Alternativa: adicione o domínio no painel (Workers & Pages →
o Worker → Settings → Domains & Routes); o deploy não remove domínios adicionados por lá.

Estrutura, convenções e o passo a passo para adicionar uma feature estão no [CLAUDE.md](./CLAUDE.md).
