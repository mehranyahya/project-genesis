# Reviewed English structured translations

Operational Persian content remains in the existing private Supabase source. English
editorial content is versioned in `content/translations/en.json` and compiled into
the same sanitized build artifact. Missing translations are absent, not Persian
fallbacks. Neutral Site contact fields and the already-provided Latin brand name
remain available when translated Site prose is missing.

## Authoring reference

Run the existing structured generator with an isolated, authorized build target:

```sh
bun run structured:generate --translation-source /absolute/new/draft-en.json
```

This command still reads/validates the actual private content and media, but writes
only a new unpublished authoring reference. It does not replace the committed DTO
or public media, refuses to overwrite an existing destination, and cleans temporary
media. The reference contains public IDs, editable fields, public image asset IDs
and source hashes. It excludes prices, private Storage keys and consent records.
Do not put credentials or private/customer data in Git or the authoring reference.
Build credentials come from the existing authorized environment, never this file.

Translate the reference, preserving IDs and `sourceHash`. Set a real editorial
`revision`, `status: "published"` and `reviewed: true` only after approval. The
unpublished root format is:

```json
{
  "schemaVersion": 1,
  "locale": "en",
  "revision": null,
  "status": "draft",
  "reviewed": false,
  "products": {},
  "portfolio": {},
  "site": null
}
```

No real English text or legal copy has been supplied or published by this change.
Drafts produce no English records. Publication/review metadata and source hashes
never enter runtime DTOs. The file is UTF-8, at most 8 MiB, regular and single-link;
symlinks/hardlinks, duplicate decoded JSON keys, unsupported versions/languages,
unknown fields and excessive depth are rejected with fixed safe diagnostics.

## Exact editorial fields

- Products keyed by public product ID: `sourceHash`, `title`, `summary`,
  `description`, `seo`, `media`, `variants`. Slug, code and operational identity
  stay shared. Optional summary/description may explicitly be null.
- `media` maps each actual approved public 24-character asset ID to its English
  alt text. All images must be covered. No URL/path/dimensions may be overridden.
- `variants` maps every existing variant ID to `includes`, `excludes`, `options`.
  Included/excluded item counts must match the source; every option ID maps to
  an object containing its translated `title`. Ordering follows the operational
  source, never editorial key order. No variant or option may be added/dropped.
- SEO is null or contains `title`, `description`, `canonicalPath`, `robots`.
  A supplied canonical must equal `/en/grave-stones/<shared slug>`.
- Portfolio keyed by public reference: `sourceHash`, `summary`, `media`. Existing
  public reference, stone/size codes and image identities remain authoritative.
- Site is null or contains `sourceHash`, `displayName`, `address`, `workingHours`.
  Latin name, phone, handles and links stay authoritative in Supabase.

Published text fields must be nonempty English (no leaked Persian), within the
field limits enforced by the compiler. The root may publish a subset of products
or portfolio items; items without an approved complete translation are absent.
A published entry for an inactive/missing or ambiguous owner fails the build.

## Source changes and prices

Each source hash covers source editorial content, stable ownership, variants,
options and actual public image identity/alt. A prose/image/relationship change
invalidates the old reviewed translation even when the operational price hash
stays equal. Produce a new authoring reference and review the changed translation.

Prices, stock and price timestamps are deliberately outside the prose hash. A
price/stock update does not require translating unchanged prose; the translated
DTO inherits the current amount, price type, availability and catalogue version.
Request/RPC, idempotency and server pricing rules are unchanged. A hash is a
change detector, not proof of translation accuracy or legal/editorial approval.
Reviewers must verify meaning and completeness with the real source.

## Failed builds and runtime

The generator stages new media/DTOs outside the public directory. Validation
failure leaves the old committed artifact and media untouched. Install failures
restore old media while retaining the previous artifact. If rollback itself
fails, the staged backup is retained with a fixed recovery error; never remove
that backup before recovery. Multiple filesystem renames are not a crash-proof
transaction. A terminated process can require manual recovery from its stage.

Runtime reads only compiled `GENERATED_PRODUCTS`, `GENERATED_PORTFOLIO_ITEMS`
and `GENERATED_SITES`; the English source/parser/source hashes stay build-only.
`getSite(locale)` uses the existing eighth-adapter contract and explicit locale
selection. Release readiness, real media/privacy approvals, Preview acceptance,
backup/restore gates and explicit deployment authorization remain required.

## Building sample alt translations (stage 7B)

The existing schema version 1 optionally accepts `buildingMedia`, keyed by the
encoded public asset ID. Each selected entry contains only `sourceHash` and
English `alt`. The authoring-reference command emits draft entries with the
source hash and current source alt; translate and review the alt before publishing.
Older sources without this optional map publish no English building samples.

Hashes bind the exact public asset and its source alt. Replacing the source image,
changing alt, using an unknown/ambiguous ID, adding a media URL or leaving Persian
text in an English alt fails the reviewed build. Partial reviewed maps translate
only those images; omitted assets have no English fallback. The generator emits
`GENERATED_BUILDING_MEDIA` by locale with only the five public Media fields.
Source hashes, private Storage paths, row IDs and consent references are excluded.
Building media must be privacy-cleared with a nonempty private consent reference.
This uses the existing private media table and does not grant upload or deployment
permission. Reviewed service pages select images using `mediaReferences`; only
those selected images cross `getPage` to the browser.
