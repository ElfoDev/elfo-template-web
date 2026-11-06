import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { socialProviders } from "../auth";
import { authRequest, cookieFrom, nextTestIp, signUp } from "../test/auth";
import { createTestDb, type TestDb, testEnv } from "../test/db";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(() => testDb.reset());
afterAll(() => testDb.close());

async function getSession(cookie: string) {
  const res = await authRequest(testDb.app, "/get-session", undefined, { cookie });
  expect(res.status).toBe(200);
  return (await res.json()) as { user: { id: string; email: string } } | null;
}

describe("cadastro (POST /api/auth/sign-up/email)", () => {
  it("cria o usuário e já abre a sessão (cookie)", async () => {
    const user = await signUp(testDb.app, { name: "Ana", email: "ana@exemplo.com" });

    expect(user.cookie).toMatch(/session_token=/);
    expect(await getSession(user.cookie)).toMatchObject({
      user: { id: user.id, email: "ana@exemplo.com", name: "Ana", emailVerified: false },
    });
  });

  it("não guarda a senha em texto puro", async () => {
    await signUp(testDb.app, { email: "ana@exemplo.com", password: "senha-segura-123" });

    const [account] = await testDb.db.query.accounts.findMany();
    expect(account?.providerId).toBe("credential");
    expect(account?.password).toBeTruthy();
    expect(account?.password).not.toContain("senha-segura-123");
  });

  it("recusa email já cadastrado", async () => {
    await signUp(testDb.app, { email: "ana@exemplo.com" });

    const res = await authRequest(testDb.app, "/sign-up/email", {
      name: "Outra Ana",
      email: "ana@exemplo.com",
      password: "outra-senha-123",
    });

    expect(res.status).toBe(422);
  });

  it("recusa senha curta", async () => {
    const res = await authRequest(testDb.app, "/sign-up/email", {
      name: "Ana",
      email: "ana@exemplo.com",
      password: "curta",
    });

    expect(res.status).toBe(400);
  });
});

describe("login e logout", () => {
  it("entra com email e senha certos", async () => {
    await signUp(testDb.app, { email: "ana@exemplo.com", password: "senha-segura-123" });

    const res = await authRequest(testDb.app, "/sign-in/email", {
      email: "ana@exemplo.com",
      password: "senha-segura-123",
    });

    expect(res.status).toBe(200);
    expect(await getSession(cookieFrom(res))).toMatchObject({
      user: { email: "ana@exemplo.com" },
    });
  });

  it("responde 401 para senha errada, sem abrir sessão", async () => {
    await signUp(testDb.app, { email: "ana@exemplo.com", password: "senha-segura-123" });

    const res = await authRequest(testDb.app, "/sign-in/email", {
      email: "ana@exemplo.com",
      password: "senha-errada-123",
    });

    expect(res.status).toBe(401);
    expect(cookieFrom(res)).not.toMatch(/session_token=[^;]/);
  });

  it("sair encerra a sessão", async () => {
    const user = await signUp(testDb.app);

    const res = await authRequest(testDb.app, "/sign-out", {}, { cookie: user.cookie });

    expect(res.status).toBe(200);
    expect(await getSession(user.cookie)).toBeNull();
  });

  it("sem cookie não há sessão", async () => {
    expect(await getSession("")).toBeNull();
  });
});

describe("socialProviders", () => {
  it("fica vazio sem as envs de OAuth", () => {
    expect(socialProviders(testEnv)).toEqual({});
  });

  it("liga cada provedor só com client id e secret", () => {
    const providers = socialProviders({
      ...testEnv,
      OAUTH_GITHUB_CLIENT_ID: "gh-id",
      OAUTH_GITHUB_CLIENT_SECRET: "gh-secret",
      OAUTH_GOOGLE_CLIENT_ID: "google-id",
    });

    expect(providers).toEqual({ github: { clientId: "gh-id", clientSecret: "gh-secret" } });
  });
});

describe("GET /api/auth/providers", () => {
  it("lista só email e senha sem OAuth configurado", async () => {
    const res = await testDb.app.request("/api/auth/providers", {}, testEnv);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ emailAndPassword: true, social: [] });
  });

  it("inclui os provedores com as envs definidas", async () => {
    const res = await testDb.app.request(
      "/api/auth/providers",
      {},
      {
        ...testEnv,
        OAUTH_GOOGLE_CLIENT_ID: "google-id",
        OAUTH_GOOGLE_CLIENT_SECRET: "google-secret",
      },
    );

    expect(await res.json()).toEqual({ emailAndPassword: true, social: ["google"] });
  });
});

describe("configuração", () => {
  it("responde 503 sem BETTER_AUTH_SECRET", async () => {
    const res = await testDb.app.request(
      "/api/auth/get-session",
      {},
      {
        ...testEnv,
        BETTER_AUTH_SECRET: "",
      },
    );

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "Autenticação não configurada: defina BETTER_AUTH_SECRET.",
    });
  });
});

