import { createServerFn } from "@tanstack/react-start";

import type { PageSlug } from "./types";
import { PAGE_SLUGS } from "./types";
import { loadGitPage } from "./git.server";

const PAGE_SLUG_SET = new Set<PageSlug>(PAGE_SLUGS);

function validatePageSlug(input: unknown): PageSlug {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Invalid page lookup");
  }
  const slug = (input as { slug?: unknown }).slug;
  if (typeof slug !== "string" || !PAGE_SLUG_SET.has(slug as PageSlug)) {
    throw new Error("Invalid page slug");
  }
  return slug as PageSlug;
}

export const getPageFromGitServer = createServerFn({ method: "GET" })
  .validator(validatePageSlug)
  .handler(({ data }) => loadGitPage(data));
