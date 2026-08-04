import { createFileRoute } from "@tanstack/react-router";

import { GraveStoneListPage } from "@/components/grave-stones/grave-stone-list-page";
import {
  GraveStoneListError,
  GraveStoneListLoading,
} from "@/components/grave-stones/grave-stone-list-states";
import { getProducts } from "@/lib/content/adapters";
import { buildGraveStoneListModel } from "@/lib/grave-stone-list";

export const Route = createFileRoute("/grave-stones/")({
  head: () => ({
    meta: [
      { title: "سنگ مزار — مهرآرا" },
      { name: "description", content: "فهرست سنگ مزار مهرآرا" },
      { property: "og:title", content: "سنگ مزار — مهرآرا" },
      { property: "og:description", content: "فهرست سنگ مزار مهرآرا" },
    ],
    links: [{ rel: "canonical", href: "/grave-stones" }],
  }),
  loader: async () => buildGraveStoneListModel(await getProducts()),
  pendingComponent: GraveStoneListLoading,
  errorComponent: GraveStoneListError,
  component: GraveStonesRoute,
});

function GraveStonesRoute() {
  const model = Route.useLoaderData();
  return <GraveStoneListPage model={model} />;
}
