import { easterEggResponseSchema } from "@shared/easter-egg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../index";
import { testEnv } from "../test/db";
import { EASTER_EGG_MESSAGE } from "./easter-egg";

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/easter-egg", () => {
  it("responde 200 com o contrato de shared/easter-egg, sem login e sem banco", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-07T12:00:00.000Z"), toFake: ["Date"] });

    // App padrão + DATABASE_URL vazia: se a rota tocasse no banco, responderia 503.
    const res = await createApp().request("/api/easter-egg", {}, testEnv);

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");

    const body = easterEggResponseSchema.parse(await res.json());
    expect(body).toEqual({
      message: EASTER_EGG_MESSAGE,
      hiddenAt: "2026-11-07T12:00:00.000Z",
    });
    expect(body.message).not.toBe("");
  });

  it("só aceita GET", async () => {
    const res = await createApp().request("/api/easter-egg", { method: "POST" }, testEnv);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});
