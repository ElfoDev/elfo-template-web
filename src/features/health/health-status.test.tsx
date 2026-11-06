import type { HealthResponse } from "@shared/health";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockFetch, renderWithProviders } from "@/test/utils";
import { HealthStatus } from "./health-status";

const healthy: HealthResponse = {
  status: "ok",
  app: "Elfo Web",
  timestamp: "2026-01-01T12:00:00.000Z",
  services: [],
};

describe("<HealthStatus />", () => {
  it("mostra o carregamento e depois os dados da API", async () => {
    const fetchMock = mockFetch(Response.json(healthy));
    renderWithProviders(<HealthStatus />);

    expect(screen.getByRole("status")).toHaveTextContent("Verificando a API…");
    expect(await screen.findByText("Operacional")).toBeInTheDocument();
    expect(screen.getByTestId("health-app")).toHaveTextContent("Elfo Web");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/health$/),
      expect.anything(),
    );
  });

  it("mostra o estado vazio quando não há serviços", async () => {
    mockFetch(Response.json(healthy));
    renderWithProviders(<HealthStatus />);

    expect(await screen.findByText("Nenhum serviço conectado")).toBeInTheDocument();
  });

  it("lista os serviços quando existem", async () => {
    mockFetch(
      Response.json({
        ...healthy,
        status: "degraded",
        services: [{ name: "database", status: "down" }],
      } satisfies HealthResponse),
    );
    renderWithProviders(<HealthStatus />);

    expect(await screen.findByText("database")).toBeInTheDocument();
    expect(screen.getByText("Fora do ar")).toBeInTheDocument();
    expect(screen.queryByText("Nenhum serviço conectado")).not.toBeInTheDocument();
  });

  it("mostra erro e permite tentar de novo", async () => {
    const fetchMock = mockFetch(
      Response.json({ error: "Internal server error" }, { status: 500 }),
      Response.json(healthy),
    );
    const { user } = renderWithProviders(<HealthStatus />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Internal server error");

    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));

    expect(await screen.findByText("Operacional")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("avisa com toast quando a atualização dá certo", async () => {
    mockFetch(Response.json(healthy));
    const { user } = renderWithProviders(<HealthStatus />);
    await screen.findByText("Operacional");

    await user.click(screen.getByRole("button", { name: "Atualizar" }));

    expect(await screen.findByText("API respondeu normalmente.")).toBeInTheDocument();
  });
});
