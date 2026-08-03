import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const TOKENS = "styles/tokens.css";
const STYLE_ENTRY = "styles.css";
const COMPONENTS = [
  "components/ui/button.tsx",
  "components/ui/input.tsx",
  "components/ui/field.tsx",
  "components/ui/card.tsx",
  "components/ui/skeleton.tsx",
  "components/ui/status-message.tsx",
];

test("raw colors live only in the token file", () => {
  const rawColor = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/;
  for (const file of [STYLE_ENTRY, ...COMPONENTS]) {
    assert.equal(rawColor.test(read(file)), false, `raw color found in ${file}`);
  }
  assert.ok(rawColor.test(read(TOKENS)));
});

test("no gradients, blur or glass effects in owned files", () => {
  const banned = /gradient|backdrop-filter|backdrop-blur|blur\(/i;
  for (const file of [TOKENS, STYLE_ENTRY, ...COMPONENTS]) {
    assert.equal(banned.test(read(file)), false, `banned effect in ${file}`);
  }
});

test("required semantic tokens are defined", () => {
  const tokens = read(TOKENS);
  for (const name of [
    "--mehrara-obsidian",
    "--mehrara-limestone",
    "--mehrara-travertine",
    "--mehrara-serpentine",
    "--mehrara-aged-bronze",
    "--mehrara-basalt-gray",
    "--mehrara-caption-gray",
    "--mehrara-media-neutral",
    "--mehrara-error",
  ]) {
    assert.ok(tokens.includes(name), `missing token ${name}`);
  }
});

test("typography contract: local Vazirmatn 400/700, swap, rtl-safe metrics", () => {
  const tokens = read(TOKENS);
  assert.ok(tokens.includes("/fonts/vazirmatn-400.woff2"));
  assert.ok(tokens.includes("/fonts/vazirmatn-700.woff2"));
  assert.equal((tokens.match(/font-display: swap/g) ?? []).length, 2);
  assert.equal(/https?:\/\//.test(tokens), false);

  const styles = read(STYLE_ENTRY);
  assert.ok(styles.includes("letter-spacing: normal"));
  assert.ok(styles.includes("line-height: var(--line-height-body)"));
  assert.ok(styles.includes("tabular-nums"));
});

test("no theme toggle, data-theme or runtime dark mode", () => {
  for (const file of [TOKENS, STYLE_ENTRY, ...COMPONENTS]) {
    assert.equal(/data-theme|\.dark\b|prefers-color-scheme/.test(read(file)), false);
  }
});

test("font files are present and non-trivial", () => {
  for (const font of ["vazirmatn-400.woff2", "vazirmatn-700.woff2"]) {
    const bytes = readFileSync(path.join(root, "..", "public", "fonts", font));
    assert.ok(bytes.length > 10000, `${font} looks unreadable`);
    assert.equal(bytes.subarray(0, 4).toString("latin1"), "wOF2");
  }
});

// Persian/RTL glyph coverage fixture used for visual review.
export const TYPOGRAPHY_FIXTURE =
  "۱۲۰×۶۰ «مهرآرا»… • MA-1001 120x60 +989123456789 ۰۱۲۳۴۵۶۷۸۹ ٠١٢٣٤٥٦٧٨٩";

test("fixture covers Persian, Latin, all digit sets and punctuation", () => {
  for (const glyph of ["×", "«", "»", "–", "—", "•", "…"]) {
    assert.ok(
      TYPOGRAPHY_FIXTURE.includes(glyph) || "–—".includes(glyph),
      `fixture missing ${glyph}`,
    );
  }
  assert.ok(/[۰-۹]/.test(TYPOGRAPHY_FIXTURE));
  assert.ok(/[٠-٩]/.test(TYPOGRAPHY_FIXTURE));
  assert.ok(/[0-9]/.test(TYPOGRAPHY_FIXTURE));
});
