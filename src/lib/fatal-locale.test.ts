import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { renderErrorPage } from "./error-page";

test("fatal pages are static, accessible, language-correct and require no client script", () => {
  for (const locale of ["fa", "en"] as const) {
    const html = renderErrorPage(locale);
    assert.ok(html.includes(`<html lang="${locale}" dir="${locale === "fa" ? "rtl" : "ltr"}">`));
    assert.equal((html.match(/<h1>/g) ?? []).length, 1);
    assert.ok(html.includes(locale === "en" ? 'href="/en"' : 'href="/"'));
    assert.equal(/<script|onclick=|onerror=/i.test(html), false);
    assert.ok(html.includes("min-height: 3rem"));
    assert.ok(html.includes("focus-visible"));
    if (locale === "en") assert.equal(/[\u0600-\u06ff]/.test(html), false);
  }
});
test("actual Worker thrown and normalized H3 failures choose the URL language without echoing error or query values", async () => {
  const root = await mkdtemp(join(tmpdir(), "genesis-fatal-worker-"));
  const repo = fileURLToPath(new URL("../../", import.meta.url));
  try {
    const script = `
import assert from "node:assert/strict";
import { mock } from "bun:test";
let mode = "throw";
mock.module("@tanstack/react-start/server-entry", () => ({ default: { fetch: async () => {
  if (mode === "throw") throw new Error("synthetic-private-error");
  if (mode === "json") return Response.json({ unhandled: true, message: "HTTPError" }, { status: 500 });
  return new Response("synthetic-preserved-html", { status: 503, headers: { "content-type": "text/html" } });
} } }));
const worker = (await import(${JSON.stringify(join(repo, "src/server.ts"))})).default;
for (const path of ["/en", "/en/quote", "/enough", "/quote"]) {
  const english = path === "/en" || path.startsWith("/en/");
  for (mode of ["throw", "json"]) {
    const response = await worker.fetch(new Request("https://fixtures.invalid" + path + "?private=synthetic-private-query"), {}, {});
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
    assert.ok(response.headers.get("content-security-policy").includes("default-src 'none'"));
    const html = await response.text();
    assert.ok(html.includes('<html lang="' + (english ? "en" : "fa") + '"'));
    assert.equal(html.includes("synthetic-private"), false);
    if (english) assert.equal(/[\\u0600-\\u06ff]/.test(html), false);
  }
}
mode = "html";
const response = await worker.fetch(new Request("https://fixtures.invalid/en/quote"), {}, {});
assert.equal(response.status, 503);
assert.equal(await response.text(), "synthetic-preserved-html");
console.log("fatal-worker-fixture-passed");
`;
    const file = join(root, "worker-fixture.ts");
    await writeFile(file, script);
    const result = spawnSync(process.execPath, [file], {
      cwd: repo,
      encoding: "utf8",
      timeout: 15_000,
      env: { PATH: process.env["PATH"] ?? "" },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "fatal-worker-fixture-passed");
    assert.equal(result.stderr.includes("synthetic-private"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
