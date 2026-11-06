import { type Project, projectSchema } from "@shared/projects";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { signUp, type TestUser } from "../test/auth";
import { createTestDb, type TestDb, testEnv } from "../test/db";

let testDb: TestDb;
/** Usuário logado nos requests (o padrão de `request`). */
let alice: TestUser;

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(async () => {
  await testDb.reset();
  alice = await signUp(testDb.app, { name: "Alice", email: "alice@exemplo.com" });
});
afterAll(() => testDb.close());

const MISSING_ID = "00000000-0000-4000-8000-000000000000";

/** Request em /api/projects como `as` (padrão: alice; `null` = sem login). */
function request(path: string, init: RequestInit & { json?: unknown; as?: TestUser | null } = {}) {
  const { json, as = alice, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (as) headers.set("Cookie", as.cookie);
  if (json !== undefined) headers.set("Content-Type", "application/json");
  return testDb.app.request(
    `/api/projects${path}`,
    { ...rest, headers, body: json === undefined ? rest.body : JSON.stringify(json) },
    testEnv,
  );
}

async function createProject(json: unknown, as: TestUser = alice): Promise<Project> {
  const res = await request("", { method: "POST", json, as });
  expect(res.status).toBe(201);
  return projectSchema.parse(await res.json());
}

describe("GET /api/projects", () => {
  it("responde lista vazia quando não há projetos", async () => {
    const res = await request("");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("lista os projetos, do mais novo para o mais antigo", async () => {
    const first = await createProject({ name: "Primeiro" });
    const second = await createProject({ name: "Segundo" });

    const res = await request("");
    const body = projectSchema.array().parse(await res.json());

    expect(body.map((project) => project.id)).toEqual([second.id, first.id]);
  });
});

describe("POST /api/projects", () => {
  it("cria o projeto (201) com os campos normalizados", async () => {
    const project = await createProject({ name: "  Site novo  ", description: " Landing " });

    expect(project).toMatchObject({ name: "Site novo", description: "Landing" });
    expect(project.createdAt).toBe(project.updatedAt);
  });

  it("usa descrição vazia por padrão", async () => {
    const project = await createProject({ name: "Sem descrição" });

    expect(project.description).toBe("");
  });

  it.each([
    [{}, "Informe o nome do projeto."],
    [{ name: "   " }, "Informe o nome do projeto."],
    [{ name: "x".repeat(101) }, "O nome pode ter no máximo 100 caracteres."],
    [{ name: "Ok", description: 42 }, "A descrição deve ser um texto."],
  ])("responde 400 para entrada inválida %j", async (json, message) => {
    const res = await request("", { method: "POST", json });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: message });
  });

  it("responde 400 para JSON malformado", async () => {
    const res = await request("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{nope",
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: expect.any(String) });
  });
});

