import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
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
  "--color-canvas": "#f3f1eb",
  "--color-surface": "#fcfbf8",
  "--color-surface-media": "#f2f2f0",
  "--color-text-primary": "#171918",
  "--color-text-secondary": "#5c605b",
  "--color-text-caption": "#6b706a",
  "--color-border-subtle": "#d8d3c9",
  "--color-border-control": "#6b706a",
  "--color-action-primary": "#173f3a",
  "--color-accent": "#8f4c2f",
  "--color-surface-inverse": "#111413",
  "--color-text-inverse": "#fcfbf8",
  "--color-focus": "#173f3a",
  "--color-focus-inverse": "#fcfbf8",
  "--color-status-success": "#173f3a",
  "--color-status-error": "#8f4c2f",
};

const APPROVED_PRIMITIVES = [
  "#f3f1eb",
  "#fcfbf8",
  "#f2f2f0",
  "#171918",
  "#5c605b",
  "#d8d3c9",
  "#6b706a",
  "#173f3a",
  "#8f4c2f",
  "#111413",
];

const RUNTIME_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".js", ".jsx"]);

/** Every runtime source file under src/, excluding tests and test fixtures. */
const runtimeFiles = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const abs = path.join(dir, entry);
      if (statSync(abs).isDirectory()) {
        if (entry === "node_modules" || entry === "__fixtures__" || entry === "fixtures") continue;
        walk(abs);
        continue;
      }
      if (!RUNTIME_EXTENSIONS.has(path.extname(entry))) continue;
      if (/\.(test|spec)\./.test(entry) || /\.fixture\./.test(entry)) continue;
      out.push(path.relative(root, abs));
    }
  };
  walk(root);
  return out;
};

/** Strips comments only. Strings and inline styles stay in scope. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("every master token is declared with the exact V23.3 value", () => {
  const tokens = read(TOKENS).toLowerCase();
  for (const [name, value] of Object.entries(MASTER_TOKENS)) {
    assert.match(tokens, new RegExp(`${name}:\\s*${value};`), `token ${name} must equal ${value}`);
  }
});

test("recursive runtime scan finds zero raw colors outside tokens.css", () => {
  const rawColor = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/;
  const offenders = runtimeFiles()
    .filter((rel) => rel !== TOKENS)
    .filter((rel) => rawColor.test(stripComments(read(rel))));
  assert.deepEqual(offenders, [], `raw color found in: ${offenders.join(", ")}`);
  assert.ok(rawColor.test(read(TOKENS)));
});

test("token file declares only the approved primitive palette and Mineral Glass alpha", () => {
  const tokenSource = read(TOKENS).toLowerCase();
  const foundHex = tokenSource.match(/#[0-9a-f]{3,8}\b/g) ?? [];
  const allowed = new Set(APPROVED_PRIMITIVES);
  for (const hex of foundHex) {
    assert.ok(allowed.has(hex), `unexpected raw color ${hex} in tokens`);
  }
  assert.deepEqual([...new Set(foundHex)].sort(), [...allowed].sort());
  assert.match(tokenSource, /rgba\(252, 251, 248, 0\.88\)/);
  assert.match(tokenSource, /rgba\(252, 251, 248, 0\.96\)/);
});

test("effects stay quiet and Mineral Glass is restricted to approved floating surfaces", () => {
  const banned = /gradient|tw-animate|animate-pulse|shimmer|spinner|parallax/i;
  const offenders = runtimeFiles().filter((rel) => banned.test(stripComments(read(rel))));
  assert.deepEqual(offenders, [], `banned effect in: ${offenders.join(", ")}`);

  const glassImplementationOffenders = runtimeFiles()
    .filter((rel) => rel !== TOKENS && rel !== STYLE_ENTRY)
    .filter((rel) => /backdrop-filter|backdrop-blur|blur\(/i.test(stripComments(read(rel))));
  assert.deepEqual(
    glassImplementationOffenders,
    [],
    `glass implementation escaped style entry: ${glassImplementationOffenders.join(", ")}`,
  );

  const styles = stripComments(read(STYLE_ENTRY));
  assert.match(styles, /\.mineral-glass\s*\{/);
  assert.match(styles, /backdrop-filter:\s*blur\(var\(--mineral-glass-blur\)\)/);

  const glassConsumers = runtimeFiles()
    .filter((rel) => rel !== TOKENS && rel !== STYLE_ENTRY)
    .filter((rel) => /mineral-glass/.test(stripComments(read(rel))))
    .sort();
  assert.deepEqual(glassConsumers, [
    "components/layout/app-shell.tsx",
    "components/layout/site-header.tsx",
  ]);
});

test("accent aliases keep interactive green separate from the oxidative accent", () => {
  const tokens = stripComments(read(TOKENS));
  assert.match(tokens, /--accent:\s*var\(--color-action-primary\);/);
  assert.match(tokens, /--accent-foreground:\s*var\(--color-text-inverse\);/);
  assert.match(tokens, /--decorative-accent:\s*var\(--color-accent\);/);

  const styles = stripComments(read(STYLE_ENTRY));
  assert.match(styles, /--color-decorative-accent:\s*var\(--decorative-accent\);/);
  assert.match(styles, /--color-sidebar-accent:\s*var\(--color-action-primary\);/);
  assert.match(styles, /--color-sidebar-accent-foreground:\s*var\(--color-text-inverse\);/);

  const resolve = (name: string, seen = new Set<string>()): string => {
    if (seen.has(name)) return name;
    seen.add(name);
    const source = `${tokens}\n${styles}`;
    const match = source.match(new RegExp(`${name}:\\s*([^;]+);`));
    const value = match?.[1]?.trim() ?? "";
    const ref = value.match(/^var\((--[a-z0-9-]+)\)$/);
    return ref?.[1] ? resolve(ref[1], seen) : value.toLowerCase();
  };
  assert.equal(resolve("--accent"), MASTER_TOKENS["--color-action-primary"]);
  assert.equal(resolve("--color-sidebar-accent"), MASTER_TOKENS["--color-action-primary"]);
  assert.equal(resolve("--color-sidebar-accent-foreground"), MASTER_TOKENS["--color-text-inverse"]);
  assert.equal(resolve("--decorative-accent"), MASTER_TOKENS["--color-accent"]);
});

test("CTA, focus and success use the action green; the oxidative accent stays decorative", () => {
  const button = read("components/ui/button.tsx");
  assert.match(button, /bg-action-primary/);
  assert.match(button, /outline-focus/);
  assert.equal(/bg-accent|text-accent\b|hover:[a-z-]*accent/.test(button), false);

  for (const file of COMPONENTS) {
    assert.equal(/bg-accent\b/.test(read(file)), false, `interactive accent in ${file}`);
  }

  const tokens = read(TOKENS).toLowerCase();
  const actionGreen = MASTER_TOKENS["--color-action-primary"];
  assert.match(tokens, new RegExp(`--color-focus:\\s*${actionGreen};`));
  assert.match(tokens, new RegExp(`--color-status-success:\\s*${actionGreen};`));
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
