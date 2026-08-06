import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import type { startInstance } from "./start";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};

declare module "@tanstack/react-start" {
  interface Register {
    ssr: true;
    router: Awaited<ReturnType<typeof getRouter>>;
    config: Awaited<ReturnType<typeof startInstance.getOptions>>;
  }
}
