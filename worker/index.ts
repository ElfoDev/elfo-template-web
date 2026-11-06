import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { connectFromEnv } from "./db/middleware";
import { authRoutes } from "./routes/auth";
import { healthRoutes } from "./routes/health";
import { projectRoutes } from "./routes/projects";
import type { AppEnv, ConnectDb } from "./types";

export interface AppOptions {
  /** Como abrir a conexão com o banco. Padrão: `DATABASE_URL` (Neon). Testes passam PGlite. */
  connectDb?: ConnectDb;
}

/**
 * Toda a API vive em /api/*. O resto é a SPA (static assets, ver wrangler.jsonc).
 * Novas rotas: crie worker/routes/<nome>.ts e encadeie com `.route(...)` abaixo —
 * o encadeamento é o que mantém o `AppType` (e o cliente RPC) tipado.
 */
export function createApp({ connectDb = connectFromEnv }: AppOptions = {}) {
  const app = new Hono<AppEnv>()
    .basePath("/api")
    .use(async (c, next) => {
      c.set("connectDb", connectDb);
      await next();
    })
    .route("/auth", authRoutes)
    .route("/health", healthRoutes)
    .route("/projects", projectRoutes);

  app.notFound((c) => c.json({ error: "Not found" }, 404));

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status);
    }
    console.error(err);
    return c.json({ error: "Internal server error" }, 500);
  });

  return app;
}

const app = createApp();

export type AppType = typeof app;
export default app;