describe("GET /api/projects/:id", () => {
  it("devolve o projeto", async () => {
    const project = await createProject({ name: "Detalhe" });

    const res = await request(`/${project.id}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(project);
  });

  it.each([MISSING_ID, "nao-e-uuid"])("responde 404 para id %s", async (id) => {
    const res = await request(`/${id}`);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Projeto não encontrado." });
  });
});

describe("PATCH /api/projects/:id", () => {
  it("atualiza só os campos enviados", async () => {
    const project = await createProject({ name: "Antigo", description: "Mantida" });

    const res = await request(`/${project.id}`, { method: "PATCH", json: { name: "Novo" } });

    expect(res.status).toBe(200);
    const updated = projectSchema.parse(await res.json());
    expect(updated).toMatchObject({ id: project.id, name: "Novo", description: "Mantida" });
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(project.updatedAt));
  });

  it("responde 400 sem nenhum campo", async () => {
    const project = await createProject({ name: "Projeto" });

    const res = await request(`/${project.id}`, { method: "PATCH", json: {} });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Informe pelo menos um campo para atualizar." });
  });

  it("responde 400 para nome vazio", async () => {
    const project = await createProject({ name: "Projeto" });

    const res = await request(`/${project.id}`, { method: "PATCH", json: { name: "" } });

    expect(res.status).toBe(400);
  });

  it("responde 404 se o projeto não existe", async () => {
    const res = await request(`/${MISSING_ID}`, { method: "PATCH", json: { name: "Novo" } });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/projects/:id", () => {
  it("apaga o projeto (204)", async () => {
    const project = await createProject({ name: "Descartável" });

    const res = await request(`/${project.id}`, { method: "DELETE" });

    expect(res.status).toBe(204);
    expect((await request(`/${project.id}`)).status).toBe(404);
  });

  it("responde 404 se o projeto não existe", async () => {
    const res = await request(`/${MISSING_ID}`, { method: "DELETE" });

    expect(res.status).toBe(404);
  });
});

describe("autenticação", () => {
  it.each([
    ["GET", ""],
    ["POST", ""],
    ["GET", `/${MISSING_ID}`],
    ["PATCH", `/${MISSING_ID}`],
    ["DELETE", `/${MISSING_ID}`],
  ])("responde 401 sem login (%s /api/projects%s)", async (method, path) => {
    const json = method === "POST" || method === "PATCH" ? { name: "X" } : undefined;
    const res = await request(path, { method, json, as: null });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Faça login para continuar." });
  });

  it("responde 401 com sessão inválida", async () => {
    const res = await request("", {
      as: { ...alice, cookie: "better-auth.session_token=forjado" },
    });

    expect(res.status).toBe(401);
  });

  it("responde 401 depois do logout", async () => {
    await testDb.app.request(
      "/api/auth/sign-out",
      { method: "POST", headers: { Cookie: alice.cookie, Origin: "http://localhost" } },
      testEnv,
    );

    expect((await request("")).status).toBe(401);
  });
});

describe("autorização: cada usuário só vê os próprios projetos", () => {
  let bob: TestUser;
  let alicesProject: Project;

  beforeEach(async () => {
    bob = await signUp(testDb.app, { name: "Bob", email: "bob@exemplo.com" });
    alicesProject = await createProject({ name: "Da Alice" });
  });

  it("a lista só traz os projetos do usuário logado", async () => {
    const bobsProject = await createProject({ name: "Do Bob" }, bob);

    const asAlice = projectSchema.array().parse(await (await request("")).json());
    const asBob = projectSchema.array().parse(await (await request("", { as: bob })).json());

    expect(asAlice.map((project) => project.id)).toEqual([alicesProject.id]);
    expect(asBob.map((project) => project.id)).toEqual([bobsProject.id]);
  });

  it("não abre o projeto de outro usuário (404)", async () => {
    const res = await request(`/${alicesProject.id}`, { as: bob });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Projeto não encontrado." });
  });

  it("não edita o projeto de outro usuário (404) e nada muda", async () => {
    const res = await request(`/${alicesProject.id}`, {
      method: "PATCH",
      json: { name: "Invadido" },
      as: bob,
    });

    expect(res.status).toBe(404);
    expect(await (await request(`/${alicesProject.id}`)).json()).toEqual(alicesProject);
  });

  it("não apaga o projeto de outro usuário (404) e ele continua lá", async () => {
    const res = await request(`/${alicesProject.id}`, { method: "DELETE", as: bob });

    expect(res.status).toBe(404);
    expect((await request(`/${alicesProject.id}`)).status).toBe(200);
  });

  it("ignora um userId enviado no corpo: o dono é sempre quem está logado", async () => {
    const res = await request("", {
      method: "POST",
      json: { name: "Tentativa", userId: alice.id },
      as: bob,
    });
    const created = projectSchema.parse(await res.json());

    expect((await request(`/${created.id}`, { as: bob })).status).toBe(200);
    expect((await request(`/${created.id}`)).status).toBe(404);
  });
});
