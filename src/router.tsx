import { createRouter, type RouterHistory } from "@tanstack/react-router";
import { LoadingState } from "@/components/states";
import { createQueryClient } from "@/lib/query-client";
import { routeTree } from "./routeTree.gen";

export function createAppRouter(queryClient = createQueryClient(), history?: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    context: { queryClient },
    defaultPreload: "intent",
    // Com TanStack Query cuidando do cache, o router não precisa guardar dados.
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: () => <LoadingState />,
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
