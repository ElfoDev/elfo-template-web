import { expect, test } from "@playwright/test";
import { signUpViaApi } from "./helpers";

/**
 * CRUD de projetos no browser, contra o build de produção e um banco real
 * (PGlite em memória no `vite preview`). Cada teste usa um usuário novo, então
 * não depende do que já existe no banco.
 */
test.beforeEach(async ({ page, baseURL }) => {
  await signUpViaApi(page, baseURL);
});

test("cria, edita e apaga um projeto", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const name = `Projeto e2e ${suffix}`;
  const renamed = `Projeto renomeado ${suffix}`;

  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name: "Projetos" })
    .click();
  await expect(page.getByRole("heading", { name: "Projetos" })).toBeVisible();

  // Criar
  await page.getByRole("link", { name: "Novo projeto" }).click();
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel(/Descrição/).fill("Criado pelo Playwright");
  await page.getByRole("button", { name: "Criar projeto" }).click();

  await expect(page).toHaveURL(/\/projects$/);
  const list = page.getByRole("list", { name: "Projetos" });
  await expect(list.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(list.getByText("Criado pelo Playwright")).toBeVisible();

  // Editar (e sobrevive a um reload: veio do banco)
  await page.getByRole("link", { name: `Editar ${name}` }).click();
  await expect(page.getByLabel("Nome")).toHaveValue(name);
  await page.reload();
  await expect(page.getByLabel("Nome")).toHaveValue(name);
  await page.getByLabel("Nome").fill(renamed);
  await page.getByRole("button", { name: "Salvar alterações" }).click();

  await expect(page).toHaveURL(/\/projects$/);
  await expect(list.getByRole("link", { name: renamed, exact: true })).toBeVisible();
  await expect(list.getByRole("link", { name, exact: true })).toHaveCount(0);

  // Apagar
  await page.getByRole("button", { name: `Apagar ${renamed}` }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Apagar" }).click();

  await expect(page.getByText(`Projeto "${renamed}" apagado.`)).toBeVisible();
  await expect(page.getByRole("link", { name: renamed, exact: true })).toHaveCount(0);
});

test("validação do formulário e projeto inexistente", async ({ page }) => {
  await page.goto("/projects/new");
  await page.getByRole("button", { name: "Criar projeto" }).click();
  await expect(page.getByText("Informe o nome do projeto.")).toBeVisible();

  await page.goto("/projects/00000000-0000-4000-8000-000000000000");
  await expect(page.getByText("Projeto não encontrado")).toBeVisible();
});
