import { type EasterEggResponse, easterEggResponseSchema } from "@shared/easter-egg";
import { Hono } from "hono";
import type { AppEnv } from "../types";

/** Mensagem secreta servida pelo Worker. Só existe aqui: o front a lê da API. */
export const EASTER_EGG_MESSAGE =
  "Você achou o ovo escondido no Worker! Front e API estão rodando juntos no preview. 🐣";

/** GET /api/easter-egg: sem login e sem banco. Descartável depois de validar o preview. */
export const easterEggRoutes = new Hono<AppEnv>().get("/", (c) => {
  const body: EasterEggResponse = easterEggResponseSchema.parse({
    message: EASTER_EGG_MESSAGE,
    hiddenAt: new Date().toISOString(),
  });

  return c.json(body, 200, { "Cache-Control": "no-store" });
});
