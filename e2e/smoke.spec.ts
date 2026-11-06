import { expect, test } from "@playwright/test";

test("a API responde em /api/health", async ({ request }) => {
  const res = await request.get("/api/health");

  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ status: "ok", services: [] });
});

test("a home carrega e mostra o status da API", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Principal" })).toBeVisible();
  await expect(page.getByText("Operacional")).toBeVisible();
  await expect(page.getByText("Nenhum serviço conectado")).toBeVisible();
});

test("a navegação funciona e rotas da SPA abrem direto pela URL", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Sobre" }).click();

  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole("heading", { name: "Sobre" })).toBeVisible();

  // Acesso direto: o Worker devolve o index.html (single-page-application).
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "Sobre" })).toBeVisible();
});

test("rota inexistente mostra a página de não encontrado", async ({ page }) => {
  await page.goto("/rota-que-nao-existe");

  await expect(page.getByText("Página não encontrada")).toBeVisible();
});
