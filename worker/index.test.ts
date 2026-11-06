import { describe, expect, it } from "vitest";
import app from "./index";

const env = { APP_NAME: "Test App" } satisfies Env;

describe("API", () => {
  it("responde 404 em JSON para rotas desconhecidas", async () => {
    const res = await app.request("/api/nao-existe", {}, env);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});
