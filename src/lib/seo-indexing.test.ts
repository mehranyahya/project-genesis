import assert from "node:assert/strict";
import { test } from "node:test";
import { localizedHead, localizedLinks } from "./route-defs/shared";
import { restrictRobots } from "./seo-indexing";

test("search alternates stay reciprocal and an English-only page has no nonexistent x-default", () => {
  for (const locale of ["fa", "en"] as const) {
    const links = localizedLinks("/en/guides/test-care", locale, ["fa", "en"]);
    assert.deepEqual(
      links.filter((link) => link.rel === "alternate").map((link) => link.hrefLang),
      ["fa", "en", "x-default"],
    );
    assert.ok(
      links.find((link) => link.hrefLang === "x-default")!.href.endsWith("/guides/test-care"),
    );
    assert.equal(links.find((link) => link.hrefLang === "x-default")!.href.includes("/en/"), false);
  }
  assert.deepEqual(
    localizedLinks("/guides/en-only", "en", ["en"])
      .filter((link) => link.rel === "alternate")
      .map((link) => link.hrefLang),
    ["en"],
  );
  assert.deepEqual(
    localizedLinks("/guides/en-only", "fa", ["en"]).map((link) => link.rel),
    ["canonical"],
  );
});

test("noindex and none suppress search alternates without dropping canonical or localized metadata", () => {
  for (const robots of ["noindex", "NoIndex, nofollow", "none", "googlebot: noindex"]) {
    const head = localizedHead({
      locale: "en",
      basePath: "/guides/test-care",
      title: "راهنماها",
      rawTitle: "Reviewed article",
      robots,
      translationLocales: ["fa", "en"],
    });
    assert.deepEqual(
      head.links.map((link) => link.rel),
      ["canonical"],
    );
    assert.ok(head.meta.some((item) => item.title === "Reviewed article"));
    assert.ok(head.meta.some((item) => item.name === "robots" && item.content === robots));
  }
});

test("a readiness restriction preserves owner nofollow rules and still permits indexable nofollow pages", () => {
  for (const directive of ["noindex,nofollow", "none", "NoIndex, follow"])
    assert.equal(restrictRobots(directive, false), directive);
  assert.equal(restrictRobots("index,follow", false), "noindex,follow");
  assert.equal(restrictRobots(null, false), "noindex,follow");
  const head = localizedHead({
    locale: "en",
    basePath: "/guides/test-care",
    title: "راهنماها",
    robots: "index,nofollow",
    translationLocales: ["en"],
  });
  assert.deepEqual(
    head.links.filter((link) => link.rel === "alternate").map((link) => link.hrefLang),
    ["en"],
  );
});
