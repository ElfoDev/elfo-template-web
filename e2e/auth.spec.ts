import { expect } from "@playwright/test";
import { PASSWORD, randomIp, test, uniqueEmail } from "./helpers";

/** Cadastro, login e logout de ponta a ponta (Better Auth + PGlite do preview). */
test("cadastra, sai e entra de novo", async ({ page }) => {
  const email = uniqueEmail("auth");
  const header = page.getByRole("banner");

  // Rota protegida sem login → /login, guardando o destino.
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login\?redirect=%2Fprojects$/);

  // Cadastrar (link no rodapé do card de login).
  await page.getByRole("main").getByRole("link", { name: "Criar conta" }).click();
  await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();
  await page.getByLabel("Nome").fill("Pessoa E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();

  // Já entra logado e volta para a página pedida.
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("heading", { name: "Projetos" })).toBeVisible();
  await expect(header.getByRole("button", { name: "Menu de Pessoa E2E" })).toBeVisible();

  // A sessão sobrevive a um reload (cookie).
  await page.reload();
  await expect(header.getByRole("button", { name: "Menu de Pessoa E2E" })).toBeVisible();

  // Sair pelo menu.
  await header.getByRole("button", { name: "Menu de Pessoa E2E" }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(header.getByRole("link", { name: "Entrar" })).toBeVisible();
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login/);

  // Senha errada.
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill("senha-errada-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Email ou senha incorretos.")).toBeVisible();

  // Entrar.
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(header.getByRole("button", { name: "Menu de Pessoa E2E" })).toBeVisible();
});

test("um usuário não vê os projetos de outro", async ({ browser, baseURL }) => {
  const name = `Projeto privado ${Date.now().toString(36)}`;

  // Pessoa A cria um projeto.
  const a = await browser.newPage({
    baseURL,
    extraHTTPHeaders: { "cf-connecting-ip": randomIp() },
  });
  await a.goto("/signup");
  await a.getByLabel("Nome").fill("Pessoa A");
  await a.getByLabel("Email").fill(uniqueEmail("a"));
  await a.getByLabel("Senha").fill(PASSWORD);
  await a.getByRole("button", { name: "Criar conta" }).click();
  await a.getByRole("link", { name: "Novo projeto" }).click();
  await a.getByLabel("Nome").fill(name);
  await a.getByRole("button", { name: "Criar projeto" }).click();
  await expect(a.getByRole("link", { name, exact: true })).toBeVisible();
  const projectUrl = await a.getByRole("link", { name, exact: true }).getAttribute("href");

  // Pessoa B (outro contexto = outros cookies) não vê nem abre.
  const b = await browser.newPage({
    baseURL,
    extraHTTPHeaders: { "cf-connecting-ip": randomIp() },
  });
  await b.goto("/signup");
  await b.getByLabel("Nome").fill("Pessoa B");
  await b.getByLabel("Email").fill(uniqueEmail("b"));
  await b.getByLabel("Senha").fill(PASSWORD);
  await b.getByRole("button", { name: "Criar conta" }).click();
  await expect(b.getByText("Nenhum projeto ainda")).toBeVisible();
  await b.goto(projectUrl ?? "/");
  await expect(b.getByText("Projeto não encontrado")).toBeVisible();

  await a.close();
  await b.close();
});
