import process from "node:process";
import { assessDesignReadiness } from "../src/lib/design-readiness";
import { HOME_EDITORIAL_REFERENCES } from "../src/lib/home-editorial-config";
import { STRUCTURED_CONTENT_GENERATED } from "../src/lib/content/generated-structured-content";
import {
  loadCatalogVersion,
  loadPortfolioItems,
  loadProducts,
  loadSite,
} from "../src/lib/content/supabase.server";
import { loadGitPage } from "../src/lib/content/git.server";
import { PAGE_SLUGS } from "../src/lib/content/types";
import { CURRENT_TERMS_RELEASE } from "../supabase/functions/_shared/terms-registry.generated";

// Local sanitized artifacts only; this command has no database or network client.
// Guides and translated source ingestion remain blocked in the current adapters.
try {
  const [catalogVersion, products, portfolioItems, site, pages] = await Promise.all([
    loadCatalogVersion(),
    loadProducts(),
    loadPortfolioItems(),
    loadSite(),
    Promise.all(PAGE_SLUGS.map((slug) => loadGitPage(slug))),
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
    termsRelease: CURRENT_TERMS_RELEASE,
    capabilities: { englishSources: false, guides: false },
  });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.automaticChecksPass ? 0 : 1;
} catch {
  // Avoid exposing source values through an error message or stack trace.
  console.error("Design readiness could not read the local content artifacts.");
  process.exitCode = 2;
}
