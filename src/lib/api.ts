import type { AppType } from "@worker/index";
import { DetailedError, hc, parseResponse } from "hono/client";

/**
 * Cliente tipado da API (Hono RPC). Os tipos de entrada e saída vêm direto das
 * rotas em worker/, então mudar uma rota quebra o typecheck do front.
 *
 * Uso: `await parseResponse(api.health.$get())`.
 */
export const api = hc<AppType>("/").api;

export { DetailedError, parseResponse };

/** Mensagem amigável para exibir em toasts e estados de erro. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof DetailedError) {
    const detail = error.detail as { data?: { error?: unknown } } | undefined;
    const apiMessage = detail?.data?.error;
    if (typeof apiMessage === "string") return apiMessage;
    if (typeof error.statusCode === "number")
      return `A API respondeu com erro ${error.statusCode}.`;
  }
  if (error instanceof TypeError) return "Não foi possível conectar à API.";
  if (error instanceof Error && error.message) return error.message;
  return "Algo deu errado.";
}
