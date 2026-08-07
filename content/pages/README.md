# Git-versioned pages

Long-form editorial and legal pages remain versioned in Git. Runtime code reads
only files whose slug is already present in the public `PageSlug` allowlist.
Missing or invalid files resolve to `null`; runtime must never invent fallback
copy, legal terms, SEO metadata, versions, or hashes.

## File format

Create one Markdown file per page, for example `content/pages/terms.md`.
The file starts with a deliberately small frontmatter format. Every value after
`:` is a JSON literal so parsing is deterministic without an additional YAML
runtime dependency.

```md
---
slug: "terms"
title: "..."
version: "..."
seoTitle: "..."
seoDescription: null
canonicalPath: "/terms"
robots: "index,follow"
---

Real Markdown body goes here.
```

Required for every page:
- `slug`: must exactly match the requested allowlisted page slug.
- `title`: non-empty string, maximum 160 characters.
- body: non-empty Markdown after the closing frontmatter delimiter.

Additional requirement for `terms`:
- `version`: non-empty human-readable version, maximum 80 characters.

Optional SEO keys are `seoTitle`, `seoDescription`, `canonicalPath`, and
`robots`. When `seoTitle` is absent/null, the page exposes no SEO object instead
of fabricating one.

## Terms acceptance hash

For `terms.md`, runtime computes SHA-256 over UTF-8 bytes of:

`<trimmed version> + "\n" + <body with CRLF normalized to LF and outer whitespace trimmed>`

The same parsed file supplies `/terms`, request-form acceptance metadata, and
the request backend. There is intentionally no environment-variable or database
copy of the current Terms version/hash.

Do not add placeholder legal copy. Until a real, reviewed `terms.md` exists,
request submission stays blocked by design.
