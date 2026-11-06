import { createProjectSchema, type Project, updateProjectSchema } from "@shared/projects";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { mockFetch, renderRoute } from "@/test/utils";

const NOW = "2026-01-01T12:00:00.000Z";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: crypto.randomUUID(),
    name: "Projeto",
    description: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/**
 * API de projetos falsa em memória (substitui o `fetch`), com o mesmo
 * comportamento das rotas em worker/routes/projects.ts.
 */
function mockProjectsApi(initial: Project[] = []) {
  const projects = [...initial];
  const notFound = () => Response.json({ error: "Projeto não encontrado." }, { status: 404 });

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = (init?.method ?? "GET").toUpperCase();
    const id = url.pathname.match(/^\/api\/projects\/([^/]+)$/)?.[1];
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const index = projects.findIndex((project) => project.id === id);

    if (url.pathname === "/api/projects" && method === "GET") return Response.json(projects);
    if (url.pathname === "/api/projects" && method === "POST") {
      const project = makeProject(createProjectSchema.parse(body));
      projects.unshift(project);
      return Response.json(project, { status: 201 });
    }
    if (id && method === "GET") return index < 0 ? notFound() : Response.json(projects[index]);
    if (id && method === "PATCH") {
      const current = projects[index];
      if (!current) return notFound();
      const updated = { ...current, ...updateProjectSchema.parse(body) };
      projects[index] = updated;
      return Response.json(updated);
    }
    if (id && method === "DELETE") {
      if (index < 0) return notFound();
      projects.splice(index, 1);
      return new Response(null, { status: 204 });
    }
    throw new Error(`mockProjectsApi: ${method} ${url.pathname} não tratado`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return { projects, fetchMock };
}

function requestsTo(fetchMock: ReturnType<typeof vi.fn>, method: string) {
  return fetchMock.mock.calls.filter(
    ([, init]) => ((init as RequestInit | undefined)?.method ?? "GET").toUpperCase() === method,
  );
}

describe("lista de projetos", () => {
  it("mostra o carregamento e depois os projetos", async () => {
    mockProjectsApi([
      makeProject({ name: "Site institucional", description: "Landing nova" }),
      makeProject({ name: "App mobile" }),
    ]);
    renderRoute("/projects");

    expect(await screen.findByRole("status")).toHaveTextContent("Carregando projetos…");

    const list = await screen.findByRole("list", { name: "Projetos" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("Site institucional")).toBeInTheDocument();
    expect(within(list).getByText("Landing nova")).toBeInTheDocument();
  });

  it("mostra o estado vazio com atalho para criar", async () => {
    mockProjectsApi();
    renderRoute("/projects");

    expect(await screen.findByText("Nenhum projeto ainda")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Criar projeto" })).toHaveAttribute(
      "href",
      "/projects/new",
    );
  });

  it("mostra erro e permite tentar de novo", async () => {
    const fetchMock = mockFetch(
      Response.json({ error: "Banco indisponível" }, { status: 503 }),
      Response.json([makeProject({ name: "Voltou" })]),
    );
    const { user } = renderRoute("/projects");

    expect(await screen.findByRole("alert")).toHaveTextContent("Banco indisponível");

    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));

    expect(await screen.findByText("Voltou")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("criar projeto", () => {
  it("cria e volta para a lista", async () => {
    const { fetchMock } = mockProjectsApi();
    const { user, router } = renderRoute("/projects");

    await user.click(await screen.findByRole("link", { name: "Novo projeto" }));
    await user.type(await screen.findByLabelText("Nome"), "Novo site");
    await user.type(screen.getByLabelText(/Descrição/), "Com blog");
    await user.click(screen.getByRole("button", { name: "Criar projeto" }));

    expect(await screen.findByText('Projeto "Novo site" criado.')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe("/projects"));
    expect(await screen.findByText("Novo site")).toBeInTheDocument();

    const [[, init]] = requestsTo(fetchMock, "POST") as [[unknown, RequestInit]];
    expect(JSON.parse(String(init.body))).toEqual({ name: "Novo site", description: "Com blog" });
  });

  it("valida o nome antes de enviar", async () => {
    const { fetchMock } = mockProjectsApi();
    const { user } = renderRoute("/projects/new");

    await user.click(await screen.findByRole("button", { name: "Criar projeto" }));

    expect(screen.getByText("Informe o nome do projeto.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome")).toHaveAttribute("aria-invalid", "true");
    expect(requestsTo(fetchMock, "POST")).toHaveLength(0);
  });

  it("mostra o erro da API em um toast e mantém o formulário", async () => {
    mockFetch(Response.json({ error: "Nome já usado" }, { status: 400 }));
    const { user, router } = renderRoute("/projects/new");

    await user.type(await screen.findByLabelText("Nome"), "Duplicado");
    await user.click(screen.getByRole("button", { name: "Criar projeto" }));

    expect(await screen.findByText("Nome já usado")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/projects/new");
    expect(screen.getByLabelText("Nome")).toHaveValue("Duplicado");
  });
});

describe("editar projeto", () => {
  it("carrega os dados, salva e volta para a lista", async () => {
    const project = makeProject({ name: "Antigo", description: "Descrição" });
    const { fetchMock } = mockProjectsApi([project]);
    const { user, router } = renderRoute(`/projects/${project.id}`);

    const name = await screen.findByLabelText("Nome");
    expect(name).toHaveValue("Antigo");
    expect(screen.getByLabelText(/Descrição/)).toHaveValue("Descrição");

    await user.clear(name);
    await user.type(name, "Renomeado");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(await screen.findByText('Projeto "Renomeado" atualizado.')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe("/projects"));
    expect(await screen.findByText("Renomeado")).toBeInTheDocument();
    expect(requestsTo(fetchMock, "PATCH")).toHaveLength(1);
  });

  it("mostra 'não encontrado' para um id que não existe", async () => {
    mockProjectsApi();
    renderRoute(`/projects/${crypto.randomUUID()}`);

    expect(await screen.findByText("Projeto não encontrado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar para projetos" })).toBeInTheDocument();
  });
});

describe("apagar projeto", () => {
  it("pede confirmação e remove da lista", async () => {
    const { fetchMock } = mockProjectsApi([
      makeProject({ name: "Fica" }),
      makeProject({ name: "Sai" }),
    ]);
    const { user } = renderRoute("/projects");

    await user.click(await screen.findByRole("button", { name: "Apagar Sai" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Apagar “Sai”?");
    await user.click(within(dialog).getByRole("button", { name: "Apagar" }));

    expect(await screen.findByText('Projeto "Sai" apagado.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Sai")).not.toBeInTheDocument());
    expect(screen.getByText("Fica")).toBeInTheDocument();
    expect(requestsTo(fetchMock, "DELETE")).toHaveLength(1);
  });

  it("cancelar não apaga nada", async () => {
    const { fetchMock } = mockProjectsApi([makeProject({ name: "Fica" })]);
    const { user } = renderRoute("/projects");

    await user.click(await screen.findByRole("button", { name: "Apagar Fica" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar" }),
    );

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByText("Fica")).toBeInTheDocument();
    expect(requestsTo(fetchMock, "DELETE")).toHaveLength(0);
  });
});
