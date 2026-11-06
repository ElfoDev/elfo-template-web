import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getErrorMessage } from "./api";

/**
 * Erros de queries e mutations viram toast automaticamente. Para silenciar em
 * um caso específico, passe `meta: { silent: true }` na query/mutation.
 */
export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
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
        retry: 1,
      },
    },
  });
}

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: { silent?: boolean };
    mutationMeta: { silent?: boolean };
  }
}
