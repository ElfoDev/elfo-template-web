import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { sessionQueryOptions } from "@/features/auth/api";

/**
 * Layout (sem segmento na URL) das rotas que exigem login: tudo dentro de
 * src/routes/_authenticated/ só abre com sessão. Sem sessão, vai para /login e
 * volta para a página pedida depois de entrar.
 */
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  // A sessão pode acabar com a página aberta (sessão expirada ou logout em
  // outra aba: a API responde 401 e o QueryClient zera a sessão no cache).
  const session = useQuery(sessionQueryOptions());
  const loggedOut = session.data === null;
  const router = useRouter();

  useEffect(() => {
    if (!loggedOut) return;
    // Lê a URL só aqui (não a cada render): durante a navegação ela já muda
    // para /login, e o destino tem que ser a página em que a pessoa estava.
    const redirectTo = router.state.location.href;
    void router.navigate({ to: "/login", search: { redirect: redirectTo }, replace: true });
  }, [loggedOut, router]);

  return loggedOut ? null : <Outlet />;
}
