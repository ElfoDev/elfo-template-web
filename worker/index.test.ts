import { describe, expect, it } from "vitest";
import app from "./index";
import { testEnv } from "./test/db";

describe("API", () => {
  it("responde 404 em JSON para rotas desconhecidas", async () => {
    const res = await app.request("/api/nao-existe", {}, testEnv);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});
