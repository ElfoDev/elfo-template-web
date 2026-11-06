import { z } from "zod";

/**
 * Contrato de GET /api/health, compartilhado entre o Worker (que valida a
 * resposta antes de enviar) e o front (que usa o tipo inferido).
 */
export const serviceStatusSchema = z.enum(["ok", "degraded", "down"]);
export type ServiceStatus = z.infer<typeof serviceStatusSchema>;

export const serviceHealthSchema = z.object({
  name: z.string().min(1),
  status: serviceStatusSchema,
  latencyMs: z.number().nonnegative().optional(),
});
export type ServiceHealth = z.infer<typeof serviceHealthSchema>;

export const healthResponseSchema = z.object({
  status: serviceStatusSchema,
  app: z.string(),
  timestamp: z.iso.datetime(),
  /** Dependências externas (banco, auth...). Vazio até o WEB-2 ligar o Neon. */
  services: z.array(serviceHealthSchema),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
