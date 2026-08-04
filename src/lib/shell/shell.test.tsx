import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { ContactLinks } from "@/components/layout/contact-links";
import type { Site } from "@/lib/content/types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const LAYOUT_FILES = [
  "components/layout/app-shell.tsx",
  "components/layout/site-header.tsx",
  "components/layout/site-footer.tsx",
  "components/layout/mobile-navigation.tsx",
  "components/layout/route-skeleton.tsx",
  "components/layout/contact-links.tsx",
];

test("ContactLinks renders nothing when the site adapter returns null", () => {
  const html = renderToStaticMarkup(<ContactLinks site={null} />);
  assert.equal(html, "");
  for (const needle of ["tel:", "whatsapp", "telegram", "تلفن", "واتساپ", "تلگرام"]) {
    assert.equal(html.includes(needle), false, `contact fallback leaked: ${needle}`);
  }
});

test("ContactLinks renders only non-null site fields", () => {
  const site: Site = {
    displayName: "مهرآرا",
    latinName: "Mehrara",
    phone: "02100000000",
    whatsapp: null,
    telegram: null,
    address: null,
    workingHours: null,
    links: { instagram: null, website: null, map: null },
  };
  const html = renderToStaticMarkup(<ContactLinks site={site} />);
  assert.ok(html.includes("tel:02100000000"));
  assert.equal(html.includes("واتساپ"), false);
  assert.equal(html.includes("تلگرام"), false);
});

test("root document is Persian, RTL and exposes the main landmark", () => {
  const source = read("routes/__root.tsx");
  assert.match(source, /lang="fa"/);
  assert.match(source, /dir="rtl"/);
  assert.match(source, /<Outlet \/>/);
  assert.match(source, /QueryClientProvider/);
  assert.match(source, /AppShell/);
  assert.ok(read("components/layout/app-shell.tsx").includes("MAIN_CONTENT_ID"));
});

test("shell landmarks and accessible navigation labels exist", () => {
  const shell = read("components/layout/app-shell.tsx");
  assert.match(shell, /<main/);
  assert.match(shell, /SKIP_LINK_LABEL/);
  assert.match(read("components/layout/site-header.tsx"), /<header/);
  assert.match(read("components/layout/site-footer.tsx"), /<footer/);
  assert.match(read("components/layout/site-header.tsx"), /aria-label="ناوبری اصلی"/);
  assert.match(read("components/layout/mobile-navigation.tsx"), /aria-label="ناوبری موبایل"/);
  assert.match(read("components/layout/site-footer.tsx"), /aria-label="ناوبری پاورقی"/);
  assert.match(read("components/layout/mobile-navigation.tsx"), /aria-expanded=\{open\}/);
});

test("header, mobile panel and action bar use solid semantic surfaces", () => {
  assert.match(read("components/layout/site-header.tsx"), /bg-surface\b/);
  assert.match(read("components/layout/mobile-navigation.tsx"), /bg-surface\b/);
  assert.match(read("components/layout/app-shell.tsx"), /bg-surface\b/);
  assert.match(read("components/layout/site-footer.tsx"), /bg-surface-inverse/);
  assert.match(read("components/layout/site-footer.tsx"), /text-text-inverse/);
});

test("layout files carry no raw color and no banned effect", () => {
  const rawColor = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/;
  const banned =
    /gradient|backdrop-filter|backdrop-blur|blur\(|tw-animate|animate-pulse|shimmer|spinner|data-theme/i;
  for (const file of LAYOUT_FILES) {
    const source = read(file)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.equal(rawColor.test(source), false, `raw color in ${file}`);
    assert.equal(banned.test(source), false, `banned effect in ${file}`);
  }
});

test("every interactive shell control keeps a 44px target and visible focus", () => {
  for (const file of [
    "components/layout/app-shell.tsx",
    "components/layout/site-header.tsx",
    "components/layout/site-footer.tsx",
    "components/layout/mobile-navigation.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /min-h-11/, `${file} missing touch target`);
    assert.match(source, /focus-visible:outline-2/, `${file} missing focus ring`);
  }
});
