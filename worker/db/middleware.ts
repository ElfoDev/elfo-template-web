import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppEnv, ConnectDb } from "../types";
import { connectNeon } from "./client";

/** Conexão padrão: Neon (ou o PGlite local do `pnpm dev`) via `DATABASE_URL`. */
export const connectFromEnv: ConnectDb = (env) => {
  if (!env.DATABASE_URL) {
    throw new HTTPException(503, {
      message: "Banco de dados não configurado: defina DATABASE_URL.",
    });
  }
  return connectNeon(env.DATABASE_URL);
};

/**
 * Abre a conexão do request em `c.var.db` e fecha no fim. Use nas rotas que
 * acessam o banco: `new Hono<AppEnv>().use(withDb).get(…)`.
 */
export const withDb = createMiddleware<AppEnv>(async (c, next) => {
  const connection = c.var.connectDb(c.env);
  c.set("db", connection.db);
  try {
    await next();
  } finally {
    runAfterResponse(c, connection.close());
  }
});

/** `waitUntil` quando há ExecutionContext (no Worker); nos testes, só aguarda. */
export function runAfterResponse(c: Context, promise: Promise<unknown>) {
  const settled = promise.catch((error: unknown) => console.error("db close failed", error));
  try {
    c.executionCtx.waitUntil(settled);
  } catch {
    // Sem ExecutionContext (ex.: `app.request` nos testes).
  }
}
