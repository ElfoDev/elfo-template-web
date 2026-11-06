import { type Project, projectSchema } from "@shared/projects";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb, testEnv } from "../test/db";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(() => testDb.reset());
afterAll(() => testDb.close());

const MISSING_ID = "00000000-0000-4000-8000-000000000000";

function request(path: string, init: RequestInit & { json?: unknown } = {}) {
  const { json, ...rest } = init;
  return testDb.app.request(
    `/api/projects${path}`,
    json === undefined
      ? rest
      : {
          ...rest,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(json),
        },
    testEnv,
  );
}

async function createProject(json: unknown): Promise<Project> {
  const res = await request("", { method: "POST", json });
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
