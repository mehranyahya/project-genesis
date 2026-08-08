import { createFileRoute, notFound } from "@tanstack/react-router";

import { GuideDetailPage, GuideError, GuidesLoading } from "@/components/guides/guides";
import { canonicalHref } from "@/lib/canonical";
import { getGuide } from "@/lib/content/adapters";
import { buildGuideDetailModel } from "@/lib/guides";
import type { GuideDetailModel } from "@/lib/guides";

export const Route = createFileRoute("/guides/$slug")({
  head: (ctx) => {
    const guide = ctx.loaderData as GuideDetailModel | undefined;
    if (!guide) {
      return { meta: [{ name: "robots", content: "noindex" }] };
    }
    return {
      meta: [
        { title: guide.metaTitle },
        ...(guide.metaDescription ? [{ name: "description", content: guide.metaDescription }] : []),
      ],
      links: [{ rel: "canonical", href: canonicalHref(guide.path) }],
    };
  },
  loader: async ({ params }) => {
    const guide = buildGuideDetailModel(await getGuide(params.slug));
    if (!guide) throw notFound();
    return guide;
  },
  pendingComponent: GuidesLoading,
  errorComponent: GuideError,
  component: GuideDetailRoute,
});

function GuideDetailRoute() {
  const guide = Route.useLoaderData();
  if (!guide) return null;
  return <GuideDetailPage guide={guide} />;
}
