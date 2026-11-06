# CLAUDE.md

App web fullstack na Cloudflare: front React (SPA) e API Hono rodando **no mesmo Worker**.
Este arquivo é o guia para agents e pessoas que trabalham no repo.

## Stack

- **Front** (`src/`): Vite, React 19, TanStack Router (rotas por arquivo), TanStack Query,
  Tailwind CSS v4, shadcn/ui (Radix + `class-variance-authority`), toasts com `sonner`.
- **API** (`worker/`): Hono no Cloudflare Worker. Atende `/api/*`; todo o resto é a SPA servida
  como static assets (`not_found_handling: single-page-application` em `wrangler.jsonc`).
- **Compartilhado** (`shared/`): schemas zod usados pelo Worker (validação) e pelo front (tipos).
- **Cliente tipado**: Hono RPC (`hc<AppType>`) em `src/lib/api.ts`. Os tipos da resposta vêm da
  própria rota, sem codegen.
- **Dev**: `@cloudflare/vite-plugin` roda o Worker no workerd dentro do Vite, com HMR no front
  e reload do Worker.
- **Qualidade**: Biome (lint + format), Vitest (Testing Library no front, `app.request` na API),
  Playwright (smoke contra o build de produção).
- **Ferramentas**: Node 22, pnpm (versão fixa em `packageManager`), TypeScript strict.

## Comandos

| Comando           | O que faz                                                               |
| ----------------- | ----------------------------------------------------------------------- |
| `pnpm dev`        | Vite + Worker local em http://localhost:5173                            |
| `pnpm lint`       | Biome (lint + formatação + ordem de imports), sem alterar arquivos      |
| `pnpm format`     | Biome aplicando as correções seguras                                    |
| `pnpm typecheck`  | `tsc -b` em todos os projetos (app, worker, configs)                    |
| `pnpm test`       | Vitest (projetos `web` e `worker`)                                      |
| `pnpm build`      | Build da SPA + Worker em `dist/`                                        |
| `pnpm check`      | **lint + typecheck + test** — é o que agents e CI rodam                 |
| `pnpm e2e`        | Playwright: build + `vite preview` (workerd) + smoke tests              |
| `pnpm cf-typegen` | Regenera `worker/env.d.ts` e `worker/runtime.d.ts` a partir do wrangler |

Primeira vez: `pnpm install`, `cp .dev.vars.example .dev.vars` e
`pnpm exec playwright install chromium` (só para o e2e).

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
  test/                   Setup e helpers do Vitest (renderWithProviders, mockFetch)
worker/                   API (Cloudflare Worker)
  index.ts                App Hono (basePath /api), monta as rotas, exporta AppType
  routes/<nome>.ts        Um sub-app Hono por recurso (+ <nome>.test.ts)
  env.d.ts, runtime.d.ts  GERADOS por `pnpm cf-typegen` (tipos de Env e do runtime)
shared/                   Schemas zod e tipos compartilhados front ↔ API
e2e/                      Playwright smoke
```

## Convenções

- **Imports**: `@/…` → `src/`, `@shared/…` → `shared/`, `@worker/…` → `worker/`. O front só
  importa **tipos** de `worker/` (`import type { AppType } …`); nunca código de runtime.
- **Rotas da API**: sempre sob `/api`. Cada recurso é um `new Hono<{ Bindings: Env }>()` em
  `worker/routes/` encadeado em `worker/index.ts` com `.route("/recurso", rotas)`. Mantenha o
  encadeamento (`.get(...).post(...)`) — é ele que preserva os tipos do `AppType`.
- **Erros da API**: responda `{ error: string }` com o status HTTP certo (ou lance
  `HTTPException`). O front mostra `error` no toast/estado de erro via `getErrorMessage`.
- **Dados no front**: sempre TanStack Query. Defina `queryOptions` em `features/<x>/api.ts` e
  use `parseResponse(api.<rota>.$get())` (lança em respostas não-ok). Erros viram toast
  automaticamente (desligue com `meta: { silent: true }`).
- **Estados de tela**: toda tela que carrega dados cobre carregando (`LoadingState`), erro
  (`ErrorState` com `onRetry`) e vazio (`EmptyState`).
- **UI**: componentes shadcn/ui em `src/components/ui` (adicione com
  `pnpm dlx shadcn@latest add <componente>`). Estilo com classes Tailwind; `cn()` para combinar.
- **Variáveis de ambiente do Worker**: não secretas em `wrangler.jsonc → vars`; secretas em
  `.dev.vars` (local) e no Cloudflare (produção, listadas em `foreman.json → secrets`). Depois de
  mudar bindings/vars, rode `pnpm cf-typegen` e commite os `.d.ts`.
- **Textos da UI** em português (pt-BR). Código (nomes) em inglês.
- **Formatação**: deixe o Biome decidir (`pnpm format`). Não desative regras sem comentário
  explicando o motivo.

## Como adicionar uma feature de ponta a ponta

Exemplo: listar "projetos".

1. **Schema** — `shared/projects.ts`:

   ```ts
   export const projectSchema = z.object({ id: z.string(), name: z.string().min(1) });
   export const createProjectSchema = projectSchema.pick({ name: true });
   export type Project = z.infer<typeof projectSchema>;
   ```
2. **Rota da API** — `worker/routes/projects.ts`, exportando `projectRoutes = new Hono<{ Bindings: Env }>().get("/", …).post("/", …)`.
   Valide entrada com o schema (`createProjectSchema.safeParse(await c.req.json())` → 400 com
   `{ error }` se inválido). Monte em `worker/index.ts`: `.route("/projects", projectRoutes)`.
3. **Teste da API** — `worker/routes/projects.test.ts` com
   `app.request("/api/projects", { method: "POST", body: JSON.stringify(…) }, env)`. Cubra o caminho
   feliz e os erros (400/404).
4. **Cliente** — `src/features/projects/api.ts`: `queryOptions({ queryKey: ["projects"], queryFn: () => parseResponse(api.projects.$get()) })`.
   Para escrita, `useMutation` + `queryClient.invalidateQueries({ queryKey: ["projects"] })`.
5. **Tela** — `src/routes/projects.tsx` com `createFileRoute("/projects")` (o `routeTree.gen.ts`
   é regenerado pelo `pnpm dev`/`pnpm build`), componentes em `src/features/projects/`, os três
   estados (loading/erro/vazio) e o link na navegação (`src/components/layout/app-header.tsx`).
6. **Testes do front** — `src/features/projects/*.test.tsx` com `renderWithProviders` e
   `mockFetch` (veja `src/features/health/health-status.test.tsx`). Se o fluxo for crítico, um
   caso no `e2e/`.
7. `pnpm check` verde (e `pnpm e2e` se mexeu em fluxo coberto).

## Regras

- **Nunca commite secrets.** `.dev.vars` e `.env*` estão no `.gitignore`; documente variáveis
  novas em `.dev.vars.example` com valor de exemplo.
- **Migrations sempre geradas e commitadas** (`pnpm db:generate`, a partir do WEB-2). Nunca edite
  uma migration já aplicada; gere outra.
- **Mantenha `pnpm check` verde.** Não pule, desative ou apague testes para fazer passar.
- Não edite arquivos gerados (`src/routeTree.gen.ts`, `worker/env.d.ts`, `worker/runtime.d.ts`);
  regenere-os.
- Dependências novas: versões estáveis, adicionadas com `pnpm add` (o lockfile vai junto no
  commit).
