import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth-client";
import { makeSession, renderRoute } from "@/test/utils";

type Handler = (body: unknown) => Response;

/**
 * API falsa (substitui o `fetch`): endpoints do Better Auth com uma sessão em
 * memória e o que mais o teste passar em `routes` ("MÉTODO /caminho").
 */
function mockAuthApi({
  session = null as Session | null,
  routes = {} as Record<string, Handler>,
  social = [] as string[],
} = {}) {
  let current = session;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : undefined;
    const url = new URL(request?.url ?? String(input), "http://localhost");
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const rawBody = init?.body ?? (request ? await request.text() : undefined);
    const body = typeof rawBody === "string" && rawBody ? JSON.parse(rawBody) : undefined;
    const key = `${method} ${url.pathname}`;

    const custom = routes[key];
    if (custom) {
      const res = custom(body);
      if (res.ok && key.startsWith("POST /api/auth/sign-")) current = makeSession();
      return res;
    }
    if (key === "GET /api/auth/get-session") return Response.json(current);
    if (key === "GET /api/auth/providers") {
      return Response.json({ emailAndPassword: true, social });
    }
    if (key === "POST /api/auth/sign-out") {
      current = null;
      return Response.json({ success: true });
    }
    if (key === "GET /api/projects") return Response.json([]);
    throw new Error(`mockAuthApi: ${key} não tratado`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, getSession: () => current };
}

function calls(fetchMock: ReturnType<typeof vi.fn>, method: string, pathname: string) {
  return fetchMock.mock.calls.filter(([input, init]) => {
    const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
    const requestMethod = (init as RequestInit | undefined)?.method ?? "GET";
    return url.pathname === pathname && requestMethod.toUpperCase() === method;
  });
}

const ok = () => Response.json({ token: "t", user: makeSession().user });

