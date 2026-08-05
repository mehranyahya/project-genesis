import { test } from "node:test";
import assert from "node:assert/strict";

import type { PortfolioItem } from "./content/types";
import {
  PORTFOLIO_REFERENCE_PATTERN,
  buildQuoteReferralPath,
  findPortfolioReference,
  normalizePortfolioReference,
} from "./portfolio-reference";

const items = [
  { publicReferenceId: "pf-1001" },
  { publicReferenceId: "pf-20304" },
] as unknown as readonly PortfolioItem[];

test("1 the public pattern accepts only pf- plus four or more digits", () => {
  assert.equal(PORTFOLIO_REFERENCE_PATTERN.source, "^pf-[0-9]{4,}$");
  assert.ok(PORTFOLIO_REFERENCE_PATTERN.test("pf-1001"));
  assert.ok(PORTFOLIO_REFERENCE_PATTERN.test("pf-1234567"));
  assert.ok(!PORTFOLIO_REFERENCE_PATTERN.test("pf-100"));
  assert.ok(!PORTFOLIO_REFERENCE_PATTERN.test("PF-1001"));
  assert.ok(!PORTFOLIO_REFERENCE_PATTERN.test("pf-10a1"));
});

test("2 normalization trims and rejects every non-conforming value", () => {
  assert.equal(normalizePortfolioReference("  pf-1001  "), "pf-1001");
  for (const bad of ["", "pf-", "pf-99", "quote", 1001, null, undefined, {}, ["pf-1001"]]) {
    assert.equal(normalizePortfolioReference(bad), null);
  }
});

test("3 only an exact adapter reference is accepted", () => {
  assert.equal(findPortfolioReference(items, "pf-1001"), "pf-1001");
  assert.equal(findPortfolioReference(items, " pf-20304 "), "pf-20304");
  assert.equal(findPortfolioReference(items, "pf-9999"), null);
  assert.equal(findPortfolioReference([], "pf-1001"), null);
  assert.equal(findPortfolioReference(null, "pf-1001"), null);
});

test("4 the referral path is the single allowed destination and is encoded", () => {
  assert.equal(
    buildQuoteReferralPath("pf-1001"),
    "/quote?source=portfolio&reference=pf-1001",
  );
  assert.equal(buildQuoteReferralPath("pf-99"), null);
});

test("5 caption, media key and free text never reach the referral path", () => {
  for (const bad of ["نمونهٔ ۱", "media/stone-1.webp", "pf-1001&note=x", "pf-1001 caption"]) {
    assert.equal(buildQuoteReferralPath(bad), null);
    assert.equal(findPortfolioReference(items, bad), null);
  }
});
