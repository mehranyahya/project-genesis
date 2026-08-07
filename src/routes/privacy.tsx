import { createFileRoute } from "@tanstack/react-router";

import { ContentBlockedState, StaticPageView } from "@/components/static-pages/static-pages";
import { getPage } from "@/lib/content/adapters";
import { buildStaticPageModel, contentBlockedMeta } from "@/lib/static-pages";
import type { StaticPageModel } from "@/lib/static-pages";

export const Route = createFileRoute("/privacy")({
  head: (ctx) => {
    const page = (ctx.loaderData ?? null) as StaticPageModel | null;
    if (!page) return { meta: contentBlockedMeta() };
    return {
      meta: [
        { title: page.metaTitle },
        ...(page.metaDescription ? [{ name: "description", content: page.metaDescription }] : []),
        ...(page.robots ? [{ name: "robots", content: page.robots }] : []),
      ],
      links: page.canonicalPath ? [{ rel: "canonical", href: page.canonicalPath }] : [],
    };
  },
  loader: async () => buildStaticPageModel(await getPage("privacy"), "privacy"),
  component: PrivacyRoute,
});

function PrivacyRoute() {
  const page = Route.useLoaderData() ?? null;
  return page ? <StaticPageView page={page} /> : <ContentBlockedState />;
}
