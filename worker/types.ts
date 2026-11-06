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
  };
}
