import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, type SocialProvider } from "@shared/auth";
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

/** Provedores OAuth ativos: cada um liga só se as duas envs existirem. */
export function socialProviders(
  env: Env,
): Partial<Record<SocialProvider, { clientId: string; clientSecret: string }>> {
  return {
    ...(env.OAUTH_GITHUB_CLIENT_ID && env.OAUTH_GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: env.OAUTH_GITHUB_CLIENT_ID,
            clientSecret: env.OAUTH_GITHUB_CLIENT_SECRET,
          },
        }
      : {}),
    ...(env.OAUTH_GOOGLE_CLIENT_ID && env.OAUTH_GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.OAUTH_GOOGLE_CLIENT_ID,
            clientSecret: env.OAUTH_GOOGLE_CLIENT_SECRET,
          },
        }
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
      maxPasswordLength: PASSWORD_MAX_LENGTH,
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
    account: {
      accountLinking: {
        // Anti "account pre-hijacking": alguém cria uma conta (email + senha) com o
        // email da vítima, sem prová-lo, e espera a vítima entrar com GitHub/Google;
        // se o login social fosse vinculado a essa conta, o atacante continuaria
        // dono dela pela senha. Por isso o vínculo automático por email só acontece
        // quando o email da conta local JÁ foi verificado (e o do provedor também).
        // Enquanto a verificação de email estiver desligada (nenhuma conta local é
        // verificada), o vínculo implícito fica desligado de vez: quem tem conta com
        // senha e entra com um provedor recebe "account not linked" e deve vincular
        // o provedor logado (`linkSocial`).
        enabled: true,
        disableImplicitLinking: !REQUIRE_EMAIL_VERIFICATION,
        requireLocalEmailVerified: true,
        // Nenhum provedor é confiável "por nome": só vale o email verificado.
        trustedProviders: [],
      },
    },
    // Limite de tentativas (login, cadastro, reset…) guardado no banco: a memória
    // padrão é por isolate e não limita nada no Workers. Ligado sempre: o Better
    // Auth só liga sozinho com NODE_ENV=production, que o Worker não tem.
    rateLimit: { enabled: true, storage: "database" },
    advanced: {
      // Atrás da Cloudflare o IP real do cliente vem em `cf-connecting-ip` (a borda
      // sobrescreve o header). Sem isso todos caem no mesmo balde.
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
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
