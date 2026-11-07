import { z } from "zod";

/**
 * Contrato de GET /api/easter-egg, compartilhado entre o Worker (que valida a
 * resposta antes de enviar) e o front (que usa o tipo inferido).
 *
 * Easter egg descartável para testar o preview: prova que front e API rodam juntos.
 */
export const easterEggResponseSchema = z.object({
  /** Mensagem secreta. Vazia = nenhum Easter egg escondido (o front mostra o estado vazio). */
  message: z.string(),
  /** Quando o Worker escondeu o ovo (ISO 8601), ou seja, quando respondeu. */
  hiddenAt: z.iso.datetime(),
});
export type EasterEggResponse = z.infer<typeof easterEggResponseSchema>;
