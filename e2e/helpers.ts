import { expect, type Page } from "@playwright/test";

export const PASSWORD = "senha-segura-123";

/** Email único por teste: o banco do preview é compartilhado entre os testes. */
export function uniqueEmail(prefix = "e2e") {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}@exemplo.com`;
}

/**
 * Cria uma conta pela API e deixa o navegador logado (o `page.request`
 * compartilha os cookies com a página). Para testes que não são sobre o login.
 */
export async function signUpViaApi(page: Page, baseURL: string | undefined) {
  const user = { name: "Pessoa E2E", email: uniqueEmail(), password: PASSWORD };
  const res = await page.request.post("/api/auth/sign-up/email", {
    data: user,
    // O Better Auth confere a origem dos POSTs (proteção contra CSRF).
    headers: { Origin: new URL(baseURL ?? "http://localhost").origin },
  });
  expect(res.ok()).toBe(true);
  return user;
}
