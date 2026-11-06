import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { sessionQueryKey } from "@/features/auth/api";
import type { Session } from "@/lib/auth-client";
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

/** Sessão falsa de um usuário logado (para `renderRoute`). */
export function makeSession(user: Partial<Session["user"]> = {}): Session {
  const now = new Date("2026-01-01T12:00:00.000Z");
  const userId = user.id ?? "user-1";
  return {
    user: {
      id: userId,
      name: "Ana Souza",
      email: "ana@exemplo.com",
      emailVerified: false,
      image: null,
      createdAt: now,
      updatedAt: now,
      ...user,
    },
    session: {
      id: "session-1",
      userId,
      token: "token",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      createdAt: now,
      updatedAt: now,
    },
  };
}

/**
 * Renderiza o app inteiro (rotas reais, layout, toasts de erro globais) a partir
 * de `path`, com histórico em memória. Bom para fluxos que navegam entre telas.
 *
 * `session`: quem está logado (padrão: `makeSession()`; `null` = ninguém). Fica
 * no cache do Query, então o guard e o menu não chamam /api/auth/get-session.
 */
export function renderRoute(
  path: string,
  { session = makeSession() }: { session?: Session | null } = {},
) {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  queryClient.setQueryData(sessionQueryKey, session);
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
