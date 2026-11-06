import { type AuthProviders, socialProviderSchema } from "@shared/auth";
import { Hono } from "hono";
import { getAuth, socialProviders } from "../auth";
import { withDb } from "../db/middleware";
import type { AppEnv } from "../types";

/**
 * Endpoints do Better Auth em /api/auth/* (cadastro, login, logout, sessão,
 * OAuth…). Quem fala com eles é o `authClient` do front (src/lib/auth-client.ts),
 * não o cliente RPC. Lista completa: https://www.better-auth.com/docs/concepts/api
 */
export const authRoutes = new Hono<AppEnv>()
  // Rota nossa (não do Better Auth): quais formas de login mostrar na tela.
  // Vem antes do `withDb` porque não usa o banco.
  .get("/providers", (c) => {
    const enabled = socialProviders(c.env);
    const social = socialProviderSchema.options.filter((provider) => enabled[provider]);
    return c.json({ emailAndPassword: true, social } satisfies AuthProviders, 200);
  })
  .use(withDb)
  .on(["GET", "POST"], "/*", (c) => getAuth(c).handler(c.req.raw));
