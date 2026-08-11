import { rm, writeFile } from "node:fs/promises";

const target = process.argv[2]?.trim();
if (target !== "preview" && target !== "production") {
  throw new Error("Deployment indexing target must be preview or production");
}

function normalizeSiteUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("SITE_URL must be a valid URL");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error("SITE_URL must be an HTTPS origin without credentials, path, query or hash");
  }

  return parsed.origin;
}

const robotsPath = new URL("../public/robots.txt", import.meta.url);
const sitemapPath = new URL("../public/sitemap.xml", import.meta.url);

if (target === "preview") {
  await writeFile(robotsPath, "User-agent: *\nDisallow: /\n", "utf8");
  await rm(sitemapPath, { force: true });
} else {
  const rawOrigin = process.env["SITE_URL"]?.trim() ?? "";
  if (rawOrigin === "") throw new Error("SITE_URL is required for production");
  const origin = normalizeSiteUrl(rawOrigin);
  await writeFile(
    robotsPath,
    `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`,
    "utf8",
  );
}
