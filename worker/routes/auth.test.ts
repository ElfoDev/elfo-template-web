import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { socialProviders } from "../auth";
import { authRequest, cookieFrom, signUp } from "../test/auth";
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
      GITHUB_CLIENT_ID: "gh-id",
      GITHUB_CLIENT_SECRET: "gh-secret",
      GOOGLE_CLIENT_ID: "google-id",
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
        GOOGLE_CLIENT_ID: "google-id",
        GOOGLE_CLIENT_SECRET: "google-secret",
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
