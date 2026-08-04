import { createFileRoute } from "@tanstack/react-router";

import { RouteSkeleton } from "@/components/layout/route-skeleton";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "شرایط استفاده — مهرآرا" },
      { name: "description", content: "شرایط استفاده از مهرآرا" },
      { property: "og:title", content: "شرایط استفاده — مهرآرا" },
      { property: "og:description", content: "شرایط استفاده از مهرآرا" },
    ],
    links: [{ rel: "canonical", href: "/terms" }],
  }),
  component: TermsRoute,
});

function TermsRoute() {
  return <RouteSkeleton title="شرایط استفاده" />;
}
