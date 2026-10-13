# Reviewed bilingual Git pages

Runtime reads compiled public Page DTOs, not raw Markdown or frontmatter. Sources
live in `content/pages/fa/<slug>.md` and `content/pages/en/<slug>.md`. The exact
allowlist is `home`, `building-stone`, `stoneworks`, `about`, `contact`, `privacy`, `terms`, and
`not-found`. Missing translations return `null`; there is no language fallback.
Flat files at `content/pages/<slug>.md` are rejected rather than silently ignored.

## Source format and approval

Every value after `:` is a JSON literal. Unknown or duplicate keys fail generation.
This deliberately unpublished template is documentation, not approved legal copy:

```md
---
slug: "terms"
locale: "fa"
status: "draft"
reviewed: false
title: "..."
version: null
seoTitle: null
seoDescription: null
canonicalPath: null
robots: null
---
```

For English, use the `en` directory and `locale: "en"`. Filename and source slug,
directory and source locale must match. `title` is required (1–160 characters).
Drafts produce no DTO, text or acceptance release. Only `status: "published"`
and `reviewed: true` with a nonempty reviewed body can enter the public artifact.
Legal review and publication approval must be obtained before setting those flags.

Published Terms additionally require a reviewed `version` (1–80 characters).
Published translations must share one legal version; their acceptance hashes are
distinct. Publishing one language does not fabricate the other. Release readiness
requires both `privacy` and `terms` in both languages and a generated structured
artifact. It still does not grant deployment permission or replace Preview tests.

Optional SEO fields require `seoTitle` when present. Canonical paths, if supplied,
must match the actual slug/language: `/terms`, `/en/terms`, `/` or `/en` for home.
Limits: description 320, canonical 240, robots 120 characters. No SEO is invented.
Published English title, body and SEO must contain no Persian/Arabic-script text;
untranslated public copy fails generation. Drafts may remain unfinished.

## Service pages

`building-stone.md` and `stoneworks.md` provide the approved title, Markdown body
and SEO for their corresponding service page, in each language. The service
loaders use `getPage(slug, locale)`; missing translations do not reuse Persian
copy. Missing service text adds no blank editorial frame and keeps the service
page `noindex`. The operational request form remains available subject to Terms.

A published `stoneworks.md` also requires `stoneworkCategories`, an explicit
ordered JSON array of the categories actually approved by the owner. Allowed
stable IDs are `sculpture_art`, `water_landscape`, `architectural_elements`,
`furniture_interiors`, and `monuments_bespoke`. Review the labels, descriptions
and applications for selected categories too; selection confirms an offering,
not merely the existence of a request enum. Duplicates and unknown IDs fail.
An empty array offers no category cards and uses the general enquiry path.
If both translations are published, their IDs and order must match. This field
cannot be used on another published page. Missing approval does not offer all
five categories. Category request links retain the existing stable IDs and
correct-language quote path; no new request or price schema is introduced.

Example draft metadata only (no published service text or offerings):

```md
---
slug: "stoneworks"
locale: "fa"
status: "draft"
reviewed: false
title: "..."
stoneworkCategories: []
---
```

## Reviewed service photography

Service pages can optionally declare `mediaReferences`, an ordered JSON array
of at most three approved image selectors. Every selector uses an exact public
24-character lowercase hex `assetId`; raw URLs, Storage keys, captions and
consent data are forbidden. Example shapes only (these are not real selections):

```json
[
  { "source": "building", "assetId": "aaaaaaaaaaaaaaaaaaaaaaaa" },
  { "source": "portfolio", "publicReferenceId": "pf-1001", "assetId": "bbbbbbbbbbbbbbbbbbbbbbbb" }
]
```

`source: "building"` is allowed only on `building-stone`; it selects the encoded
building sample output. `source: "portfolio"` works on either service and selects
a publication-approved project image. Review the actual image and its service
role before marking the page published. Reusing a sample does not give it a
project reference. Duplicate assets, extra fields and invalid references fail
generation. Missing selectors leave the image section absent.

`getPage` resolves selectors on the server from compiled public media in the
same language and strips selectors from the returned Page DTO. It returns only
selected five-field Media objects and the public project reference, when one
exists. A missing, ambiguous, changed or untranslated selection hides the whole
section; it never picks the first remaining image. Gallery reordering preserves
the selected stable asset. No page downloads the whole media catalogue.

Project enquiry links preserve their public reference and locale. Building
samples do not fabricate project IDs, product selection, stock or price. Images
use the existing AVIF/WebP renderer, explicit dimensions, contain and lazy loading
with automatic priority; no carousel or image effect is introduced. Do not embed
raw source photos, Storage paths or external media URLs in page text.

Sources must be regular single-link UTF-8 files no larger than 256 KiB. Symlinks,
hardlinks, nested/unknown files and invalid UTF-8 are rejected. README files are
ignored. Build errors never echo source text or frontmatter values.

## Generate and check

- `bun run content:generate` compiles both languages into
  `src/lib/content/generated-pages.ts` and the Edge Terms registry together.
- `bun run content:check` verifies both committed artifacts without changing them.
- `bun run content:release-check` additionally checks the required reviewed legal
  translations and structured content. Empty sources intentionally fail this gate.

Keep the sources and both generated artifacts in the same reviewed commit. Deploy
the web app and Edge registry from that exact approved version. Mixed deployments
are blocked by the form/Edge comparison; they do not silently accept older terms.
`CURRENT_TERMS_RELEASE` is a Persian compatibility alias; active validation uses
`CURRENT_TERMS_RELEASES` and accepts only each language's current approved hash.

## Deterministic Terms hash

Build normalizes CRLF/CR to LF and trims outer whitespace. Let `base` be
`<trimmed version> + "\n" + <normalized, trimmed body>`:

- Persian hashes UTF-8 `base`, preserving the existing acceptance contract.
- English hashes UTF-8 `"en\n" + base`, separating languages even for equal text.

The request/RPC schema is unchanged: version and hash identify the approved
translation. Old hashes are not kept in the active allowlist. A `TERMS_UPDATED`
response includes current metadata per language; before another consent the form
re-reads the actual Terms page in its own language and compares version/hash.
Missing, old or failed reads keep submission blocked and clear prior acceptance.
No request is retried automatically. Real legal text has not been added here.
