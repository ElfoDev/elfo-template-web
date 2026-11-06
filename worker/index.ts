import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { healthRoutes } from "./routes/health";

/**
 * Toda a API vive em /api/*. O resto é a SPA (static assets, ver wrangler.jsonc).
 * Novas rotas: crie worker/routes/<nome>.ts e encadeie com `.route(...)` abaixo —
 * o encadeamento é o que mantém o `AppType` (e o cliente RPC) tipado.
 */
const app = new Hono<{ Bindings: Env }>().basePath("/api").route("/health", healthRoutes);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

export type AppType = typeof app;
export default app;
