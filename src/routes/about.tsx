import { createFileRoute } from "@tanstack/react-router";

import { RouteSkeleton } from "@/components/layout/route-skeleton";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "درباره مهرآرا" },
      { name: "description", content: "معرفی مهرآرا" },
      { property: "og:title", content: "درباره مهرآرا" },
      { property: "og:description", content: "معرفی مهرآرا" },
    ],
    links: [{ rel: "canonical", href: "/about" }],
  }),
  component: AboutRoute,
});

function AboutRoute() {
  return <RouteSkeleton title="درباره مهرآرا" />;
}
