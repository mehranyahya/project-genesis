import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Scaffold QA gate (Prompt 12).
 * Source-level assertions only. No business logic, no new capability.
 * Raw color, banned effects, theme toggle and typography are already
 * certified by src/lib/design/tokens.test.ts and are not duplicated here.
 */

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(path.join(srcRoot, rel), "utf8");

const RUNTIME_EXTENSIONS = new Set([".ts", ".tsx"]);

const runtimeFiles = (dir: string): string[] => {
  const out: string[] = [];
  const walk = (abs: string) => {
    for (const entry of readdirSync(abs)) {
      const full = path.join(abs, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!RUNTIME_EXTENSIONS.has(path.extname(entry))) continue;
      if (/\.(test|spec)\./.test(entry)) continue;
      out.push(path.relative(srcRoot, full));
    }
  };
  walk(path.join(srcRoot, dir));
  return out;
};

/** Scaffold surfaces only: unused shadcn primitives are out of the QA gate. */
const uiFiles = () =>
  [...runtimeFiles("routes"), ...runtimeFiles("components")].filter(
    (rel) => !rel.startsWith(path.join("components", "ui") + path.sep),
  );

test("no public /404 business route exists", () => {
  const routes = runtimeFiles("routes");
  for (const rel of routes) {
    assert.equal(/(^|\/)404\./.test(rel), false, `public 404 route file: ${rel}`);
    assert.equal(
      /createFileRoute\(\s*["']\/404/.test(read(rel)),
      false,
      `public /404 route declared in ${rel}`,
    );
  }
  assert.equal(existsSync(path.join(srcRoot, "..", "public", "404.html")), false);
});

test("routes and components import no backend, Supabase or worker module", () => {
  const banned =
    /from\s+["'][^"']*(supabase|@\/server\b|\.\.?\/server\b|@\/worker|\.server["']|wrangler)/i;
  const offenders = uiFiles().filter((rel) => banned.test(read(rel)));
  assert.deepEqual(offenders, [], `backend import in: ${offenders.join(", ")}`);
});

test("routes read data only through the content adapters module", () => {
  const offenders = runtimeFiles("routes").filter((rel) =>
    /from\s+["'][^"']*\.(json|md|markdown)["']/.test(read(rel)),
  );
  assert.deepEqual(offenders, [], `direct content import in: ${offenders.join(", ")}`);
});

test("no theme toggle surface exists anywhere in the UI", () => {
  const banned = /useTheme|ThemeProvider|next-themes|toggleTheme|data-theme|setTheme/;
  const offenders = uiFiles().filter((rel) => banned.test(read(rel)));
  assert.deepEqual(offenders, [], `theme toggle in: ${offenders.join(", ")}`);
});

test("app shell keeps skip link, single main and mobile-bar clearance", () => {
  const shell = read("components/layout/app-shell.tsx");
  assert.match(shell, /focus:not-sr-only/);
  assert.equal((shell.match(/<main\b/g) ?? []).length, 1);
  // Fixed mobile action bar must not cover the end of main content.
  assert.match(shell, /pb-24 lg:pb-0/);
});

test("reduced motion is honoured globally and no decorative animation is declared", () => {
  const styles = read("styles.css");
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /animation-duration: 0\.01ms !important/);
  assert.match(styles, /transition-duration: 0\.01ms !important/);

  const offenders = uiFiles().filter((rel) =>
    /animate-(bounce|ping|pulse|spin)|animation:\s/.test(read(rel)),
  );
  assert.deepEqual(offenders, [], `decorative animation in: ${offenders.join(", ")}`);
});

test("interactive rows and controls declare the 44px target and 2px focus ring", () => {
  const files = [
    "components/request-form/request-form-fields.tsx",
    "components/building-stone/building-stone-fields.tsx",
    "components/layout/site-header.tsx",
    "components/layout/site-footer.tsx",
    "components/layout/app-shell.tsx",
  ];
  for (const rel of files) {
    const source = read(rel);
    assert.match(source, /min-h-11/, `missing 44px target in ${rel}`);
    assert.match(source, /focus-visible:outline-2/, `missing 2px focus ring in ${rel}`);
  }
});

test("no fixed-width or viewport-overflow constructs that break 320px reflow", () => {
  const banned = /\bw-\[\d{4,}px\]|\bmin-w-\[\d{3,}px\]|overflow-x:\s*hidden|overflow-x-hidden/;
  const offenders = uiFiles().filter((rel) => banned.test(read(rel)));
  assert.deepEqual(offenders, [], `reflow risk in: ${offenders.join(", ")}`);
});

test("root document stays Persian RTL with one html shell", () => {
  const root = read("routes/__root.tsx");
  assert.match(root, /<html lang="fa" dir="rtl">/);
});
