import assert from "node:assert/strict";
import { test } from "node:test";
import { handleProtectedSubmitRequest } from "./request-api.route.server";
import type { ProtectedSubmitDependencies } from "./request-api.route.server";

// Load the production Edge implementation with injected offline dependencies.
// No Deno env, Supabase call or live Siteverify request occurs in these tests.
const edgeUrl = new URL("../../supabase/functions/_shared/turnstile.ts", import.meta.url).href;
const edgeModule = await import(edgeUrl);
const verifyTurnstile = edgeModule.verifyTurnstile as (
  input: { token: string | null; submissionId: string; fastSubmitSignal: boolean },
  dependencies: { readEnv: (name: string) => string | undefined; fetchSiteverify: typeof fetch },
) => Promise<unknown>;
const env: Readonly<Record<string, string>> = {
  TURNSTILE_SECRET_KEY: "synthetic-secret",
  TURNSTILE_ALLOWED_HOSTNAMES: "stone.example",
  TURNSTILE_EXPECTED_ACTION: "submit_request",
  SITEVERIFY_NAMESPACE_UUID: "11111111-1111-4111-8111-111111111111",
};
const input = {
  token: "synthetic-token",
  submissionId: "22222222-2222-4222-8222-222222222222",
  fastSubmitSignal: false,
};
const deps = (fetchSiteverify: typeof fetch) => ({
  readEnv: (name: string) => env[name],
  fetchSiteverify,
});
const result = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

test("Edge never accepts absent, oversized or malformed proof and never calls Siteverify for it", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return result({ success: true });
  };
  for (const token of [null, "", "x".repeat(2049), "bad\u0001token"]) {
    assert.deepEqual(await verifyTurnstile({ ...input, token }, deps(fetcher)), {
      kind: "invalid",
    });
  }
  assert.equal(calls, 0);
});

test("Edge requires a real positive response, exact action and an allowlisted hostname", async () => {
  const verified: typeof fetch = async (url, init) => {
    assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.equal(init?.redirect, "error");
    const body = init?.body as FormData;
    assert.equal(body.get("response"), "synthetic-token");
    assert.equal(body.get("secret"), "synthetic-secret");
    assert.equal(body.has("remoteip"), false);
    return result({ success: true, hostname: "STONE.EXAMPLE", action: "submit_request" });
  };
  assert.deepEqual(await verifyTurnstile(input, deps(verified)), {
    kind: "accepted",
    botVerification: "verified",
    riskFlags: [],
  });
  for (const value of [
    { success: true, hostname: "stone.example.evil.example", action: "submit_request" },
    { success: true, hostname: "stone.example", action: "other" },
    { success: "true", hostname: "stone.example", action: "submit_request" },
    { success: false, "error-codes": ["timeout-or-duplicate"] },
  ])
    assert.deepEqual(
      await verifyTurnstile(
        input,
        deps(async () => result(value)),
      ),
      { kind: "invalid" },
    );
  assert.deepEqual(
    await verifyTurnstile(
      input,
      deps(async () => result({}, 400)),
    ),
    { kind: "invalid" },
  );
});

test("Edge retries temporary failures once with a stable idempotency key and then fails closed", async () => {
  for (const mode of ["http", "network", "internal"] as const) {
    const keys: unknown[] = [];
    const fetcher: typeof fetch = async (_url, init) => {
      keys.push((init?.body as FormData).get("idempotency_key"));
      if (mode === "network") throw new Error("synthetic-private-network-error");
      return mode === "http"
        ? result({}, 503)
        : result({ success: false, "error-codes": ["internal-error"] });
    };
    assert.deepEqual(await verifyTurnstile(input, deps(fetcher)), { kind: "service_error" });
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
    assert.match(String(keys[0]), /^[0-9a-f-]{36}$/);
  }
});

test("a temporary Edge failure can recover on retry without accepting unverified traffic", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () =>
    ++calls === 1
      ? result({}, 500)
      : result({ success: true, hostname: "stone.example", action: "submit_request" });
  assert.deepEqual(await verifyTurnstile({ ...input, fastSubmitSignal: true }, deps(fetcher)), {
    kind: "accepted",
    botVerification: "verified",
    riskFlags: ["fast_submit_signal"],
  });
  assert.equal(calls, 2);
});

test("missing config and invalid-secret responses cannot become accepted traffic", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return result({ success: false, "error-codes": ["invalid-input-secret"] });
  };
  assert.deepEqual(
    await verifyTurnstile(input, { readEnv: () => undefined, fetchSiteverify: fetcher }),
    { kind: "configuration_error" },
  );
  assert.equal(calls, 0);
  assert.deepEqual(await verifyTurnstile(input, deps(fetcher)), { kind: "configuration_error" });
  assert.equal(calls, 1);
});

test("oversized, malformed and invalid UTF-8 Siteverify responses fail closed", async () => {
  for (const make of [
    () => new Response("x".repeat(16 * 1024 + 1)),
    () => new Response(new Uint8Array([0xc3, 0x28])),
    () => new Response("synthetic-private-malformed-json"),
  ])
    assert.deepEqual(
      await verifyTurnstile(
        input,
        deps(async () => make()),
      ),
      { kind: "service_error" },
    );
});

test("the alternate protected boundary never invokes storage for absent, invalid or unavailable proof", async () => {
  for (const kind of ["no_token", "invalid", "service_error"] as const) {
    let writes = 0;
    const dependencies: ProtectedSubmitDependencies = {
      inspectIdempotency: async () => ({ kind: "missing" }),
      verifyTurnstile: async () => ({ kind }),
      submitRequest: async () => {
        writes++;
        return new Response();
      },
    };
    const response = await handleProtectedSubmitRequest(
      new Request("https://stone.example/api/submit-request"),
      dependencies,
    );
    assert.equal(response.status, kind === "service_error" ? 503 : 422);
    assert.deepEqual(await response.json(), {
      code: kind === "service_error" ? "TEMPORARILY_UNAVAILABLE" : "BOT_VERIFICATION_INVALID",
    });
    assert.equal(writes, 0);
  }
});
