import { createFileRoute } from "@tanstack/react-router";

import { BuildingStonePage } from "@/components/building-stone/building-stone-page";
import { canonicalHref } from "@/lib/canonical";
import { getSite } from "@/lib/content/adapters";
import { getRequestTermsDocument } from "@/lib/request-terms";

export const Route = createFileRoute("/building-stone")({
  loader: async () => {
    const [site, termsDocument] = await Promise.all([getSite(), getRequestTermsDocument()]);
    return {
      site: site ?? null,
      termsDocument,
    };
  },
  head: () => ({
    meta: [
      { title: "سنگ ساختمانی" },
      { name: "description", content: "ثبت درخواست بررسی سنگ ساختمانی" },
      { property: "og:title", content: "سنگ ساختمانی" },
      { property: "og:description", content: "ثبت درخواست بررسی سنگ ساختمانی" },
    ],
    links: [{ rel: "canonical", href: canonicalHref("/building-stone") }],
  }),
  component: BuildingStoneRoute,
});

function BuildingStoneRoute() {
  const { site, termsDocument } = Route.useLoaderData();
  return <BuildingStonePage site={site} termsDocument={termsDocument} />;
}
