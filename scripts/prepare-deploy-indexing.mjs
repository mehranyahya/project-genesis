import { rm, writeFile } from "node:fs/promises";

const target = process.argv[2]?.trim();
if (target !== "preview" && target !== "production") {
  throw new Error("Deployment indexing target must be preview or production");
}

const robotsPath = new URL("../public/robots.txt", import.meta.url);
const sitemapPath = new URL("../public/sitemap.xml", import.meta.url);

if (target === "preview") {
  await writeFile(robotsPath, "User-agent: *\nDisallow: /\n", "utf8");
  await rm(sitemapPath, { force: true });
} else {
  await writeFile(robotsPath, "User-agent: *\nAllow: /\nDisallow: /api/\n", "utf8");
}
