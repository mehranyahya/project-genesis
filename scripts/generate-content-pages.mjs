import { constants } from "node:fs";
import { lstat, open, readFile, readdir, writeFile } from "node:fs/promises";
import { format } from "prettier";
import {
  ALLOWED_PAGE_SLUGS,
  MAX_FILE_BYTES,
  PAGE_LOCALES,
  parseGitPage,
  termsReleases,
} from "./git-pages.mjs";
import {
  compileGuides,
  isGuideSlug,
  MAX_GUIDE_BYTES,
  MAX_GUIDES_PER_LOCALE,
  parseGitGuide,
} from "./git-guides.mjs";

const CONTENT_DIRECTORY = new URL("../content/pages/", import.meta.url);
const OUTPUT_FILE = new URL("../src/lib/content/generated-pages.ts", import.meta.url);
const GUIDES_DIRECTORY = new URL("../content/guides/", import.meta.url);
const GUIDES_OUTPUT_FILE = new URL("../src/lib/content/generated-guides.ts", import.meta.url);
const TERMS_REGISTRY_FILE = new URL(
  "../supabase/functions/_shared/terms-registry.generated.ts",
  import.meta.url,
);
const STRUCTURED_CONTENT_ARTIFACT = new URL(
  "../src/lib/content/generated-structured-content.ts",
  import.meta.url,
);
const CHECK_ONLY = process.argv.includes("--check");
const RELEASE_CHECK = process.argv.includes("--release-check");
if (CHECK_ONLY && RELEASE_CHECK) throw new Error("Choose either --check or --release-check");

async function sourceText(url, maxBytes = MAX_FILE_BYTES) {
  const file = await open(url, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > maxBytes)
      throw new Error("Invalid Git content source file");
    const bytes = Buffer.alloc(maxBytes + 1);
    let used = 0;
    while (used < bytes.length) {
      const { bytesRead } = await file.read(bytes, used, bytes.length - used, null);
      if (bytesRead === 0) break;
      used += bytesRead;
    }
    if (used > maxBytes) throw new Error("Git content exceeds source byte limit");
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, used));
    } catch {
      throw new Error("Git content is not valid UTF-8");
    }
  } finally {
    await file.close();
  }
}

const pages = { fa: {}, en: {} };
const entries = await readdir(CONTENT_DIRECTORY, { withFileTypes: true });
for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
  if (entry.name === "README.md" && entry.isFile()) continue;
  if (!PAGE_LOCALES.includes(entry.name) || !entry.isDirectory())
    throw new Error("Git pages must use the allowlisted locale directories");
  const locale = entry.name;
  const directory = new URL(`${locale}/`, CONTENT_DIRECTORY);
  const files = await readdir(directory, { withFileTypes: true });
  for (const file of files.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    if (file.name === "README.md" && file.isFile()) continue;
    const match = /^([a-z][a-z0-9-]*)\.md$/.exec(file.name);
    if (!file.isFile() || !match || !ALLOWED_PAGE_SLUGS.has(match[1]))
      throw new Error("Invalid Git page filename or file type");
    const page = parseGitPage(await sourceText(new URL(file.name, directory)), match[1], locale);
    if (page) pages[locale][match[1]] = page;
  }
}
const faStoneworks = pages.fa.stoneworks,
  enStoneworks = pages.en.stoneworks;
if (
  faStoneworks &&
  enStoneworks &&
  JSON.stringify(faStoneworks.stoneworkCategories) !==
    JSON.stringify(enStoneworks.stoneworkCategories)
)
  throw new Error("Published Stoneworks translations must share category IDs and order");
