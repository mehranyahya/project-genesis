import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { verifyStaticFontDelivery } from "../../scripts/static-font-delivery.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const fontSource = join(repository, "src/assets/fonts");
const fonts = [
  ["Estedad", "estedad-400-500", "400 500"],
  ["Beiruti", "beiruti-500", "500"],
];
const cacheRule = "/assets/*\n  cache-control: public, max-age=31536000, immutable\n";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "genesis-static-fonts-"));
  const assets = join(root, "assets");
  mkdirSync(assets);
  const css = fonts
    .map(
      ([family, name, weight]) =>
        `@font-face{font-family:${family};src:url(/assets/${name}-fixture123.woff2);font-weight:${weight};font-display:swap}`,
    )
    .join("");
  const client = JSON.stringify(fonts.map(([, name]) => `/assets/${name}-fixture123.woff2`));
  for (const [, name] of fonts)
    copyFileSync(join(fontSource, name + ".woff2"), join(assets, name + "-fixture123.woff2"));
  const set = (name: string, text: string) => writeFileSync(join(root, name), text);
  set("assets/styles-fixture123.css", css);
  set("assets/index-fixture123.js", client);
  set("_headers", cacheRule);
  return {
    root,
    css,
    client,
    set,
    verify: () => verifyStaticFontDelivery({ assetDirectory: root, sourceDirectory: fontSource }),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("artifact verification requires the original two font binaries, shared client/CSS URLs and immutable asset policy", async () => {
  const f = fixture();
  try {
    const result = await f.verify();
    assert.deepEqual(
      result.map((font) => font.family),
      ["Estedad", "Beiruti"],
    );
    assert.equal(
      result.reduce((sum, font) => sum + font.bytes, 0),
      130972,
    );
    assert.equal(
      result[0]!.sha256,
      "fa5b933b99f547556fbe3aa9e9d842e7586c4dfa8450a28109c9c3317b1e1b6e",
    );
    assert.equal(
      result[1]!.sha256,
      "002daf61aff87803e46729e80de8128e0b4e133aadbb43c091512b85b0a01fcb",
    );
  } finally {
    f.cleanup();
  }
});

test("fixed, inline, remote and private-query font URLs or a missing client preload reference fail closed", async () => {
  const f = fixture();
  try {
    for (const url of [
      "/fonts/estedad-400-500.woff2",
      "data:font/woff2;base64,fixture",
      "https://example.com/font.woff2",
      "/assets/estedad-400-500-fixture123.woff2?PrivateSynthetic",
    ]) {
      f.set(
        "assets/styles-fixture123.css",
        f.css.replace("/assets/estedad-400-500-fixture123.woff2", url),
      );
      await assert.rejects(f.verify(), /matching fingerprinted URLs/);
    }
    f.set("assets/styles-fixture123.css", f.css);
    f.set("assets/index-fixture123.js", "[]");
    await assert.rejects(f.verify(), /matching fingerprinted URLs/);
  } finally {
    f.cleanup();
  }
});

test("missing swap, changed weight, duplicate faces and absent immutable policy fail verification", async () => {
  const f = fixture();
  try {
    for (const css of [
      f.css.replace("swap", "block"),
      f.css.replace("400 500", "400 900"),
      f.css + f.css,
    ]) {
      f.set("assets/styles-fixture123.css", css);
      await assert.rejects(f.verify());
    }
    f.set("assets/styles-fixture123.css", f.css);
    f.set("_headers", "/assets/*\n  cache-control: public, max-age=0\n");
    await assert.rejects(f.verify(), /reviewed assets cache/);
  } finally {
    f.cleanup();
  }
});

test("changed bytes, extra fonts and stale client entries cannot pass as the current artifact", async () => {
  const f = fixture();
  try {
    const font = "assets/estedad-400-500-fixture123.woff2";
    appendFileSync(join(f.root, font), "synthetic changed bytes");
    await assert.rejects(f.verify(), /bytes differ/);
    copyFileSync(join(fontSource, "estedad-400-500.woff2"), join(f.root, font));
    f.set("assets/unreviewed-font.woff2", "synthetic");
    await assert.rejects(f.verify(), /duplicate font files/);
    rmSync(join(f.root, "assets/unreviewed-font.woff2"));
    f.set("assets/index-stale123.js", f.client);
    await assert.rejects(f.verify(), /one current CSS and client entry/);
  } finally {
    f.cleanup();
  }
});

test("actual Vite asset builds share font URLs between CSS and preload data, deduplicate and change the URL when bytes change", () => {
  const root = mkdtempSync(join(repository, ".font-versioning-"));
  try {
    mkdirSync(join(root, "src/assets/fonts"), { recursive: true });
    mkdirSync(join(root, "src/styles"), { recursive: true });
    for (const [, name] of fonts)
      copyFileSync(
        join(fontSource, name + ".woff2"),
        join(root, "src/assets/fonts", name + ".woff2"),
      );
    copyFileSync(join(repository, "src/styles/tokens.css"), join(root, "src/styles/tokens.css"));
    symlinkSync(join(repository, "node_modules"), join(root, "node_modules"), "dir");
    writeFileSync(
      join(root, "index.html"),
      '<html><body><script type="module" src="/src/main.js"></script></body></html>',
    );
    const imports = readFileSync(join(repository, "src/routes/__root.tsx"), "utf8")
      .split("\n")
      .filter((line) => /import (bodyFontUrl|headingFontUrl) from/.test(line))
      .map((line) => line.replace("../assets/", "./assets/"));
    writeFileSync(
      join(root, "src/main.js"),
      imports.join("\n") +
        '\nimport "./styles/tokens.css";\ndocument.body.dataset.fonts = JSON.stringify([bodyFontUrl, headingFontUrl]);',
    );
    writeFileSync(
      join(root, "verify.mjs"),
      `
import assert from "node:assert/strict";
import { appendFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { build } from "vite";
const root = process.cwd();
let fetchCalls = 0;globalThis.fetch=async()=>{fetchCalls++;throw new Error("Offline font build rejected network")};
async function urls() {
  await build({configFile:false,root,logLevel:"silent",cacheDir:join(root,".cache"),build:{outDir:"out",emptyOutDir:true}});
  const assets=join(root,"out/assets"),files=readdirSync(assets);
  const css=readFileSync(join(assets,files.find(name=>name.endsWith(".css"))),"utf8");
  const js=readFileSync(join(assets,files.find(name=>name.endsWith(".js"))),"utf8");
  const fonts=files.filter(name=>name.endsWith(".woff2")).sort();
  assert.equal(fonts.length,2);
  for(const name of fonts){assert.ok(css.includes("/assets/"+name));assert.ok(js.includes("/assets/"+name));}
  return fonts;
}
const before=await urls();
appendFileSync(join(root,"src/assets/fonts/estedad-400-500.woff2"),"synthetic-fingerprint-change");
const after=await urls();
assert.notEqual(before.find(name=>name.startsWith("estedad-")),after.find(name=>name.startsWith("estedad-")));
assert.equal(before.find(name=>name.startsWith("beiruti-")),after.find(name=>name.startsWith("beiruti-")));
assert.equal(fetchCalls,0);
console.log("font-versioning-build-passed");
`,
    );
    const result = spawnSync("node", [join(root, "verify.mjs")], {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
      env: { PATH: process.env["PATH"] ?? "" },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "font-versioning-build-passed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
