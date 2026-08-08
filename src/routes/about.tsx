import { createFileRoute } from "@tanstack/react-router";

import { ContentBlockedState, StaticPageView } from "@/components/static-pages/static-pages";
import { canonicalHref } from "@/lib/canonical";
import { getPage } from "@/lib/content/adapters";
import { buildStaticPageModel, contentBlockedMeta } from "@/lib/static-pages";
import type { StaticPageModel } from "@/lib/static-pages";

export const Route = createFileRoute("/about")({
  head: (ctx) => {
    const page = (ctx.loaderData ?? null) as StaticPageModel | null;
    if (!page) return { meta: contentBlockedMeta() };
    return {
      meta: [
        { title: page.metaTitle },
        ...(page.metaDescription ? [{ name: "description", content: page.metaDescription }] : []),
        ...(page.robots ? [{ name: "robots", content: page.robots }] : []),
      ],
      links: page.canonicalPath
        ? [{ rel: "canonical", href: canonicalHref(page.canonicalPath) }]
        : [],
    };
  },
  loader: async () => buildStaticPageModel(await getPage("about"), "about"),
  component: AboutRoute,
});

function AboutRoute() {
  const page = Route.useLoaderData() ?? null;
  return page ? <StaticPageView page={page} /> : <ContentBlockedState />;
}
