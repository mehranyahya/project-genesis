import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  SUBMIT_FLOOD_LIMIT_BINDING,
  enforcePublicSubmitFloodLimit,
} from "../server";

const endpoint = "https://mehrara.example/api/submit-request";
const ip = "203.0.113.7";

function submitRequest(headers: HeadersInit = {}): Request {
  const next = new Headers(headers);
  if (!next.has("cf-connecting-ip")) next.set("cf-connecting-ip", ip);
  return new Request(endpoint, {
    method: "POST",
    headers: next,
    body: "{}",
  });
}

test("submit flood limiter uses the Cloudflare IP as the exact binding key", async () => {
  const keys: string[] = [];
  const env = {
    [SUBMIT_FLOOD_LIMIT_BINDING]: {
      limit: async ({ key }: { readonly key: string }) => {
        keys.push(key);
        return { success: true };
      },
    },
  };

  assert.equal(await enforcePublicSubmitFloodLimit(submitRequest(), env), null);
  assert.deepEqual(keys, [ip]);
});

test("binding rejection returns only the generic public rate-limited response", async () => {
  const env = {
    [SUBMIT_FLOOD_LIMIT_BINDING]: {
      limit: async () => ({ success: false }),
    },
  };

  const response = await enforcePublicSubmitFloodLimit(submitRequest(), env);
  assert.ok(response);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await response.json(), { code: "RATE_LIMITED" });
});

test("flood limiter ignores other routes and non-POST requests", async () => {
  let calls = 0;
  const env = {
    [SUBMIT_FLOOD_LIMIT_BINDING]: {
      limit: async () => {
        calls += 1;
        return { success: false };
      },
    },
  };

  const get = new Request(endpoint, {
    method: "GET",
    headers: { "cf-connecting-ip": ip },
  });
  const other = new Request("https://mehrara.example/contact", {
    method: "POST",
    headers: { "cf-connecting-ip": ip },
    body: "{}",
  });

  assert.equal(await enforcePublicSubmitFloodLimit(get, env), null);
  assert.equal(await enforcePublicSubmitFloodLimit(other, env), null);
  assert.equal(calls, 0);
});

test("missing or invalid Cloudflare IP never collapses users onto a shared empty key", async () => {
  let calls = 0;
  const env = {
    [SUBMIT_FLOOD_LIMIT_BINDING]: {
      limit: async () => {
        calls += 1;
        return { success: false };
      },
    },
  };

  const missing = new Request(endpoint, { method: "POST", body: "{}" });
  const invalid = submitRequest({ "cf-connecting-ip": "not-an-ip" });

  assert.equal(await enforcePublicSubmitFloodLimit(missing, env), null);
  assert.equal(await enforcePublicSubmitFloodLimit(invalid, env), null);
  assert.equal(calls, 0);
});

test("missing binding is non-fatal because PostgreSQL remains the authoritative limiter", async () => {
  assert.equal(await enforcePublicSubmitFloodLimit(submitRequest(), {}), null);
  assert.equal(await enforcePublicSubmitFloodLimit(submitRequest(), null), null);
});

test("binding infrastructure failure fails open without logging the client IP", async () => {
  const originalError = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };

  try {
    const env = {
      [SUBMIT_FLOOD_LIMIT_BINDING]: {
        limit: async () => {
          throw new Error(`provider failure for ${ip}`);
        },
      },
    };

    assert.equal(await enforcePublicSubmitFloodLimit(submitRequest(), env), null);
    assert.deepEqual(logged, [["Worker submit flood limiter unavailable"]]);
    assert.equal(JSON.stringify(logged).includes(ip), false);
  } finally {
    console.error = originalError;
  }
});

test("Worker checks flood protection before cloning or parsing the request body", () => {
  const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  const flood = server.indexOf("await enforcePublicSubmitFloodLimit(request, env)");
  const body = server.indexOf("await enforcePublicSubmitBodyLimit(request)");
  const handler = server.indexOf("await getServerEntry()");

  assert.ok(flood >= 0);
  assert.ok(body > flood);
  assert.ok(handler > body);
});

test("generated Cloudflare config is prepared and verified at 300 attempts per minute", () => {
  const prepare = readFileSync(
    new URL("../../scripts/prepare-cloudflare-deploy.mjs", import.meta.url),
    "utf8",
  );
  const verify = readFileSync(
    new URL("../../scripts/verify-cloudflare-deploy.mjs", import.meta.url),
    "utf8",
  );

  for (const source of [prepare, verify]) {
    assert.match(source, /SUBMIT_FLOOD_LIMITER/);
    assert.match(source, /1322772730/);
    assert.match(source, /300/);
    assert.match(source, /60/);
  }
  assert.match(prepare, /config\.ratelimits/);
  assert.match(verify, /submitFloodLimiters\.length !== 1/);
});
