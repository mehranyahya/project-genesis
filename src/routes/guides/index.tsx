import { createFileRoute } from "@tanstack/react-router";

import { GuidesError, GuidesListPage, GuidesLoading } from "@/components/guides/guides";
import { canonicalHref } from "@/lib/canonical";
import { getGuides } from "@/lib/content/adapters";
import { buildGuideListModel } from "@/lib/guides";

export const Route = createFileRoute("/guides/")({
  head: ({ loaderData }) => {
    const hasContent = (loaderData?.length ?? 0) > 0;
    return {
      meta: [
        { title: "راهنماها" },
        ...(hasContent ? [] : [{ name: "robots", content: "noindex" }]),
      ],
      links: [{ rel: "canonical", href: canonicalHref("/guides") }],
    };
  },
  loader: async () => buildGuideListModel(await getGuides()),
  pendingComponent: GuidesLoading,
  errorComponent: GuidesError,
  component: GuidesRoute,
});

function GuidesRoute() {
  const items = Route.useLoaderData();
  return <GuidesListPage items={items} />;
}
