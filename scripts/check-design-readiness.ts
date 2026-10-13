import process from "node:process";
import { assessDesignReadiness } from "../src/lib/design-readiness";
import { HOME_EDITORIAL_REFERENCES } from "../src/lib/home-editorial-config";
import {
  STRUCTURED_CONTENT_GENERATED,
  STRUCTURED_TRANSLATIONS_SUPPORTED,
} from "../src/lib/content/generated-structured-content";
import {
  loadCatalogVersion,
  loadPortfolioItems,
  loadProducts,
  loadSite,
} from "../src/lib/content/supabase.server";
import { loadGitPage } from "../src/lib/content/git.server";
import { PAGE_SLUGS } from "../src/lib/content/types";
import { CURRENT_TERMS_RELEASES } from "../supabase/functions/_shared/terms-registry.generated";
import { LOCALES } from "../src/lib/i18n/locale";

// Local sanitized artifacts only; this command has no database or network client.
// Guides remain blocked. Implemented translation support does not create real content.
try {
  const [catalogVersion, products, portfolioItems, site, pages] = await Promise.all([
    loadCatalogVersion(),
    Promise.all(LOCALES.map((locale) => loadProducts({ locale }))).then((lists) => lists.flat()),
    Promise.all(LOCALES.map((locale) => loadPortfolioItems({ locale }))).then((lists) =>
      lists.flat(),
    ),
    loadSite(),
    Promise.all(LOCALES.flatMap((locale) => PAGE_SLUGS.map((slug) => loadGitPage(slug, locale)))),
  ]);
  const report = assessDesignReadiness({
    generated: STRUCTURED_CONTENT_GENERATED,
    catalogVersion,
    products,
    portfolioItems,
    site,
    pages: pages.filter((page) => page !== null),
    guides: [],
    editorial: HOME_EDITORIAL_REFERENCES,
    termsReleases: CURRENT_TERMS_RELEASES,
    capabilities: { englishSources: STRUCTURED_TRANSLATIONS_SUPPORTED, guides: false },
  });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.automaticChecksPass ? 0 : 1;
} catch {
  // Avoid exposing source values through an error message or stack trace.
  console.error("Design readiness could not read the local content artifacts.");
  process.exitCode = 2;
}
