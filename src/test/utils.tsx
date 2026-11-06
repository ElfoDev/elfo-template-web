import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { createQueryClient } from "@/lib/query-client";
import { createAppRouter } from "@/router";

/** Renderiza com QueryClient isolado (sem retry) e o Toaster montado. */
export function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return {
    user: userEvent.setup(),
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        {ui}
        <Toaster />
      </QueryClientProvider>,
    ),
  };
}

/**
 * Renderiza o app inteiro (rotas reais, layout, toasts de erro globais) a partir
 * de `path`, com histórico em memória. Bom para fluxos que navegam entre telas.
 */
export function renderRoute(path: string) {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }));

  return {
    user: userEvent.setup(),
    queryClient,
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}

/**
 * Substitui o `fetch` global. Cada chamada consome a próxima resposta da fila
 * (a última se repete). Use `Response.json(...)` para montar as respostas.
 */
export function mockFetch(...responses: Array<Response | Error>) {
  const queue = [...responses];
  const fetchMock = vi.fn(async () => {
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (!next) throw new Error("mockFetch: nenhuma resposta configurada");
    if (next instanceof Error) throw next;
    return next.clone();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
