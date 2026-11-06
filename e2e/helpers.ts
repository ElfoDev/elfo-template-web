import { test as base, expect, type Page } from "@playwright/test";

export const PASSWORD = "senha-segura-123";

/**
 * O rate limit do Better Auth conta por IP (`cf-connecting-ip`) e o e2e roda tudo
 * de um IP só, em paralelo: cada teste manda um IP próprio para não esbarrar nele.
 */
export function randomIp() {
  const byte = () => Math.floor(Math.random() * 254) + 1;
  return `10.${byte()}.${byte()}.${byte()}`;
}

/** `test` do Playwright em que cada teste (e as páginas dele) vem de um IP diferente. */
export const test = base.extend({
  // biome-ignore lint/correctness/noEmptyPattern: o Playwright exige o destructuring no 1º argumento da fixture
  extraHTTPHeaders: async ({}, use) => {
    await use({ "cf-connecting-ip": randomIp() });
  },
});

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
