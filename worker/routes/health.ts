import { type HealthResponse, healthResponseSchema } from "@shared/health";
import { Hono } from "hono";

export const healthRoutes = new Hono<{ Bindings: Env }>().get("/", (c) => {
  const body: HealthResponse = healthResponseSchema.parse({
    status: "ok",
    app: c.env.APP_NAME,
    timestamp: new Date().toISOString(),
    services: [],
  });

  return c.json(body, 200, { "Cache-Control": "no-store" });
});
