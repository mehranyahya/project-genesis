import { createFileRoute } from "@tanstack/react-router";

import { HomePage } from "@/components/home/home-page";
import { canonicalHref } from "@/lib/canonical";
import { getGuides, getPortfolioItems, getProducts } from "@/lib/content/adapters";
import { buildHomeViewModel } from "@/lib/home";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "سنگ مزار سفارشی و سنگ ساختمانی" },
      {
        name: "description",
        content: "انتخاب مدل سنگ مزار، مشاهدهٔ گزینه‌ها و ثبت درخواست بررسی سفارش.",
      },
      { property: "og:title", content: "سنگ مزار سفارشی و سنگ ساختمانی" },
      {
        property: "og:description",
        content: "انتخاب مدل سنگ مزار، مشاهدهٔ گزینه‌ها و ثبت درخواست بررسی سفارش.",
      },
    ],
    links: [{ rel: "canonical", href: canonicalHref("/") }],
  }),
  loader: async () => {
    const [products, portfolioItems, guides] = await Promise.all([
      getProducts({ featuredOnly: true, limit: 6 }),
      getPortfolioItems({ limit: 1 }),
      getGuides({ limit: 1 }),
    ]);
    return buildHomeViewModel({ products, portfolioItems, guides });
  },
  component: HomeRoute,
});

function HomeRoute() {
  const model = Route.useLoaderData();
  return <HomePage model={model} />;
}