const releases = termsReleases(pages);
const guideRecords = { fa: [], en: [] };
// An absent optional source is empty; links/unknown directories are never followed.
const guidesStat = await lstat(new URL("../content/guides", import.meta.url)).catch((error) => {
  if (error.code === "ENOENT") return null;
  throw error;
});
if (guidesStat !== null) {
  if (!guidesStat.isDirectory()) throw new Error("Invalid Git guides directory");
  const locales = await readdir(GUIDES_DIRECTORY, { withFileTypes: true });
  for (const entry of locales.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    if (entry.name === "README.md" && entry.isFile()) continue;
    if (!PAGE_LOCALES.includes(entry.name) || !entry.isDirectory())
      throw new Error("Git guides must use the allowlisted locale directories");
    const locale = entry.name,
      directory = new URL(`${locale}/`, GUIDES_DIRECTORY);
    const files = await readdir(directory, { withFileTypes: true });
    let count = 0;
    for (const file of files.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      if (file.name === "README.md" && file.isFile()) continue;
      const match = /^(.+)\.md$/.exec(file.name);
      if (!file.isFile() || !match || !isGuideSlug(match[1]))
        throw new Error("Invalid Git guide filename or file type");
      if (++count > MAX_GUIDES_PER_LOCALE) throw new Error("Too many Git guide sources");
      const record = parseGitGuide(
        await sourceText(new URL(file.name, directory), MAX_GUIDE_BYTES),
        match[1],
        locale,
      );
      if (record) guideRecords[locale].push(record);
    }
  }
}
const guides = compileGuides(guideRecords);
const generatedGuides = await format(
  [
    "/* Generated by scripts/generate-content-pages.mjs. Do not edit by hand. */",
    'import type { Guide } from "./types";',
    'import type { Locale } from "../i18n/locale";',
    "export const GUIDE_SOURCES_SUPPORTED = true;",
    `export const GIT_GUIDES: Readonly<Record<Locale, readonly Guide[]>> = Object.freeze(${JSON.stringify(guides, null, 2)});`,
    "",
  ].join("\n"),
  { parser: "typescript", printWidth: 100 },
);
const generated = await format(
  [
    "/* Generated by scripts/generate-content-pages.mjs. Do not edit by hand. */",
    'import type { CompiledPage, PageSlug } from "./types";',
    'import type { Locale } from "../i18n/locale";',
    "",
    `export const GIT_PAGES: Readonly<Record<Locale, Readonly<Partial<Record<PageSlug, CompiledPage>>>>> = Object.freeze(${JSON.stringify(pages, null, 2)});`,
    "",
  ].join("\n"),
  { parser: "typescript", printWidth: 100 },
);
const generatedTermsRegistry = await format(
  [
    "// Generated by scripts/generate-content-pages.mjs. Do not edit by hand.",
    "export interface TermsRelease {",
    "  readonly version: string;",
    "  readonly currentContentHash: string;",
    "  readonly allowedContentHashes: readonly string[];",
    "}",
    "",
    `export const CURRENT_TERMS_RELEASES: Readonly<Record<"fa" | "en", TermsRelease | null>> = ${JSON.stringify(releases, null, 2)};`,
    "// Compatibility alias for tools that still inspect the Persian release.",
    "export const CURRENT_TERMS_RELEASE: TermsRelease | null = CURRENT_TERMS_RELEASES.fa;",
    "",
  ].join("\n"),
  { parser: "typescript", printWidth: 100 },
);
if (CHECK_ONLY || RELEASE_CHECK) {
  if ((await readFile(OUTPUT_FILE, "utf8")) !== generated)
    throw new Error(
      "Generated Git page artifact is stale; run `bun run content:generate` and commit it",
    );
  if ((await readFile(TERMS_REGISTRY_FILE, "utf8")) !== generatedTermsRegistry)
    throw new Error(
      "Generated Terms registry is stale; run `bun run content:generate` and commit it",
    );
  if ((await readFile(GUIDES_OUTPUT_FILE, "utf8")) !== generatedGuides)
    throw new Error(
      "Generated Git guide artifact is stale; run `bun run content:generate` and commit it",
    );
  if (RELEASE_CHECK) {
    const missing = PAGE_LOCALES.flatMap((locale) =>
      ["privacy", "terms"]
        .filter((slug) => !pages[locale][slug])
        .map((slug) => `${locale}.${slug}`),
    );
    const artifact = await readFile(STRUCTURED_CONTENT_ARTIFACT, "utf8");
    if (missing.length || !artifact.includes("STRUCTURED_CONTENT_GENERATED = true"))
      throw new Error(
        `Release content is incomplete; reviewed bilingual legal pages or structured artifact missing (${missing.join(", ")})`,
      );
  }
} else {
  await writeFile(OUTPUT_FILE, generated, "utf8");
  await writeFile(TERMS_REGISTRY_FILE, generatedTermsRegistry, "utf8");
  await writeFile(GUIDES_OUTPUT_FILE, generatedGuides, "utf8");
}
