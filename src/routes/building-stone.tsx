import { createFileRoute } from "@tanstack/react-router";

import { BuildingStonePage } from "@/components/building-stone/building-stone-page";
import { getPage, getSite } from "@/lib/content/adapters";
import { requestTermsDocumentFromPage } from "@/lib/request-terms";

export const Route = createFileRoute("/building-stone")({
  loader: async () => {
    const [site, termsPage] = await Promise.all([getSite(), getPage("terms")]);
    return {
      site: site ?? null,
      termsDocument: requestTermsDocumentFromPage(termsPage),
    };
  },
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
  const { site, termsDocument } = Route.useLoaderData();
  return <BuildingStonePage site={site} termsDocument={termsDocument} />;
}