describe("rotas protegidas", () => {
  it("sem login, /projects redireciona para /login guardando o destino", async () => {
    mockAuthApi();
    const { router } = renderRoute("/projects", { session: null });

    expect(await screen.findByRole("heading", { name: "Entrar" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toEqual({ redirect: "/projects" });
  });

  it("protege também as subpáginas (detalhe e novo)", async () => {
    mockAuthApi();
    const { router } = renderRoute("/projects/new", { session: null });

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.search).toEqual({ redirect: "/projects/new" });
  });

  it("páginas públicas abrem sem login", async () => {
    mockAuthApi();
    const { router } = renderRoute("/about", { session: null });

    expect(await screen.findByRole("heading", { name: "Sobre" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/about");
  });

  it("se a API responde 401 (sessão expirou), volta para o login", async () => {
    mockAuthApi({
      routes: {
        "GET /api/projects": () =>
          Response.json({ error: "Faça login para continuar." }, { status: 401 }),
      },
    });
    const { router } = renderRoute("/projects");

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.search).toEqual({ redirect: "/projects" });
  });
});

describe("entrar", () => {
  it("entra e volta para a página pedida", async () => {
    const { fetchMock } = mockAuthApi({ routes: { "POST /api/auth/sign-in/email": ok } });
    const { user, router } = renderRoute("/projects", { session: null });

    await user.type(await screen.findByLabelText("Email"), "ana@exemplo.com");
    await user.type(screen.getByLabelText("Senha"), "senha-segura-123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/projects"));
    expect(await screen.findByText("Nenhum projeto ainda")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Menu de Ana Souza" })).toBeInTheDocument();

    const [[, init]] = calls(fetchMock, "POST", "/api/auth/sign-in/email") as [
      [unknown, RequestInit],
    ];
    expect(JSON.parse(String(init.body))).toMatchObject({
      email: "ana@exemplo.com",
      password: "senha-segura-123",
    });
  });

  it("mostra o erro de email ou senha incorretos e continua no login", async () => {
    mockAuthApi({
      routes: {
        "POST /api/auth/sign-in/email": () =>
          Response.json(
            { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" },
            { status: 401 },
          ),
      },
    });
    const { user, router } = renderRoute("/login", { session: null });

    await user.type(await screen.findByLabelText("Email"), "ana@exemplo.com");
    await user.type(screen.getByLabelText("Senha"), "errada-123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Email ou senha incorretos.")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("valida os campos antes de enviar", async () => {
    const { fetchMock } = mockAuthApi();
    const { user } = renderRoute("/login", { session: null });

    await user.type(await screen.findByLabelText("Email"), "nao-e-email");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(screen.getByText("Informe um email válido.")).toBeInTheDocument();
    expect(screen.getByText("Informe a senha.")).toBeInTheDocument();
    expect(calls(fetchMock, "POST", "/api/auth/sign-in/email")).toHaveLength(0);
  });

  it("não redireciona para fora do app (?redirect=//outro-site)", async () => {
    mockAuthApi({ routes: { "POST /api/auth/sign-in/email": ok } });
    const { user, router } = renderRoute("/login?redirect=//evil.example.com", { session: null });

    await user.type(await screen.findByLabelText("Email"), "ana@exemplo.com");
    await user.type(screen.getByLabelText("Senha"), "senha-segura-123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/projects"));
  });

  it("quem já está logado não vê o login", async () => {
    mockAuthApi({ session: makeSession() });
    const { router } = renderRoute("/login");

    await waitFor(() => expect(router.state.location.pathname).toBe("/projects"));
  });

  it("mostra os botões de login social configurados", async () => {
    mockAuthApi({ social: ["github"] });
    renderRoute("/login", { session: null });

    expect(await screen.findByRole("button", { name: "Continuar com GitHub" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continuar com Google" })).not.toBeInTheDocument();
  });

  it("mostra o erro quando o OAuth volta com ?error=", async () => {
    mockAuthApi();
    renderRoute("/login?error=access_denied", { session: null });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível entrar com o provedor escolhido.",
    );
  });
});

describe("criar conta", () => {
  it("cadastra, entra e vai para os projetos", async () => {
    const { fetchMock } = mockAuthApi({ routes: { "POST /api/auth/sign-up/email": ok } });
    const { user, router } = renderRoute("/login", { session: null });

    await user.click(
      within(await screen.findByRole("main")).getByRole("link", { name: "Criar conta" }),
    );
    expect(await screen.findByRole("heading", { name: "Criar conta" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Nome"), "Ana Souza");
    await user.type(screen.getByLabelText("Email"), "ana@exemplo.com");
    await user.type(screen.getByLabelText("Senha"), "senha-segura-123");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/projects"));
    const [[, init]] = calls(fetchMock, "POST", "/api/auth/sign-up/email") as [
      [unknown, RequestInit],
    ];
    expect(JSON.parse(String(init.body))).toMatchObject({
      name: "Ana Souza",
      email: "ana@exemplo.com",
      password: "senha-segura-123",
    });
  });

  it("exige senha com pelo menos 8 caracteres", async () => {
    const { fetchMock } = mockAuthApi();
    const { user } = renderRoute("/signup", { session: null });

    await user.type(await screen.findByLabelText("Nome"), "Ana");
    await user.type(screen.getByLabelText("Email"), "ana@exemplo.com");
    await user.type(screen.getByLabelText("Senha"), "curta");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(screen.getByText("A senha precisa ter pelo menos 8 caracteres.")).toBeInTheDocument();
    expect(calls(fetchMock, "POST", "/api/auth/sign-up/email")).toHaveLength(0);
  });

  it("avisa quando o email já tem conta", async () => {
    mockAuthApi({
      routes: {
        "POST /api/auth/sign-up/email": () =>
          Response.json(
            { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", message: "User already exists." },
            { status: 422 },
          ),
      },
    });
    const { user } = renderRoute("/signup", { session: null });

    await user.type(await screen.findByLabelText("Nome"), "Ana");
    await user.type(screen.getByLabelText("Email"), "ana@exemplo.com");
    await user.type(screen.getByLabelText("Senha"), "senha-segura-123");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByText("Já existe uma conta com este email.")).toBeInTheDocument();
  });
});

describe("menu do usuário e sair", () => {
  it("sem login, o header mostra Entrar e Criar conta", async () => {
    mockAuthApi();
    renderRoute("/", { session: null });

    const header = await screen.findByRole("banner");
    expect(within(header).getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/login");
    expect(within(header).getByRole("link", { name: "Criar conta" })).toHaveAttribute(
      "href",
      "/signup",
    );
  });

  it("mostra quem está logado e sai pelo menu", async () => {
    const { fetchMock, getSession } = mockAuthApi({ session: makeSession() });
    const { user, router } = renderRoute("/projects");

    await user.click(await screen.findByRole("button", { name: "Menu de Ana Souza" }));
    const menu = await screen.findByRole("menu");
    expect(menu).toHaveTextContent("ana@exemplo.com");

    await user.click(within(menu).getByRole("menuitem", { name: "Sair" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(calls(fetchMock, "POST", "/api/auth/sign-out")).toHaveLength(1);
    expect(getSession()).toBeNull();
    expect(
      await within(screen.getByRole("banner")).findByRole("link", { name: "Entrar" }),
    ).toBeInTheDocument();
  });
});
