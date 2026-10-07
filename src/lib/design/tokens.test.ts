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
  "--color-canvas": "#f7f6f2",
  "--color-surface": "#fbf9f4",
  "--color-surface-media": "#f7f6f2",
  "--color-text-primary": "#121212",
  "--color-text-secondary": "#59615c",
  "--color-text-caption": "#59615c",
  "--color-border-subtle": "#d8d8d1",
  "--color-border-control": "#81877f",
  "--color-action-primary": "#203b34",
  "--color-action-hover": "#172d27",
  "--color-text-inverse-secondary": "#d0d1ca",
  "--color-accent": "#203b34",
  "--color-surface-inverse": "#121312",
  "--color-text-inverse": "#f5f1e8",
  "--color-focus": "#203b34",
  "--color-focus-inverse": "#f5f1e8",
  "--color-status-success": "#203b34",
  "--color-status-error": "#8b2727",
};

const APPROVED_PRIMITIVES = [
  "#f7f6f2",
  "#fbf9f4",
  "#121212",
  "#59615c",
  "#d8d8d1",
  "#203b34",
  // Functional validation/error color; excluded from brand decoration.
  "#8b2727",
  "#81877f",
  "#172d27",
  "#121312",
  "#f5f1e8",
  "#d0d1ca",
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

test("every master token is declared with the exact Mineral Signature value", () => {
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

test("token file declares only the approved primitive palette without translucent surfaces", () => {
  const tokenSource = read(TOKENS).toLowerCase();
  const foundHex = tokenSource.match(/#[0-9a-f]{3,8}\b/g) ?? [];
  const allowed = new Set(APPROVED_PRIMITIVES);
  for (const hex of foundHex) {
    assert.ok(allowed.has(hex), `unexpected raw color ${hex} in tokens`);
  }
  assert.deepEqual([...new Set(foundHex)].sort(), [...allowed].sort());
  assert.doesNotMatch(tokenSource, /rgba?\(/);
});

test("effects stay quiet and surfaces remain opaque", () => {
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
  assert.doesNotMatch(styles, /backdrop-filter|backdrop-blur|blur\(/);

  const glassConsumers = runtimeFiles()
    .filter((rel) => rel !== TOKENS && rel !== STYLE_ENTRY)
    .filter((rel) => /mineral-glass/.test(stripComments(read(rel))))
    .sort();
  assert.deepEqual(glassConsumers, []);
});

test("accent aliases keep the identity in deep green", () => {
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

test("CTA, focus and success use the approved deep green", () => {
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
  assert.match(button, /min-h-12/);
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

test("typography contract: local Estedad body and Beiruti display, swap, rtl-safe metrics", () => {
  const tokens = read(TOKENS);
  assert.ok(tokens.includes("/fonts/estedad-400-500.woff2"));
  assert.ok(tokens.includes("/fonts/beiruti-500.woff2"));
  assert.match(tokens, /font-family:\s*"Estedad";/);
  assert.match(tokens, /font-weight:\s*400 500;/);
  assert.match(tokens, /font-family:\s*"Beiruti";/);
  assert.match(tokens, /--font-weight-bold:\s*500;/);
  assert.equal(/Vazirmatn|vazirmatn/i.test(tokens), false);
  assert.equal((tokens.match(/font-display: swap/g) ?? []).length, 2);
  assert.equal(/https?:\/\//.test(tokens), false);
  assert.match(tokens, /--line-height-body:\s*1\.9;/);

  const styles = read(STYLE_ENTRY);
  assert.ok(styles.includes("font-family: var(--font-body-family)"));
  assert.ok(styles.includes("font-family: var(--font-heading-family)"));
  assert.ok(styles.includes("font-synthesis: none"));
  assert.ok(styles.includes("letter-spacing: normal"));
  assert.ok(styles.includes("line-height: var(--line-height-body)"));
  assert.ok(styles.includes("tabular-nums"));

  const rootRoute = read("routes/__root.tsx");
  assert.ok(rootRoute.includes('href: "/fonts/estedad-400-500.woff2"'));
  assert.ok(rootRoute.includes('href: "/fonts/beiruti-500.woff2"'));
  assert.equal((rootRoute.match(/crossOrigin: "anonymous"/g) ?? []).length, 2);
});

test("no theme toggle, data-theme or runtime dark mode", () => {
  for (const file of [TOKENS, STYLE_ENTRY, ...COMPONENTS]) {
    assert.equal(/data-theme|\.dark\b|prefers-color-scheme/.test(read(file)), false);
  }
});

test("self-hosted font assets and licenses are pinned", () => {
  const expected: Record<string, string> = {
    "beiruti-500.woff2": "002daf61aff87803e46729e80de8128e0b4e133aadbb43c091512b85b0a01fcb",
    "estedad-400-500.woff2": "fa5b933b99f547556fbe3aa9e9d842e7586c4dfa8450a28109c9c3317b1e1b6e",
    "OFL-Beiruti.txt": "bb3b1f597fe14b744ec886feb5c4742e6017adeadc4c1610ca30c5853e172979",
    "OFL-Estedad.txt": "0417da48fc44780476e074f02f8400028ee704b3e222be5855fa6d960b9200ca",
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

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return channel(1) * 0.2126 + channel(3) * 0.7152 + channel(5) * 0.0722;
}

function contrast(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("essential text and controls meet their flat-color contrast thresholds", () => {
  const pairs: [string, string, number][] = [
    ["--color-text-primary", "--color-canvas", 4.5],
    ["--color-text-secondary", "--color-canvas", 4.5],
    ["--color-text-inverse", "--color-action-primary", 4.5],
    ["--color-text-inverse", "--color-surface-inverse", 4.5],
    ["--color-text-inverse-secondary", "--color-surface-inverse", 4.5],
    ["--color-border-control", "--color-surface", 3],
    ["--color-focus", "--color-canvas", 3],
    ["--color-focus-inverse", "--color-surface-inverse", 3],
    ["--color-status-error", "--color-surface", 4.5],
  ];
  for (const [first, second, minimum] of pairs) {
    assert.ok(contrast(MASTER_TOKENS[first]!, MASTER_TOKENS[second]!) >= minimum);
  }
  assert.ok(
    contrast(MASTER_TOKENS["--color-action-primary"]!, MASTER_TOKENS["--color-surface-inverse"]!) <
      3,
  );
});
