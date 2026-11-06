import { healthResponseSchema } from "@shared/health";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../index";
import { createTestDb, type TestDb, testEnv } from "../test/db";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});
afterAll(() => testDb.close());

describe("GET /api/health", () => {
  it("responde 200 com o contrato de shared/health e o banco ok", async () => {
    const res = await testDb.app.request("/api/health", {}, testEnv);

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");

    const body = healthResponseSchema.parse(await res.json());
    expect(body).toMatchObject({
      status: "ok",
      app: "Test App",
      services: [{ name: "database", status: "ok" }],
    });
  });

  it("fica degradado quando o banco não está configurado", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // App padrão + DATABASE_URL vazia: connectFromEnv recusa conectar.
    const res = await createApp().request("/api/health", {}, testEnv);

    expect(res.status).toBe(200);
    const body = healthResponseSchema.parse(await res.json());
    expect(body).toMatchObject({
      status: "degraded",
      services: [{ name: "database", status: "down" }],
    });
  });
});

describe("rotas com banco sem DATABASE_URL", () => {
  it("respondem 503 com mensagem clara", async () => {
    const res = await createApp().request("/api/projects", {}, testEnv);

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "Banco de dados não configurado: defina DATABASE_URL.",
    });
  });
});
