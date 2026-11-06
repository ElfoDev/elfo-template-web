import { healthResponseSchema } from "@shared/health";
import { describe, expect, it } from "vitest";
import app from "../index";

const env = { APP_NAME: "Test App" } satisfies Env;

describe("GET /api/health", () => {
  it("responde 200 com o contrato de shared/health", async () => {
    const res = await app.request("/api/health", {}, env);

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");

    const body = healthResponseSchema.parse(await res.json());
    expect(body).toMatchObject({ status: "ok", app: "Test App", services: [] });
  });
});
