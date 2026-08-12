import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { Page, Site } from "./content/types";
import type { GuideBlock, GuideInline } from "./guides";
import {
  NOT_FOUND_MARKER,
  buildContactDetails,
  buildContactPageModel,
  buildNotFoundModel,
  buildStaticPageModel,
  contentBlockedMeta,
  isSafeCanonicalPath,
} from "./static-pages";

const page = (overrides: Partial<Page> = {}): Page => ({
  slug: "about",
  title: "دربارهٔ مهرآرا",
  body: "پاراگراف واقعی.",
  seo: null,
  ...overrides,
});

function links(blocks: GuideBlock[]) {
  const found: { href: string; text: string }[] = [];
  for (const block of blocks) {
    const contents: GuideInline[][] = block.kind === "list" ? block.items : [block.content];
    for (const content of contents) {
      for (const node of content) if (node.kind === "link") found.push(node);
    }
  }
  return found;
}

function text(blocks: GuideBlock[]): string {
  let out = "";
  for (const block of blocks) {
    const contents: GuideInline[][] = block.kind === "list" ? block.items : [block.content];
    for (const content of contents) for (const node of content) out += node.text;
  }
  return out;
}

/* 1. Missing page fabricates nothing */
test("null page produces no model and no fabricated business content", () => {
  assert.equal(buildStaticPageModel(null, "about"), null);
  assert.equal(buildStaticPageModel(undefined, "privacy"), null);
  assert.deepEqual(contentBlockedMeta(), [{ name: "robots", content: "noindex" }]);
});

test("page with empty title is not usable", () => {
  assert.equal(buildStaticPageModel(page({ title: "   " }), "about"), null);
});

test("page slug mismatch is rejected instead of being re-labelled", () => {
  assert.equal(buildStaticPageModel(page({ slug: "terms" }), "about"), null);
});

/* 2. Real page preserves title/body/seo */
test("real page preserves title, body and seo", () => {
  const model = buildStaticPageModel(
    page({
      seo: {
        title: "دربارهٔ ما — مهرآرا",
        description: "توضیح واقعی",
        canonicalPath: "/about",
        robots: "index,follow",
      },
    }),
    "about",
  );
  assert.ok(model);
  assert.equal(model.title, "دربارهٔ مهرآرا");
  assert.equal(model.metaTitle, "دربارهٔ ما — مهرآرا");
  assert.equal(model.metaDescription, "توضیح واقعی");
  assert.equal(model.canonicalPath, "/about");
  assert.equal(model.robots, "index,follow");
  assert.equal(text(model.blocks), "پاراگراف واقعی.");
});

test("meta title falls back to page title only", () => {
  const model = buildStaticPageModel(page({ seo: null }), "about");
  assert.equal(model?.metaTitle, "دربارهٔ مهرآرا");
});

/* 3. Adapter input is not mutated */
test("adapter input is never mutated", () => {
  const input = page({
    seo: { title: "t", description: "d", canonicalPath: "/about", robots: null },
  });
  const snapshot = JSON.parse(JSON.stringify(input));
  buildStaticPageModel(input, "about");
  assert.deepEqual(JSON.parse(JSON.stringify(input)), snapshot);
});

/* 4. Every required slug maps to the right model */
test("about/contact/privacy/terms/not-found slugs map correctly", () => {
  for (const slug of ["about", "contact", "privacy", "terms", "not-found"] as const) {
    const model = buildStaticPageModel(page({ slug, title: "عنوان" }), slug);
    assert.equal(model?.slug, slug);
  }
  assert.equal(buildNotFoundModel(page({ slug: "not-found", title: "عنوان" }))?.slug, "not-found");
  assert.equal(
    buildContactPageModel(page({ slug: "contact", title: "ت" }), null).page?.slug,
    "contact",
  );
});

/* 5 + 8. Safe markdown model, single H1 */
test("body uses the safe markdown model and never emits a second h1", () => {
  const model = buildStaticPageModel(page({ body: "# عنوان بدنه\n\nمتن\n\n- یک" }), "about");
  assert.ok(model);
  const kinds = model.blocks.map((block) => block.kind);
  assert.deepEqual(kinds, ["heading", "paragraph", "list"]);
  for (const block of model.blocks) {
    if (block.kind === "heading") assert.ok(block.level === 2 || block.level === 3);
  }
});

