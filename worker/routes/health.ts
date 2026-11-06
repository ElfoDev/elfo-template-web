import { type HealthResponse, healthResponseSchema, type ServiceHealth } from "@shared/health";
import { sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { runAfterResponse } from "../db/middleware";
import type { AppEnv } from "../types";

export const healthRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const services = [await checkDatabase(c)];

  const body: HealthResponse = healthResponseSchema.parse({
    status: services.every((service) => service.status === "ok") ? "ok" : "degraded",
    app: c.env.APP_NAME,
    timestamp: new Date().toISOString(),
    services,
  });

  return c.json(body, 200, { "Cache-Control": "no-store" });
});

/** `SELECT 1` no banco. Falha (ou banco não configurado) vira status "down". */
async function checkDatabase(c: Context<AppEnv>): Promise<ServiceHealth> {
  const started = Date.now();
  try {
    const connection = c.var.connectDb(c.env);
    try {
      await connection.db.execute(sql`select 1`);
    } finally {
      runAfterResponse(c, connection.close());
    }
    return { name: "database", status: "ok", latencyMs: Date.now() - started };
  } catch (error) {
    console.error("health: database check failed", error);
    return { name: "database", status: "down" };
  }
}
