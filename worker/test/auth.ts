import type { createApp } from "../index";
import { testEnv } from "./db";

type App = ReturnType<typeof createApp>;

export interface TestUser {
  id: string;
  email: string;
  /** Header `Cookie` com a sessão: passe em `headers: { cookie }`. */
  cookie: string;
}

/** `Set-Cookie` da resposta → valor para o header `Cookie` do próximo request. */
export function cookieFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

let ipCounter = 0;

/** IP de teste único: cada chamada cai num balde de rate limit diferente. */
export const nextTestIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;

/**
 * Chama um endpoint do Better Auth (POST com JSON) em /api/auth/*. Cada chamada
 * vem de um IP diferente (`cf-connecting-ip`), para o rate limit não atrapalhar
 * os testes; passe `{ "cf-connecting-ip": ip }` em `headers` para repetir o IP.
 */
export function authRequest(app: App, path: string, json?: unknown, headers: HeadersInit = {}) {
  return app.request(
    `/api/auth${path}`,
    {
      method: json === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        // Origin do próprio app: o Better Auth recusa POSTs com cookie de outra origem.
        Origin: "http://localhost",
        "cf-connecting-ip": nextTestIp(),
        ...headers,
      },
      body: json === undefined ? undefined : JSON.stringify(json),
    },
    testEnv,
  );
}

let counter = 0;

/** Cadastra um usuário (email + senha) e devolve o cookie da sessão criada. */
export async function signUp(
  app: App,
  {
    name = "Pessoa Teste",
    email = `pessoa${++counter}@exemplo.com`,
    password = "senha-segura-123",
  } = {},
): Promise<TestUser> {
  const res = await authRequest(app, "/sign-up/email", { name, email, password });
  if (res.status !== 200) {
    throw new Error(`signUp falhou (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { user: { id: string; email: string } };
  return { id: body.user.id, email: body.user.email, cookie: cookieFrom(res) };
}
