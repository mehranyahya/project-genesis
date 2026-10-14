import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const FONTS = [
  { family: "Estedad", file: "estedad-400-500", weight: "400 500" },
  { family: "Beiruti", file: "beiruti-500", weight: "500" },
];

// Build artifact only. No network, browser, credentials or runtime overhead.
export async function verifyStaticFontDelivery({ assetDirectory, sourceDirectory }) {
  const files = await readdir(join(assetDirectory, "assets"));
  const cssFiles = files.filter((name) => /^styles-[\w-]+\.css$/.test(name));
  const entries = files.filter((name) => /^index-[\w-]+\.js$/.test(name));
  if (cssFiles.length !== 1 || entries.length !== 1)
    throw new Error("Static font delivery requires one current CSS and client entry");

  const [css, client, headers] = await Promise.all([
    readFile(join(assetDirectory, "assets", cssFiles[0]), "utf8"),
    readFile(join(assetDirectory, "assets", entries[0]), "utf8"),
    readFile(join(assetDirectory, "_headers"), "utf8"),
  ]);
  if (!headers.includes("/assets/*\n  cache-control: public, max-age=31536000, immutable"))
    throw new Error("Fingerprinted fonts must have the reviewed assets cache rule");

  const faces = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map((match) => match[1]);
  const checked = [];
  for (const font of FONTS) {
    const matches = faces.filter((face) =>
      new RegExp("font-family:\\s*[\"']?" + font.family + "[\"']?\\s*;").test(face),
    );
    if (matches.length !== 1) throw new Error("Brand font faces must be unique");
    const face = matches[0];
    const source = face.match(/src:\s*url\(\s*["']?([^"')\s]+)["']?\s*\)/)?.[1];
    if (
      !source ||
      !new RegExp("^/assets/" + font.file + "-[\\w-]{6,}\\.woff2$").test(source) ||
      !/font-display:\s*swap(?:;|$)/.test(face) ||
      !new RegExp("font-weight:\\s*" + font.weight + "(?:;|$)").test(face) ||
      !client.includes(source)
    )
      throw new Error(
        "Brand fonts must use matching fingerprinted URLs, swap and approved weights",
      );

    const name = source.slice("/assets/".length);
    const [built, original] = await Promise.all([
      readFile(join(assetDirectory, "assets", name)),
      readFile(join(sourceDirectory, font.file + ".woff2")),
    ]);
    if (!built.equals(original)) throw new Error("Built brand font bytes differ from source");
    checked.push({
      family: font.family,
      url: source,
      bytes: built.length,
      sha256: createHash("sha256").update(built).digest("hex"),
    });
  }
  const actual = files.filter((name) => name.endsWith(".woff2")).sort();
  const expected = checked.map((font) => font.url.slice("/assets/".length)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error("Static assets contain missing or duplicate font files");
  return checked;
}
