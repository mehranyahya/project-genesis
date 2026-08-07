import { createFileRoute, notFound } from "@tanstack/react-router";

import { GuideDetailPage, GuideError, GuidesLoading } from "@/components/guides/guides";
import { getGuide } from "@/lib/content/adapters";
import { buildGuideDetailModel } from "@/lib/guides";

export const Route = createFileRoute("/guides/$slug")({
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ name: "robots", content: "noindex" }] };
    }
    return {
      meta: [
        { title: loaderData.metaTitle },
        ...(loaderData.metaDescription
          ? [{ name: "description", content: loaderData.metaDescription }]
          : []),
      ],
      links: [{ rel: "canonical", href: loaderData.path }],
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
  return <GuideDetailPage guide={guide} />;
}
