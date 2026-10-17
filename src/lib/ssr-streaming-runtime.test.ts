import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("production router streaming and dehydration preserve locale, status, metadata and nonce without serializing internal errors", async () => {
  const repository = fileURLToPath(new URL("../../", import.meta.url));
  const directory = await mkdtemp(join(repository, ".ssr-streaming-runtime-"));
  try {
    const script = `
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { mock } from "bun:test";
import { createMemoryHistory } from "@tanstack/react-router";
import { _getRenderedMatches } from "@tanstack/router-core";
import { attachRouterServerSsrUtils, normalizeSsrResponse } from "@tanstack/router-core/ssr/server";
import { defaultStreamHandler } from "@tanstack/react-start-server";
import { createStart, createMiddleware, createCsrfMiddleware } from "@tanstack/start-client-core";
const title = "Synthetic </script><script>synthetic</script> & heading";
function product(locale, slug = "shared-stone") {
  return { locale, slug, id: "test-product", code: "TEST-1", type: "simple",
    title: locale + " Synthetic product", summary: null, description: null, isActive: true, isFeatured: false,
    media: [], updatedAt: "2026-10-13T01:02:03Z", seo: null,
    variants: [{ id: "test-variant", stoneCode: "granite", sizeCode: "120x60", priceType: "review",
      amountToman: null, priceUpdatedAt: null, includes: [], excludes: [], options: [], isAvailable: true }] };
}
function guide(locale, slug = "shared-care", robots = "index,follow") {
  return { locale, slug, title, summary: locale + " Synthetic summary", body: locale + " Synthetic reviewed article.",
    updatedAt: "2026-10-13", seo: { title: locale + " Search title", description: null, robots, canonicalPath: null } };
}
mock.module("../src/lib/content/generated-structured-content.ts", () => ({
  GENERATED_PRODUCTS: [product("fa"),product("en"), product("fa","ambiguous-stone"),
    product("fa","ambiguous-stone"), product("en","ambiguous-stone"), product("en","ambiguous-stone")], GENERATED_PORTFOLIO_ITEMS: [],
  GENERATED_BUILDING_MEDIA: { fa: [], en: [] }, GENERATED_SITE: null, GENERATED_SITES: { fa: null, en: null },
  GENERATED_CATALOG_VERSION: null, STRUCTURED_CONTENT_GENERATED: true, STRUCTURED_TRANSLATIONS_SUPPORTED: true,
}));
mock.module("../src/lib/content/generated-guides.ts", () => ({
  GIT_GUIDES: { fa: [guide("fa"), guide("fa", "hidden-care", "noindex,follow")],
    en: [guide("en"), guide("en", "hidden-care", "noindex,follow")] }, GUIDE_SOURCES_SUPPORTED: true,
}));
mock.module("../src/lib/content/generated-pages.ts", () => ({ GIT_PAGES: { fa: {}, en: {} } }));
mock.module("@tanstack/react-start", () => ({
  createStart, createMiddleware, createCsrfMiddleware,
  createIsomorphicFn: () => ({ server: (fn) => fn }),
  createServerFn: () => {
    let validator = (data) => data;
    const builder = { validator: (fn) => { validator = fn; return builder; },
      handler: (fn) => async (input = {}) => fn({ data: validator(input.data) }) };
    return builder;
  },
}));
mock.module("../src/styles.css?url", () => ({ default: "/synthetic-test.css" }));
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls++; throw new Error("Offline streaming test rejected network"); };
const { getRouter } = await import("../src/router.tsx");
const { startInstance } = await import("../src/start.ts");
const startOptions = await startInstance.getOptions();
const nonces = new Set();
function decodeState(html, router) {
  const sandbox = { document: { currentScript: { remove() {} } } };
  sandbox.self = sandbox;
  const blocks = [...html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/g)];
  assert.ok(blocks.length >= 2, "dehydration and client entry must both exist");
  for (const [, attrs, code] of blocks) {
    assert.ok(attrs.includes('nonce="' + router.options.ssr.nonce + '"') || attrs.includes("nonce='" + router.options.ssr.nonce + "'"));
    if (/type="application\\/ld\\+json"|\\bsrc=/.test(attrs)) continue;
    // React's paint/reveal instructions need a DOM. Decode only Router transport
    // here; every inline script above still has its response nonce checked.
    if (!code.includes("$_TSR")) continue;
    runInNewContext(code, sandbox, { timeout: 1000 });
  }
  if (router.options.serializationAdapters?.length) {
    sandbox.$_TSR.t = new Map(router.options.serializationAdapters.map(adapter => [adapter.key, adapter.fromSerializable]));
    sandbox.$_TSR.buffer.forEach(fn => fn());
  }
  assert.ok(sandbox.$_TSR.streamEnded, "stream termination marker must arrive before document end");
  return sandbox.$_TSR.router;
}
async function http(path, userAgent, fault = false, dispose = false) {
  const router = getRouter();
  router.update({ history: createMemoryHistory({ initialEntries: [path] }), isServer: true,
    serializationAdapters: startOptions.serializationAdapters });
  const nonce = router.options.ssr.nonce;
  assert.match(nonce,/^[a-f0-9]{32}$/); assert.ok(!nonces.has(nonce));nonces.add(nonce);
  if (fault) {
    // Controlled loader failure on an existing route, without changing its head/view.
    router.routesById["/quote"].options.loader = () => {
      throw Object.assign(new Error("PrivateSynthetic-message"), {
        cause: new Error("PrivateSynthetic-cause"), stack: "PrivateSynthetic-stack",
        name: "PrivateSynthetic-name", internal: "PrivateSynthetic-property",
      });
    };
  }
  attachRouterServerSsrUtils({ router, manifest: { routes: {
    __root__: { scripts: [{ attrs: { type: "module", src: "/assets/synthetic-client.js" } }] },
    "/unmatched": { scripts: [{ attrs: { type: "module", src: "/assets/UnmatchedSynthetic.js" } }] },
  } } });
  let cleanups = 0;
  router.serverSsr.onCleanup(() => { cleanups++; });
  await router.load();
  await router.serverSsr.dehydrate();
  const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
  for (const match of router.state.matches) for (const [name,value] of Object.entries(match.headers ?? {})) headers.set(name,value);
  const streamed = normalizeSsrResponse(await defaultStreamHandler({ router, request: new Request("https://example.com" + path,{headers:{"User-Agent":userAgent}}), responseHeaders: headers }));
  const response = streamed.response;
  if (dispose) {
    assert.equal(streamed.serverSsrCleanup,"stream");
    await streamed.dispose(new Error("Synthetic cancellation"));
    await streamed.dispose();
    assert.equal(cleanups,1);assert.equal(router.serverSsr,undefined);
    return;
  }
  const html = await response.text();
  assert.equal(cleanups,1);assert.equal(router.serverSsr,undefined);
  assert.ok(html.startsWith("<!DOCTYPE html>"));assert.ok(html.endsWith("</body></html>"));
  assert.ok(response.headers.get("content-security-policy").includes("nonce-" + nonce));
  assert.doesNotMatch(html,/UnmatchedSynthetic|PrivateSynthetic/);
  const state = decodeState(html,router);
  // The patched router excludes descendants hidden by an error/not-found boundary.
  assert.equal(state.matches.length,_getRenderedMatches(router.state.matches).length);
  assert.equal(Object.keys(state.manifest.routes).includes("/unmatched"),false);
  return { response, html, state };
}
for (const userAgent of ["Mozilla/5.0", "Googlebot"]) {
  for (const locale of ["fa", "en"]) {
    const prefix = locale === "en" ? "/en" : "";
    for (const path of ["/guides/missing", "/grave-stones/missing", "/guides/INVALID", "/unknown"]) {
      const {response,html,state} = await http(prefix + path + "?phone=PrivateSynthetic#PrivateSynthetic",userAgent);
      assert.equal(response.status,404,path);
      assert.ok(html.includes('name="robots" content="noindex,follow"'));
      assert.doesNotMatch(html,/rel="canonical"|rel="alternate"|application\\/ld\\+json|property="og:url"/);
      assert.ok(state.matches.some(match => match.s === "notFound" || match.g));
    }
    const upstream = await http(prefix + "/grave-stones/ambiguous-stone",userAgent);
    assert.equal(upstream.response.status,500);
    assert.ok(upstream.html.includes('content="noindex,follow"'));
    assert.doesNotMatch(upstream.html,/Ambiguous product|Multiple products|rel="canonical"|application\\/ld\\+json|property="og:url"/);
    const error = upstream.state.matches.find(match => match.s === "error").e;
    assert.equal(error.message,"Page data unavailable");
    const path = prefix + "/guides/shared-care";
    const {response,html,state} = await http(path,userAgent);
    assert.equal(response.status,200);
    assert.ok(html.includes('<html lang="' + locale + '" dir="' + (locale==="fa"?"rtl":"ltr") + '"'));
    assert.ok(html.includes('property="og:locale" content="' + (locale==="fa"?"fa_IR":"en_US") + '"'));
    assert.equal((html.match(/property="og:type"/g)??[]).length,1);
    const block = html.match(/<script[^>]*type="application\\/ld\\+json"[^>]*>([\\s\\S]*?)<\\/script>/);
    if (process.env.VITE_SITE_URL) { assert.ok(block,html);assert.equal(JSON.parse(block[1]).headline,title); }
    else { assert.equal(block,null);assert.equal(html.includes('property="og:url"'),false); }
    const data = state.matches.find(match => match.l?.slug === "shared-care").l;
    assert.equal(data.title,title);assert.equal(data.summary,locale + " Synthetic summary");
    assert.equal(JSON.stringify(state).includes((locale === "fa"?"en":"fa") + " Synthetic summary"),false);
    const hidden = await http(prefix + "/guides/hidden-care",userAgent);
    assert.equal(hidden.response.status,200);assert.ok(hidden.html.includes(locale + " Synthetic reviewed article."));
    assert.ok(hidden.html.includes('content="noindex,follow"'));assert.equal(hidden.html.includes("application/ld+json"),false);
    for (const readable of ["/quote", "/grave-stones/shared-stone"]) {
      const page = await http(prefix + readable + "?phone=PrivateSynthetic#PrivateSynthetic",userAgent);
      assert.equal(page.response.status,200);
      assert.equal(page.state.matches.at(-1).s,"success");
    }
  }
}
const fault = await http("/quote","Mozilla/5.0",true);
assert.equal(fault.response.status,500);
assert.equal(fault.state.matches.find(match => match.s === "error").e.message,"Page data unavailable");
await http("/guides/shared-care","Mozilla/5.0",false,true);
assert.equal(fetchCalls,0);
console.log("ssr-streaming-runtime-passed");
`;
    const file = join(directory, "fixture.ts");
    await writeFile(file, script);
    for (const origin of ["https://example.com", ""]) {
      const result = spawnSync(process.execPath, [file], {
        cwd: repository,
        encoding: "utf8",
        timeout: 30_000,
        env: { PATH: process.env["PATH"] ?? "", VITE_SITE_URL: origin, NODE_ENV: "production" },
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), "ssr-streaming-runtime-passed");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
