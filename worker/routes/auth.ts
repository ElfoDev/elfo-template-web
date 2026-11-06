import { Hono } from "hono";
import { getAuth } from "../auth";
import { withDb } from "../db/middleware";
import type { AppEnv } from "../types";

/**
 * Endpoints do Better Auth em /api/auth/* (cadastro, login, logout, sessão,
 * OAuth…). Quem fala com eles é o `authClient` do front (src/lib/auth-client.ts),
 * não o cliente RPC. Lista completa: https://www.better-auth.com/docs/concepts/api
 */
export const authRoutes = new Hono<AppEnv>()
  .use(withDb)
  .on(["GET", "POST"], "/*", (c) => getAuth(c).handler(c.req.raw));
