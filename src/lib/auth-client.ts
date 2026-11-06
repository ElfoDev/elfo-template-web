import { createAuthClient } from "better-auth/client";

/**
 * Cliente do Better Auth (endpoints em /api/auth/*, mesma origem do app: o
 * cookie de sessão vai junto sozinho). Use pelos hooks de
 * src/features/auth/api.ts, que integram com o TanStack Query.
 */
export const authClient = createAuthClient({
  basePath: "/api/auth",
  fetchOptions: {
    // Resolve o `fetch` global a cada chamada (e não uma vez, ao criar o
    // cliente): assim os testes conseguem substituí-lo com `vi.stubGlobal`.
    customFetchImpl: (input, init) => fetch(input, init),
  },
});

export type Session = typeof authClient.$Infer.Session;
