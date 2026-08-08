import { createFileRoute } from "@tanstack/react-router";

import {
  ContactDetailsList,
  ContentBlockedState,
  StaticPageView,
} from "@/components/static-pages/static-pages";
import { canonicalHref } from "@/lib/canonical";
import { getPage, getSite } from "@/lib/content/adapters";
import { buildContactPageModel, contentBlockedMeta } from "@/lib/static-pages";
import type { ContactPageModel } from "@/lib/static-pages";

export const Route = createFileRoute("/contact")({
  head: (ctx) => {
    const model = (ctx.loaderData ?? null) as ContactPageModel | null;
    const page = model?.page ?? null;
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
  loader: async (): Promise<ContactPageModel> => {
    const [page, site] = await Promise.all([getPage("contact"), getSite()]);
    return buildContactPageModel(page, site);
  },
  component: ContactRoute,
});

function ContactRoute() {
  const model = Route.useLoaderData();
  if (!model?.page) return <ContentBlockedState />;
  return (
    <StaticPageView page={model.page}>
      <ContactDetailsList entries={model.details} />
    </StaticPageView>
  );
}