/* 6. Raw HTML stays inert */
test("raw html in body is inert text, never markup", () => {
  const model = buildStaticPageModel(
    page({ body: '<script>alert(1)</script><img src=x onerror="alert(1)">' }),
    "about",
  );
  assert.ok(model);
  assert.equal(links(model.blocks).length, 0);
  assert.match(text(model.blocks), /<script>alert\(1\)<\/script>/);
});

/* 7. Unsafe protocols never become active links */
test("javascript:/data:/vbscript: and protocol-relative hrefs are not links", () => {
  const body = [
    "[a](javascript:alert(1))",
    "[b](data:text/html,x)",
    "[c](vbscript:msgbox)",
    "[d](//evil.example)",
    "[ok](/privacy)",
    "[ok2](https://example.com/x)",
  ].join("\n\n");
  const model = buildStaticPageModel(page({ body }), "about");
  assert.ok(model);
  assert.deepEqual(
    links(model.blocks).map((link) => link.href),
    ["/privacy", "https://example.com/x"],
  );
});

/* 9. Absent description is never fabricated */
test("absent or blank description is not fabricated", () => {
  const model = buildStaticPageModel(
    page({
      seo: { title: null as unknown as string, description: "  ", canonicalPath: "", robots: null },
    }),
    "about",
  );
  assert.ok(model);
  assert.equal(model.metaDescription, null);
  assert.equal(model.canonicalPath, null);
  assert.equal(model.robots, null);
});

test("canonical path must be a real same-origin path", () => {
  assert.equal(isSafeCanonicalPath("/about"), true);
  assert.equal(isSafeCanonicalPath("//evil.example"), false);
  assert.equal(isSafeCanonicalPath("https://example.com"), false);
  assert.equal(isSafeCanonicalPath(""), false);
  assert.equal(isSafeCanonicalPath(null), false);
});

/* 10 + 11. Contact data comes only from Site */
const site = (overrides: Partial<Site> = {}): Site => ({
  displayName: "مهرآرا",
  latinName: "Mehrara",
  phone: null,
  whatsappUrl: null,
  telegram: null,
  address: null,
  workingHours: null,
  links: { instagram: null, website: null, map: null },
  ...overrides,
});

test("null site yields no contact entries", () => {
  assert.deepEqual(buildContactDetails(null), []);
  assert.deepEqual(buildContactDetails(undefined), []);
  assert.deepEqual(buildContactPageModel(null, null), { page: null, details: [] });
});

test("empty site fields are omitted entirely", () => {
  assert.deepEqual(buildContactDetails(site({ phone: "   ", address: "" })), []);
});

test("contact entries keep only real site data", () => {
  const entries = buildContactDetails(
    site({
      phone: "02100000000",
      whatsappUrl: "https://wa.me/98000",
      telegram: "javascript:alert(1)",
      address: "نشانی واقعی",
      workingHours: "۹ تا ۱۷",
      links: { instagram: "https://instagram.com/x", website: null, map: "//evil" },
    }),
  );
  assert.deepEqual(
    entries.map((entry) => entry.key),
    ["phone", "whatsapp", "instagram", "address", "hours"],
  );
  assert.equal(entries[0]?.href, "tel:02100000000");
  assert.equal(entries.find((entry) => entry.key === "address")?.href, null);
});

test("site alone does not create contact page copy", () => {
  const model = buildContactPageModel(null, site({ phone: "02100000000" }));
  assert.equal(model.page, null);
  assert.equal(model.details.length, 1);
});

/* 12. NotFound without page */
test("not-found without a page has no title, body or CTA", () => {
  assert.equal(buildNotFoundModel(null), null);
  assert.equal(NOT_FOUND_MARKER, "۴۰۴");
});

/* 13. Terms model invents no version or hash */
test("terms model exposes no terms_version or terms_content_hash", () => {
  const model = buildStaticPageModel(page({ slug: "terms", title: "شرایط" }), "terms");
  assert.ok(model);
  const keys = Object.keys(model).sort();
  assert.deepEqual(keys, [
    "blocks",
    "canonicalPath",
    "metaDescription",
    "metaTitle",
    "robots",
    "slug",
    "title",
  ]);
});

/* ------------------------------------------------------------------ *
 * Source-level assertions
 * ------------------------------------------------------------------ */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

