import { createServerFn } from "@tanstack/react-start";

import { validatePageLookup } from "./page-lookup";
import { loadGitPage } from "./git.server";
import { validateGuideLookup, validateGuideQuery } from "./guide-lookup";
import { loadGitGuide, loadGitGuides } from "./guides.server";

export const getPageFromGitServer = createServerFn({ method: "GET" })
  .validator(validatePageLookup)
  .handler(({ data }) => loadGitPage(data.slug, data.locale));

export const getGuidesFromGitServer = createServerFn({ method: "GET" })
  .validator(validateGuideQuery)
  .handler(({ data }) => loadGitGuides(data));

export const getGuideFromGitServer = createServerFn({ method: "GET" })
  .validator(validateGuideLookup)
  .handler(({ data }) => loadGitGuide(data.slug, data.locale));
