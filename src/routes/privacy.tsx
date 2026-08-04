import { createFileRoute } from "@tanstack/react-router";

import { RouteSkeleton } from "@/components/layout/route-skeleton";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "حریم خصوصی — مهرآرا" },
      { name: "description", content: "سیاست حریم خصوصی مهرآرا" },
      { property: "og:title", content: "حریم خصوصی — مهرآرا" },
      { property: "og:description", content: "سیاست حریم خصوصی مهرآرا" },
    ],
    links: [{ rel: "canonical", href: "/privacy" }],
  }),
  component: PrivacyRoute,
});

function PrivacyRoute() {
  return <RouteSkeleton title="حریم خصوصی" />;
}
