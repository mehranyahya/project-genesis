import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  COPY_BUTTON_LABEL,
  SHARE_BUTTON_LABEL,
  productShareText,
  productShareUrl,
} from "@/components/product/product-share";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shareSource = readFileSync(path.join(root, "components/product/product-share.tsx"), "utf8");
const pageSource = readFileSync(
  path.join(root, "components/product/product-detail-page.tsx"),
  "utf8",
);

test("share URL is built from the stable slug route key only", () => {
  assert.equal(
    productShareUrl("sang-a", "https://example.com"),
    "https://example.com/grave-stones/sang-a",
  );
  assert.equal(shareSource.includes("code}`"), false);
  assert.ok(!/\/grave-stones\/\$\{[^}]*code/.test(shareSource));
});

test("share text carries only title and display code", () => {
  const text = productShareText("سنگ نمونه", "MHR-001");
  assert.ok(text.includes("سنگ نمونه"));
  assert.ok(text.includes("MHR-001"));
  for (const banned of ["تومان", "قیمت", "MA-", "tracking"]) {
    assert.equal(text.includes(banned), false);
  }
});

test("browser globals are only touched inside guarded runtime code", () => {
  assert.ok(shareSource.includes('typeof window === "undefined"'));
  assert.ok(shareSource.includes('typeof navigator.share !== "function"'));
  assert.ok(shareSource.includes("navigator.clipboard.writeText"));
});

test("share actions are accessible, tokenised and mounted on the detail page", () => {
  assert.ok(shareSource.includes("min-h-11"));
  assert.ok(shareSource.includes("focus-visible:outline-2"));
  assert.ok(shareSource.includes("motion-reduce:transition-none"));
  assert.ok(shareSource.includes('aria-live="polite"'));
  assert.equal(/#[0-9a-fA-F]{3,8}\b|rgba?\(|gradient/.test(shareSource), false);
  assert.ok(pageSource.includes("<ProductShare"));
  assert.ok(SHARE_BUTTON_LABEL.length > 0 && COPY_BUTTON_LABEL.length > 0);
});

test("runtime UI carries no hardcoded temporary brand literal", () => {
  const files = [
    "components/layout/site-header.tsx",
    "components/layout/site-footer.tsx",
    "components/request-form/request-success.tsx",
    "components/portfolio/portfolio-page.tsx",
    "routes/index.tsx",
    "routes/__root.tsx",
    "routes/quote.tsx",
    "routes/grave-stones/$slug.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(path.join(root, "..", "src", file), "utf8");
    assert.equal(source.includes("مهرآرا"), false, `brand literal in ${file}`);
    assert.equal(/Mehrara/.test(source), false, `latin brand literal in ${file}`);
  }
});

test("header and footer render brand from the Site adapter", () => {
  const header = readFileSync(path.join(root, "components/layout/site-header.tsx"), "utf8");
  const footer = readFileSync(path.join(root, "components/layout/site-footer.tsx"), "utf8");
  assert.ok(header.includes("site?.displayName"));
  assert.ok(header.includes("NEUTRAL_HOME_LABEL"));
  assert.ok(footer.includes("site?.displayName"));
});
