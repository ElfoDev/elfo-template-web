import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Database } from "./db/client";
import * as schema from "./db/schema";
import { sendEmail } from "./email";
import type { AppEnv } from "./types";

/**
 * Exigir email verificado para entrar. Desligado por padrão porque ainda não há
 * provedor de email (worker/email.ts só registra no log). Depois de plugar um
 * provedor, mude para `true`: o cadastro passa a mandar o link de verificação e
 * o login só funciona com o email confirmado.
 */
const REQUIRE_EMAIL_VERIFICATION = false;

export const PASSWORD_MIN_LENGTH = 8;

/** Provedores OAuth ativos: cada um liga só se as duas envs existirem. */
export function socialProviders(env: Env) {
  return {
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }
      : {}),
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {}),
  };
}

/**
 * Better Auth com o banco do request. No Worker a conexão é por request (ver
 * `withDb`), então a instância também é: não guarde em escopo de módulo.
 *
 * `baseURL`: `BETTER_AUTH_URL` se definida; senão, a origem do próprio request
 * (serve para dev, preview e o domínio *.workers.dev sem configurar nada).
 */
export function createAuth({ db, env, baseURL }: { db: Database; env: Env; baseURL: string }) {
  if (!env.BETTER_AUTH_SECRET) {
    throw new HTTPException(503, {
      message: "Autenticação não configurada: defina BETTER_AUTH_SECRET.",
    });
  }

  return betterAuth({
    appName: env.APP_NAME,
    baseURL: env.BETTER_AUTH_URL || baseURL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      requireEmailVerification: REQUIRE_EMAIL_VERIFICATION,
    },
    emailVerification: {
      sendOnSignUp: REQUIRE_EMAIL_VERIFICATION,
      autoSignInAfterVerification: true,
      // Hook pronto: chamado pelo Better Auth com o link de verificação.
      sendVerificationEmail: ({ user, url }) =>
        sendEmail(env, {
          to: user.email,
          subject: `Confirme seu email no ${env.APP_NAME}`,
          text: `Olá, ${user.name}! Para confirmar seu email, abra: ${url}`,
        }),
    },
    socialProviders: socialProviders(env),
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthUser = Auth["$Infer"]["Session"]["user"];
export type AuthSession = Auth["$Infer"]["Session"]["session"];

/**
 * Instância do Better Auth deste request (criada na primeira chamada). Requer o
 * `withDb` antes, que abre a conexão em `c.var.db`.
 */
export function getAuth(c: Context<AppEnv>): Auth {
  let auth = c.get("auth");
  if (!auth) {
    auth = createAuth({ db: c.var.db, env: c.env, baseURL: new URL(c.req.url).origin });
    c.set("auth", auth);
  }
  return auth;
}

/**
 * Exige um usuário logado (cookie de sessão do Better Auth). Sem sessão válida,
 * responde 401 `{ error }`; com sessão, expõe `c.var.user` e `c.var.session`.
 * Use depois do `withDb`: `new Hono<AppEnv>().use(withDb, requireUser)`.
 */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const result = await getAuth(c).api.getSession({ headers: c.req.raw.headers });
  if (!result) {
    return c.json({ error: "Faça login para continuar." }, 401);
  }
  c.set("user", result.user);
  c.set("session", result.session);
  await next();
});