describe("rate limit (guardado no banco)", () => {
  const credentials = { email: "ana@exemplo.com", password: "senha-errada-123" };

  it("responde 429 para tentativas repetidas de login do mesmo IP", async () => {
    await signUp(testDb.app, { email: "ana@exemplo.com", password: "senha-segura-123" });
    const headers = { "cf-connecting-ip": nextTestIp() };

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await authRequest(testDb.app, "/sign-in/email", credentials, headers);
      statuses.push(res.status);
    }

    // Senha errada = 401, até estourar o limite (3 por 10s no login); depois, 429.
    expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    expect(statuses.slice(3)).toEqual([429, 429, 429]);
  });

  it("não deixa a senha certa passar depois de estourar o limite", async () => {
    await signUp(testDb.app, { email: "ana@exemplo.com", password: "senha-segura-123" });
    const headers = { "cf-connecting-ip": nextTestIp() };
    for (let i = 0; i < 3; i++) {
      await authRequest(testDb.app, "/sign-in/email", credentials, headers);
    }

    const res = await authRequest(
      testDb.app,
      "/sign-in/email",
      { email: "ana@exemplo.com", password: "senha-segura-123" },
      headers,
    );

    expect(res.status).toBe(429);
    expect(res.headers.get("x-retry-after")).toMatch(/^\d+$/);
    expect(cookieFrom(res)).not.toMatch(/session_token=[^;]/);
  });

  it("conta por IP: outro IP não é afetado", async () => {
    await signUp(testDb.app, { email: "ana@exemplo.com", password: "senha-segura-123" });
    const blocked = { "cf-connecting-ip": nextTestIp() };
    for (let i = 0; i < 4; i++) {
      await authRequest(testDb.app, "/sign-in/email", credentials, blocked);
    }

    const res = await authRequest(testDb.app, "/sign-in/email", credentials, {
      "cf-connecting-ip": nextTestIp(),
    });

    expect(res.status).toBe(401);
  });

  it("guarda os contadores na tabela rate_limits", async () => {
    const ip = nextTestIp();
    await authRequest(testDb.app, "/sign-in/email", credentials, { "cf-connecting-ip": ip });

    const rows = await testDb.db.query.rateLimits.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: expect.stringContaining(ip), count: 1 });
  });
});

describe("login social: não vincula a conta de email e senha não verificada", () => {
  const oauthEnv = {
    ...testEnv,
    OAUTH_GITHUB_CLIENT_ID: "gh-id",
    OAUTH_GITHUB_CLIENT_SECRET: "gh-secret",
  };

  /** Responde as chamadas do GitHub (troca do code + perfil) como se `email` fosse verificado. */
  function stubGitHub(email: string) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : input);
        const json = (body: unknown) => Response.json(body);
        if (url.hostname === "github.com") {
          return json({ access_token: "gh-token", token_type: "bearer", scope: "read:user" });
        }
        if (url.pathname === "/user") {
          return json({ id: 4242, login: "vitima", name: "Vítima", email, avatar_url: "" });
        }
        if (url.pathname === "/user/emails") {
          return json([{ email, primary: true, verified: true }]);
        }
        throw new Error(`fetch inesperado: ${url}`);
      }),
    );
  }

  /** Percorre o fluxo OAuth completo: começa em sign-in/social e volta pelo callback. */
  async function signInWithGitHub() {
    const start = await testDb.app.request(
      "/api/auth/sign-in/social",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost" },
        body: JSON.stringify({ provider: "github", callbackURL: "/projects" }),
      },
      oauthEnv,
    );
    expect(start.status).toBe(200);
    const { url } = (await start.json()) as { url: string };
    const state = new URL(url).searchParams.get("state");

    return testDb.app.request(
      `/api/auth/callback/github?code=codigo&state=${state}`,
      { headers: { cookie: cookieFrom(start) } },
      oauthEnv,
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("controle: GitHub cria a conta de quem ainda não tem cadastro", async () => {
    stubGitHub("nova@exemplo.com");

    const res = await signInWithGitHub();

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/projects");
    expect(cookieFrom(res)).toMatch(/session_token=[^;]/);
    expect(await testDb.db.query.users.findMany()).toHaveLength(1);
  });

  it("recusa o vínculo: o atacante que cadastrou o email da vítima não herda o login social", async () => {
    // 1. O atacante cria uma conta com o email da vítima, sem provar que é dono dele.
    const attacker = await signUp(testDb.app, {
      name: "Atacante",
      email: "vitima@exemplo.com",
      password: "senha-do-atacante-123",
    });
    // 2. A vítima chega depois e entra com o GitHub (email verificado pelo provedor).
    stubGitHub("vitima@exemplo.com");
    const res = await signInWithGitHub();

    // O login social não é vinculado a essa conta nem abre sessão nela...
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("error=account_not_linked");
    expect(cookieFrom(res)).not.toMatch(/session_token=[^;]/);
    const accounts = await testDb.db.query.accounts.findMany();
    expect(accounts.map((account) => account.providerId)).toEqual(["credential"]);
    // ...e o email não foi marcado como verificado só porque o provedor o confirmou.
    const [user] = await testDb.db.query.users.findMany();
    expect(user).toMatchObject({ id: attacker.id, emailVerified: false });
  });
});
