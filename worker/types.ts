import type { Auth, AuthSession, AuthUser } from "./auth";
import type { Database, DbConnection } from "./db/client";

/** Abre a conexão com o banco para um request. Trocado nos testes (PGlite). */
export type ConnectDb = (env: Env) => DbConnection;

/**
 * Tipo do contexto Hono usado por todas as rotas:
 * `new Hono<AppEnv>()` / `createMiddleware<AppEnv>(…)`.
 */
export interface AppEnv {
  Bindings: Env;
  Variables: {
    connectDb: ConnectDb;
    /** Disponível nas rotas que usam o middleware `withDb`. */
    db: Database;
    /** Better Auth do request. Use `getAuth(c)` (cria na primeira chamada). */
    auth?: Auth;
    /** Usuário logado: disponível nas rotas que usam o middleware `requireUser`. */
    user: AuthUser;
    /** Sessão do usuário logado (`requireUser`). */
    session: AuthSession;
  };
}

declare global {
  /**
   * Secrets opcionais (OAuth). Ficam fora de `wrangler.jsonc → secrets.required`
   * de propósito: lá o deploy falharia sem eles. Por isso o `cf-typegen` não os
   * conhece e o tipo é declarado aqui; no `pnpm dev`, o vite.config.ts os lê do
   * `.dev.vars`. Em produção, chegam como secrets do Worker (Foreman/`wrangler secret put`).
   */
  interface Env {
    OAUTH_GITHUB_CLIENT_ID?: string;
    OAUTH_GITHUB_CLIENT_SECRET?: string;
    OAUTH_GOOGLE_CLIENT_ID?: string;
    OAUTH_GOOGLE_CLIENT_SECRET?: string;
  }
}
