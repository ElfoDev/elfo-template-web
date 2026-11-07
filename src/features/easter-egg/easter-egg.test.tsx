import type { EasterEggResponse } from "@shared/easter-egg";
import type { HealthResponse } from "@shared/health";
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { mockFetch, renderRoute, renderWithProviders } from "@/test/utils";
import { EasterEggHighlight } from "./easter-egg-highlight";

const egg: EasterEggResponse = {
  message: "Mensagem vinda do backend (teste)",
  hiddenAt: "2026-11-07T12:00:00.000Z",
};

const healthy: HealthResponse = {
  status: "ok",
  app: "Elfo Web",
  timestamp: "2026-11-07T12:00:00.000Z",
  services: [],
};

describe("<EasterEggHighlight />", () => {
  it("mostra o carregamento e depois a mensagem da API", async () => {
    const fetchMock = mockFetch(Response.json(egg));
    renderWithProviders(<EasterEggHighlight />);

    expect(screen.getByRole("status")).toHaveTextContent("Procurando o ovo na API…");
    expect(await screen.findByTestId("easter-egg-message")).toHaveTextContent(egg.message);
    expect(screen.getByText(/Escondido em/).querySelector("time")).toHaveAttribute(
      "datetime",
      egg.hiddenAt,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/easter-egg$/),
      expect.anything(),
    );
  });

  it("mostra o estado vazio quando a API não traz mensagem", async () => {
    mockFetch(Response.json({ ...egg, message: "" } satisfies EasterEggResponse));
    renderWithProviders(<EasterEggHighlight />);

    expect(await screen.findByText("Nenhum ovo escondido")).toBeInTheDocument();
    expect(screen.queryByTestId("easter-egg-message")).not.toBeInTheDocument();
  });

  it("mostra erro e permite tentar de novo", async () => {
    const fetchMock = mockFetch(
      Response.json({ error: "Internal server error" }, { status: 500 }),
      Response.json(egg),
    );
    const { user } = renderWithProviders(<EasterEggHighlight />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("O backend não entregou o Easter egg");
    expect(alert).toHaveTextContent("Internal server error");

    await user.click(within(alert).getByRole("button", { name: "Tentar de novo" }));

    expect(await screen.findByTestId("easter-egg-message")).toHaveTextContent(egg.message);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("home (/)", () => {
  /** Responde cada rota da API pelo caminho; `easterEgg` decide o /api/easter-egg. */
  function mockHomeApi(easterEgg: () => Response) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith("/api/easter-egg")) return easterEgg();
      if (url.endsWith("/api/health")) return Response.json(healthy);
      return Response.json({ error: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("mostra o Easter egg sem interação, com a mensagem do backend", async () => {
    mockHomeApi(() => Response.json(egg));
    renderRoute("/", { session: null });

    expect(
      await screen.findByRole("heading", { level: 1, name: "🥚 Easter egg encontrado!" }),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("easter-egg-message")).toHaveTextContent(egg.message);
  });

  it("com a API do Easter egg falhando, mostra o erro sem quebrar o resto da página", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockHomeApi(() => Response.json({ error: "Internal server error" }, { status: 500 }));
    renderRoute("/", { session: null });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("O backend não entregou o Easter egg");
    expect(within(alert).getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Easter egg encontrado!");
    expect(await screen.findByText("Operacional")).toBeInTheDocument();
  });
});
