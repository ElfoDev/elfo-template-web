import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sessionQueryKey } from "@/features/auth/api";
import { DetailedError, getErrorMessage } from "./api";

/**
 * Erros de queries e mutations viram toast automaticamente. Para silenciar em
 * um caso específico, passe `meta: { silent: true }` na query/mutation.
 */
export function createQueryClient() {
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        // 401 da API = a sessão acabou (expirou, logout em outra aba): zera a
        // sessão no cache e as rotas protegidas mandam para o login.
        if (error instanceof DetailedError && error.statusCode === 401) {
          queryClient.setQueryData(sessionQueryKey, null);
        }
        if (query.meta?.silent) return;
        toast.error(getErrorMessage(error), { id: `query-error-${query.queryHash}` });
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.silent) return;
        toast.error(getErrorMessage(error));
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) =>
          // Erros 4xx não melhoram tentando de novo (401, 404, 400…).
          !(error instanceof DetailedError && Number(error.statusCode) < 500) && failureCount < 1,
      },
    },
  });
  return queryClient;
}

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: { silent?: boolean };
    mutationMeta: { silent?: boolean };
  }
}
