import { test } from "node:test";
import assert from "node:assert/strict";

import type { Guide } from "./content/types";
import {
  buildGuideDetailModel,
  buildGuideListModel,
  guidePath,
  isSafeGuideHref,
  parseGuideMarkdown,
} from "./guides";
import type { GuideBlock, GuideInline } from "./guides";

const guide = (overrides: Partial<Guide> = {}): Guide => ({
  slug: "stone-care",
  title: "نگهداری سنگ",
  summary: "خلاصهٔ واقعی",
  body: "پاراگراف اول.",
  seo: null,
  updatedAt: "2026-01-05T00:00:00.000Z",
  ...overrides,
});

function texts(content: GuideInline[]): string {
  return content.map((node) => (node.kind === "text" ? node.text : node.text)).join("");
}

function links(blocks: GuideBlock[]) {
  const found: { href: string; text: string }[] = [];
  for (const block of blocks) {
    const contents =
      block.kind === "list" ? block.items : [block.kind === "paragraph" ? block.content : block.content];
    for (const content of contents) {
      for (const node of content) if (node.kind === "link") found.push({ href: node.href, text: node.text });
    }
  }
  return found;
}

test("1 an empty adapter result produces no guides", () => {
  assert.deepEqual(buildGuideListModel([]), []);
  assert.deepEqual(buildGuideListModel(null), []);
  assert.deepEqual(buildGuideListModel(undefined), []);
  assert.equal(buildGuideDetailModel(null), null);
  assert.equal(buildGuideDetailModel(undefined), null);
});

test("2 real title, summary, date and slug survive unchanged", () => {
  const [item] = buildGuideListModel([guide()]);
  assert.ok(item);
  assert.equal(item.title, "نگهداری سنگ");
  assert.equal(item.summary, "خلاصهٔ واقعی");
  assert.equal(item.slug, "stone-care");
  assert.equal(item.updatedAt, "2026-01-05T00:00:00.000Z");
  assert.ok(item.updatedLabel && item.updatedLabel.length > 0);
});

test("3 absent summary and unusable date are never fabricated", () => {
  const [item] = buildGuideListModel([guide({ summary: null, updatedAt: "not-a-date" })]);
  assert.ok(item);
  assert.equal(item.summary, null);
  assert.equal(item.updatedLabel, null);
});

test("4 adapter order is preserved and unusable entries are dropped", () => {
  const items = buildGuideListModel([
    guide({ slug: "b", title: "ب" }),
    guide({ slug: "   ", title: "بدون اسلاگ" }),
    guide({ slug: "a", title: "   " }),
    guide({ slug: "c", title: "ج" }),
  ]);
  assert.deepEqual(
    items.map((item) => item.slug),
    ["b", "c"],
  );
});

test("5 the slug becomes the correct internal guide path", () => {
  assert.equal(guidePath("stone-care"), "/guides/stone-care");
  const [item] = buildGuideListModel([guide()]);
  assert.equal(item?.path, "/guides/stone-care");
  assert.equal(buildGuideDetailModel(guide())?.path, "/guides/stone-care");
});

test("6 ordinary markdown becomes the expected safe model", () => {
  const blocks = parseGuideMarkdown(
    ["## عنوان دوم", "", "خط اول", "خط دوم", "", "- مورد یک", "- مورد دو", "", "1. گام یک"].join("\n"),
  );
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ["heading", "paragraph", "list", "list"],
  );
  const [heading, paragraph, unordered, ordered] = blocks;
  assert.equal(heading?.kind === "heading" && heading.level, 2);
  assert.equal(paragraph?.kind === "paragraph" && texts(paragraph.content), "خط اول خط دوم");
  assert.equal(unordered?.kind === "list" && unordered.ordered, false);
  assert.equal(unordered?.kind === "list" && unordered.items.length, 2);
  assert.equal(ordered?.kind === "list" && ordered.ordered, true);
});

test("7 a script tag never yields executable script", () => {
  const blocks = parseGuideMarkdown('<script>alert("x")</script>');
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ["paragraph"],
  );
  const [block] = blocks;
  assert.ok(block?.kind === "paragraph");
  assert.equal(texts(block.content), '<script>alert("x")</script>');
  assert.equal(links(blocks).length, 0);
});

test("8 javascript:, data: and vbscript: never produce active links", () => {
  const blocks = parseGuideMarkdown(
    [
      "[یک](javascript:alert(1))",
      "[دو](data:text/html,<script>alert(1)</script>)",
      "[سه](vbscript:msgbox)",
      "[چهار](//evil.example)",
      "[پنج](http://insecure.example)",
    ].join("\n\n"),
  );
  assert.equal(links(blocks).length, 0);
  assert.equal(isSafeGuideHref("javascript:alert(1)"), false);
  assert.equal(isSafeGuideHref("data:text/html,x"), false);
  assert.equal(isSafeGuideHref("vbscript:msgbox"), false);
  assert.equal(isSafeGuideHref("//evil.example"), false);
  assert.equal(isSafeGuideHref("http://insecure.example"), false);
  assert.equal(isSafeGuideHref("/guides/a"), true);
  assert.equal(isSafeGuideHref("https://example.com/a"), true);
});

test("9 safe internal and https links are kept", () => {
  const blocks = parseGuideMarkdown("[داخلی](/grave-stones) و [بیرونی](https://example.com/a)");
  assert.deepEqual(links(blocks), [
    { href: "/grave-stones", text: "داخلی" },
    { href: "https://example.com/a", text: "بیرونی" },
  ]);
});

test("10 raw html is inert text, never markup", () => {
  const blocks = parseGuideMarkdown('<img src=x onerror="alert(1)"> <a href="javascript:1">x</a>');
  const [block] = blocks;
  assert.ok(block?.kind === "paragraph");
  assert.equal(block.content.every((node) => node.kind === "text"), true);
  assert.equal(texts(block.content).includes("onerror"), true);
});

test("11 the body never produces a second h1", () => {
  const blocks = parseGuideMarkdown("# عنوان بدنه\n\n### عنوان سوم");
  const levels = blocks.filter((block) => block.kind === "heading").map((block) => block.level);
  assert.deepEqual(levels, [2, 3]);
  assert.equal(
    levels.some((level) => (level as number) === 1),
    false,
  );
});

test("12 adapter input is never mutated", () => {
  const input = [guide({ body: "## عنوان\n\n- مورد" })];
  const snapshot = JSON.parse(JSON.stringify(input));
  buildGuideListModel(input);
  buildGuideDetailModel(input[0]);
  assert.deepEqual(JSON.parse(JSON.stringify(input)), snapshot);
});

test("13 detail meta uses only real seo or real guide data", () => {
  const bare = buildGuideDetailModel(guide({ seo: null, summary: null }));
  assert.equal(bare?.metaTitle, "نگهداری سنگ");
  assert.equal(bare?.metaDescription, null);

  const withSeo = buildGuideDetailModel(
    guide({
      seo: { title: "عنوان سئو", description: "توضیح سئو", canonicalPath: null, robots: null },
    }),
  );
  assert.equal(withSeo?.metaTitle, "عنوان سئو");
  assert.equal(withSeo?.metaDescription, "توضیح سئو");
});
