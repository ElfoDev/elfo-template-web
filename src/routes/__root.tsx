import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { AppHeader } from "@/components/layout/app-header";
import { EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { getErrorMessage } from "@/lib/api";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: () => (
    <EmptyState
      title="Página não encontrada"
      description="O endereço que você abriu não existe."
      action={
        <Button asChild variant="outline" size="sm">
          <Link to="/">Voltar ao início</Link>
        </Button>
      }
    />
  ),
  errorComponent: ({ error, reset }) => (
    <ErrorState title="Algo deu errado" message={getErrorMessage(error)} onRetry={reset} />
  ),
});

function RootLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <Toaster richColors closeButton />
    </div>
  );
}
