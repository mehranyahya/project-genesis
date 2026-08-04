import { createFileRoute } from "@tanstack/react-router";

import { RouteSkeleton } from "@/components/layout/route-skeleton";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "تماس با مهرآرا" },
      { name: "description", content: "راه‌های ارتباط با مهرآرا" },
      { property: "og:title", content: "تماس با مهرآرا" },
      { property: "og:description", content: "راه‌های ارتباط با مهرآرا" },
    ],
    links: [{ rel: "canonical", href: "/contact" }],
  }),
  component: ContactRoute,
});

function ContactRoute() {
  return <RouteSkeleton title="تماس با مهرآرا" />;
}
