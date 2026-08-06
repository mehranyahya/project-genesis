import { createFileRoute } from "@tanstack/react-router";

import { BuildingStonePage } from "@/components/building-stone/building-stone-page";
import { getSite } from "@/lib/content/adapters";

export const Route = createFileRoute("/building-stone")({
  loader: async () => ({ site: (await getSite()) ?? null }),
  head: () => ({
    meta: [
      { title: "سنگ ساختمانی — مهرآرا" },
      { name: "description", content: "درخواست بررسی سنگ ساختمانی مهرآرا" },
      { property: "og:title", content: "سنگ ساختمانی — مهرآرا" },
      { property: "og:description", content: "درخواست بررسی سنگ ساختمانی مهرآرا" },
    ],
    links: [{ rel: "canonical", href: "/building-stone" }],
  }),
  component: BuildingStoneRoute,
});

function BuildingStoneRoute() {
  const { site } = Route.useLoaderData();
  return <BuildingStonePage site={site} />;
}
