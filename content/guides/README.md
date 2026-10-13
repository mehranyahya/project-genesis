# Reviewed bilingual guides

Optional article sources live in `fa/<slug>.md` and `en/<slug>.md`. Runtime reads
only the generated public artifact through the existing `getGuides(query)` and
`getGuide(slug, locale)` adapters. Missing articles/translations remain absent;
no Persian fallback, article, date or author is invented. Articles are optional
for launch, independently of the mandatory service/legal content gates.

## Authoring and review

All frontmatter values are JSON literals. This unpublished template is only
documentation; replace every placeholder with real, reviewed content:

```md
---
slug: "stone-care"
locale: "fa"
status: "draft"
reviewed: false
title: "..."
summary: null
version: null
updatedAt: null
seoTitle: null
seoDescription: null
canonicalPath: null
robots: null
---
```

- Slug must match its filename, use lowercase ASCII letters/digits with single
  hyphens between segments, start with a letter and contain at most 80 characters.
  Directory and `locale` must match exactly. Unknown/duplicate keys fail the build.
- Drafts emit no text or metadata. Published sources require `reviewed: true`,
  title (1–160), summary (1–500), body, and a reviewed revision `version` (1–80).
  If both languages publish the same slug, their revision must match. This makes
  revision review explicit; it cannot establish translation quality or detect an
  author who changes text without updating/reviewing the revision. Review both
  languages after changes. Revision/status/review fields are not public DTO fields.
- `updatedAt` is the real editorial update date, exactly Gregorian `YYYY-MM-DD`.
  Invalid calendar dates fail. Build never substitutes its own date. Formatting
  uses UTC, Persian for FA and English for EN. The owner verifies historical truth.
- English public title, summary, body and SEO may contain no Persian/Arabic-script
  text. This is a language guard, not a translation-quality assessment.
- Optional SEO requires `seoTitle` (1–160); description ≤320 characters, canonical
  exactly `/guides/<slug>` or `/en/guides/<slug>`. Robots is null or exactly
  `index,follow`, `noindex,follow`, or `noindex,nofollow`. SEO is not fabricated.
- Use simple paragraphs, headings, ordered/unordered lists and `[text](href)`.
  HTML is displayed as text, never executed; unsupported Markdown remains inert.
  Links allow same-origin absolute paths or explicit HTTPS without credentials.
  Backslashes, protocol-relative URLs, malformed escapes, unsafe schemes and dot
  segments are rejected. Internal links must use the article's locale, for example
  `/building-stone` in FA and `/en/building-stone` in EN. Review that the destination
  exists and is relevant; a safe path alone does not prove a working destination.
- Sources are regular single-link UTF-8 files ≤64 KiB, at most 100 sources per
  language including drafts. Symlinks, hardlinks, nested/unknown entries and invalid
  UTF-8 fail. README files are ignored. Errors do not print source values.
- No raw photo URL, Storage key, private customer information or invented claims
  belong in an article. This phase adds no image/editor/embed library.

## Generate and consume

`bun run content:generate` validates the sources together with pages/legal
releases and writes `src/lib/content/generated-guides.ts`. Any invalid source
stops generation before the previous public artifacts are overwritten.
`bun run content:check` verifies all generated artifacts without writing them.
Commit reviewed sources and artifacts together. An empty or absent guides source
compiles to empty FA/EN lists; no placeholder is published.

Articles sort by real update date descending, then slug ascending. `getGuides`
returns only locale, slug, title, summary and update date; article bodies and SEO
are not transferred to listings/home. `limit` is an integer 1–100; the default is 100. Home requests one article in its own language. `getGuide` reads the complete
article and derives published counterpart locales for detail hreflang. No missing
translation is advertised there. Global sitemap/indexing review remains phase 12.

The reader uses the existing safe first-party renderer, a capped reading width,
one H1, semantic body headings, solid brand tokens and localized enquiry links.
No route, runtime package, animation or gradient is added. Actual readability,
translation, content and performance must be accepted with real content in Preview.
