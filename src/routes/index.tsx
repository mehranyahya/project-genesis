import { createFileRoute } from "@tanstack/react-router";

import { HomePage } from "@/components/home/home-page";
import { getGuides, getPortfolioItems, getProducts } from "@/lib/content/adapters";
import { buildHomeViewModel } from "@/lib/home";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "مهرآرا" },
      { name: "description", content: "فروشگاه سفارش‌محور سنگ مزار مهرآرا" },
      { property: "og:title", content: "مهرآرا" },
      { property: "og:description", content: "فروشگاه سفارش‌محور سنگ مزار مهرآرا" },
    ],
    links: [{ rel: "canonical", href: "/" }],
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
