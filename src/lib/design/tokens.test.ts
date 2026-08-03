import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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

const MASTER_TOKENS: Record<string, string> = {
  "--color-canvas": "#f4efe6",
  "--color-surface": "#f4efe6",
  "--color-surface-media": "#e7e1d7",
  "--color-text-primary": "#121212",
  "--color-text-secondary": "#5c5850",
  "--color-text-caption": "#6b665e",
  "--color-border-subtle": "#b9aa92",
  "--color-border-control": "#5c5850",
  "--color-action-primary": "#203b34",
  "--color-accent": "#9c6b32",
  "--color-surface-inverse": "#121212",
  "--color-text-inverse": "#f4efe6",
  "--color-focus": "#203b34",
  "--color-focus-inverse": "#f4efe6",
  "--color-status-success": "#203b34",
  "--color-status-error": "#8b2f2f",
};

test("every master token is declared with the exact master value", () => {
  const tokens = read(TOKENS).toLowerCase();
  for (const [name, value] of Object.entries(MASTER_TOKENS)) {
    assert.match(tokens, new RegExp(`${name}:\\s*${value};`), `token ${name} must equal ${value}`);
  }
});

test("raw colors live only in the token file", () => {
  const rawColor = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/;
  for (const file of [STYLE_ENTRY, ...COMPONENTS]) {
    assert.equal(rawColor.test(read(file)), false, `raw color found in ${file}`);
  }
  assert.ok(rawColor.test(read(TOKENS)));
});

test("token file declares no raw color beyond the master palette", () => {
  const allowed = new Set(Object.values(MASTER_TOKENS));
  const found =
    read(TOKENS)
      .toLowerCase()
      .match(/#[0-9a-f]{3,8}\b/g) ?? [];
  for (const hex of found) {
    assert.ok(allowed.has(hex), `unexpected raw color ${hex} in tokens`);
  }
});

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("no gradients, blur, glass or animation libraries in owned files", () => {
  const banned =
    /gradient|backdrop-filter|backdrop-blur|blur\(|tw-animate|animate-pulse|shimmer|spinner/i;
  for (const file of [TOKENS, STYLE_ENTRY, ...COMPONENTS]) {
    assert.equal(banned.test(stripComments(read(file))), false, `banned effect in ${file}`);
  }
});

test("CTA, focus, success and selected use Serpentine; bronze stays decorative", () => {
  const button = read("components/ui/button.tsx");
  assert.match(button, /bg-action-primary/);
  assert.match(button, /outline-focus/);
  assert.equal(/bg-accent|text-accent\b|hover:[a-z-]*accent/.test(button), false);

  for (const file of COMPONENTS) {
    assert.equal(/bg-accent\b/.test(read(file)), false, `interactive bronze in ${file}`);
  }

  const tokens = read(TOKENS).toLowerCase();
  const serpentine = MASTER_TOKENS["--color-action-primary"];
  assert.match(tokens, new RegExp(`--color-focus:\\s*${serpentine};`));
  assert.match(tokens, new RegExp(`--color-status-success:\\s*${serpentine};`));
});

test("button honours motion, focus, touch target and disabled contract", () => {
  const button = read("components/ui/button.tsx");
  assert.match(button, /duration-\[180ms\]/);
  assert.match(button, /focus-visible:outline-2/);
  assert.match(button, /focus-visible:outline-offset-2/);
  assert.match(button, /min-h-11/);
  assert.match(button, /disabled:opacity-45/);
  assert.match(button, /disabled:cursor-not-allowed/);
  assert.match(button, /aria-busy=\{loading \? true : undefined\}/);
  assert.match(button, /enabled:hover:/);
  assert.equal(/hover:scale|hover:shadow|animate-/.test(button), false);
});

test("field wires label, description, error and invalid state to its control", () => {
  const field = read("components/ui/field.tsx");
  assert.match(field, /htmlFor=\{id\}/);
  assert.match(field, /"aria-describedby": describedBy/);
  assert.match(field, /"aria-errormessage": errorId/);
  assert.match(field, /"aria-invalid": error \? true : undefined/);
  assert.match(field, /role="alert"/);
  assert.match(field, /role="status"/);
  assert.match(field, /aria-live="polite"/);
  // Non-color redundancy for both error and success.
  assert.ok(field.includes("خطا:"));
  assert.ok(field.includes("انجام شد:"));
});

test("typography contract: local Vazirmatn 400/700, swap, rtl-safe metrics", () => {
  const tokens = read(TOKENS);
  assert.ok(tokens.includes("/fonts/vazirmatn-400.woff2"));
  assert.ok(tokens.includes("/fonts/vazirmatn-700.woff2"));
  assert.equal((tokens.match(/font-display: swap/g) ?? []).length, 2);
  assert.equal(/https?:\/\//.test(tokens), false);
  assert.match(tokens, /--line-height-body:\s*1\.9;/);

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

test("bootstrap font assets are unchanged", () => {
  const expected: Record<string, string> = {
    "vazirmatn-400.woff2": "f1a8a3fb82ff53a798e5ced93c0925b8805c62c471d11e80706b39f50da55fb0",
    "vazirmatn-700.woff2": "adf931716e9c1b8ff82c74ddf5826dc158a932e0e43b0d8b30db085078693c47",
    "OFL.txt": "17e355067c8284f47743a1ee3b1ef7ff684ff0601eda357f9353b10b3016ab31",
  };
  for (const [file, sha] of Object.entries(expected)) {
    const bytes = readFileSync(path.join(root, "..", "public", "fonts", file));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), sha, `${file} changed`);
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