test("static routes delegate to the shared factory with their own slug", () => {
  const factory = read("src/lib/route-defs/pages.tsx");
  for (const slug of ["about", "privacy", "terms"] as const) {
    for (const rel of [`src/routes/${slug}.tsx`, `src/routes/en/${slug}.tsx`]) {
      const source = read(rel);
      assert.match(source, /from "@\/lib\/route-defs\/pages"/, rel);
      assert.match(source, new RegExp(`${slug}RouteOptions\\("(fa|en)"\\)`), rel);
      assert.equal(source.includes("getSite"), false, rel);
      assert.equal(source.includes("getPage("), false, rel);
    }
    assert.match(factory, new RegExp(`"${slug}", "[^"]+", StaticPageRoute`));
  }
  // The static-page factory reads exactly one page adapter and never the site.
  assert.match(factory, /buildStaticPageModel\(contentForLocale\(await getPage\(slug\), locale\), slug\)/);
  const staticSection = factory.slice(
    factory.indexOf("function staticPageOptions("),
    factory.indexOf("export function contactRouteOptions("),
  );
  assert.equal(staticSection.includes("getSite("), false);
});

test('contact route reads getPage("contact") and getSite()', () => {
  const factory = read("src/lib/route-defs/pages.tsx");
  const contactSection = factory.slice(factory.indexOf("export function contactRouteOptions("));
  assert.match(contactSection, /getPage\("contact"\)/);
  assert.match(contactSection, /getSite\(\)/);
  for (const rel of ["src/routes/contact.tsx", "src/routes/en/contact.tsx"]) {
    assert.match(read(rel), /contactRouteOptions\("(fa|en)"\)/, rel);
  }
});

test('root reads getSite() and getPage("not-found") and hard-codes no 404 copy', () => {
  const root = read("src/routes/__root.tsx");
  assert.match(root, /getSite\(\)/);
  assert.match(root, /getPage\("not-found"\)/);
  assert.equal(root.includes("صفحه پیدا نشد"), false);
  assert.equal(root.includes("Page not found"), false);
});

test("no public /404 route and no unexpected public UI route files exist", () => {
  const files = readdirSync(join(ROOT, "src/routes"), { recursive: true }) as string[];
  const routeFiles = files
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => file.replaceAll("\\", "/"))
    .sort();
  const serverApiFiles = routeFiles.filter((file) => file.startsWith("api/"));
  const publicRouteFiles = routeFiles.filter((file) => !file.startsWith("api/"));

  assert.deepEqual(serverApiFiles, ["api/submit-request.ts"]);
  assert.deepEqual(publicRouteFiles, [
    "__root.tsx",
    "about.tsx",
    "building-stone.tsx",
    "contact.tsx",
    "en/about.tsx",
    "en/building-stone.tsx",
    "en/contact.tsx",
    "en/grave-stones/$slug.tsx",
    "en/grave-stones/custom.tsx",
    "en/grave-stones/index.tsx",
    "en/guides/$slug.tsx",
    "en/guides/index.tsx",
    "en/index.tsx",
    "en/portfolio.tsx",
    "en/privacy.tsx",
    "en/quote.tsx",
    "en/terms.tsx",
    "grave-stones/$slug.tsx",
    "grave-stones/custom.tsx",
    "grave-stones/index.tsx",
    "guides/$slug.tsx",
    "guides/index.tsx",
    "index.tsx",
    "portfolio.tsx",
    "privacy.tsx",
    "quote.tsx",
    "terms.tsx",
  ]);
  assert.equal(
    publicRouteFiles.some((file) => /(^|\/)404\.tsx?$/.test(file)),
    false,
  );
});

test("static page sources add no backend, supabase or unsafe html", () => {
  for (const path of [
    "src/lib/static-pages.ts",
    "src/components/static-pages/static-pages.tsx",
    "src/routes/about.tsx",
    "src/routes/contact.tsx",
    "src/routes/privacy.tsx",
    "src/routes/terms.tsx",
    "src/routes/en/about.tsx",
    "src/routes/en/contact.tsx",
    "src/routes/en/privacy.tsx",
    "src/routes/en/terms.tsx",
    "src/lib/route-defs/pages.tsx",
    "src/routes/__root.tsx",
  ]) {
    const source = read(path);
    assert.equal(/supabase/i.test(source), false, path);
    assert.equal(source.includes("dangerouslySetInnerHTML"), false, path);
    assert.equal(/createServerFn|@supabase|edge-function/.test(source), false, path);
    assert.equal(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(source), false, path);
  }
});
