import { createServerFn } from "@tanstack/react-start";

import { validatePageLookup } from "./page-lookup";
import { loadGitPage } from "./git.server";

export const getPageFromGitServer = createServerFn({ method: "GET" })
  .validator(validatePageLookup)
  .handler(({ data }) => loadGitPage(data.slug, data.locale));
