import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

interface Message {
  event: "request_received";
  to: string;
  locale: "fa" | "en";
  templateId: string;
  parameters: { tracking_code: string };
  idempotencyKey: string;
}
interface Provider {
  id: string;
  send: (message: Message, signal: AbortSignal) => Promise<unknown>;
}
interface Config {
  baseUrl: string;
  serviceRoleKey: string;
}
interface Dependencies {
  readEnv: (name: string) => string | undefined;
  resolveProvider: (id: string) => Provider | null;
  rpc: <T>(config: Config, name: string, body: Readonly<Record<string, unknown>>) => Promise<T>;
  now: () => number;
}
interface Summary {
  state: string;
  claimed: number;
  accepted: number;
  retryScheduled: number;
  uncertain: number;
  terminal: number;
  completionFailures: number;
}
const delivery = (await import(
  new URL("../../supabase/functions/_shared/sms-delivery.ts", import.meta.url).href
)) as {
  processSmsRecoveryBatch: (config: Config, deps: Dependencies) => Promise<Summary>;
  processSmsByRequestId: (config: Config, id: string, deps: Dependencies) => Promise<Summary>;
};
const adapter = (await import(
  new URL("../../supabase/functions/_shared/sms-provider.ts", import.meta.url).href
)) as {
  resolveSmsProvider: (id: string) => Provider | null;
  parseSmsOutcome: (value: unknown) => unknown;
  postSmsJson: (
    input: {
      endpoint: string;
      allowedOrigin: string;
      headers: Record<string, string>;
      body: Record<string, unknown>;
      signal: AbortSignal;
    },
    fetcher: typeof fetch,
  ) => Promise<{ status: number; body: unknown }>;
};
const config = { baseUrl: "https://synthetic.invalid", serviceRoleKey: "synthetic-not-a-real-key" };
const now = Date.parse("2026-10-20T03:00:00Z");
const id = "11111111-1111-4111-8111-111111111111";
const job = {
  request_id: id,
  provider_id: "synthetic",
  template_id: "receipt-fa-v1",
  locale: "fa",
  attempt: 1,
  lease_token: "22222222-2222-4222-8222-222222222222",
  lease_until: new Date(now + 120_000).toISOString(),
};
const authorize = { code: "SEND_ALLOWED", phone: "+989000000001", tracking_code: "REQ-1001" };

function harness(
  options: {
    enabled?: string;
    jobs?: unknown[];
    auth?: unknown;
    outcome?: unknown;
    completion?: unknown;
    sendError?: boolean;
    failCompletion?: boolean;
  } = {},
) {
  const calls: { name: string; body: Readonly<Record<string, unknown>> }[] = [];
  const messages: Message[] = [];
  const deps: Dependencies = {
    readEnv: (name) =>
      ({ SMS_DELIVERY_ENABLED: options.enabled ?? "true", SMS_PROVIDER_ID: "synthetic" })[
        name as "SMS_DELIVERY_ENABLED" | "SMS_PROVIDER_ID"
      ],
    now: () => now,
    resolveProvider: () => ({
      id: "synthetic",
      send: async (message, signal) => {
        messages.push(message);
        assert.equal(signal.aborted, false);
        if (options.sendError) throw new Error("synthetic-private-provider-body-and-key");
        return options.outcome ?? { kind: "accepted", receipt: "synthetic-receipt" };
      },
    }),
    rpc: async <T>(_config: Config, name: string, body: Readonly<Record<string, unknown>>) => {
      calls.push({ name, body });
      if (name === "claim_sms_notifications")
        return { code: "CLAIMED", items: options.jobs ?? [job] } as T;
      if (name === "authorize_sms_attempt") return (options.auth ?? authorize) as T;
      if (options.failCompletion) throw new Error("synthetic-private-storage-error");
      return (options.completion ?? { code: "ACCEPTED" }) as T;
    },
  };
  return { deps, calls, messages };
}

test("disabled/default SMS performs no DB/provider work, including immediate delivery", async () => {
  for (const value of ["false", "", undefined]) {
    const h = harness();
    h.deps.readEnv = () => value;
    assert.equal((await delivery.processSmsRecoveryBatch(config, h.deps)).state, "disabled");
    assert.equal((await delivery.processSmsByRequestId(config, id, h.deps)).state, "disabled");
    assert.equal(h.calls.length, 0);
    assert.equal(h.messages.length, 0);
  }
});

test("no environment key, arbitrary provider or truthy spelling enables a sender", async () => {
  for (const value of ["synthetic", "kavenegar", "generic-http", "mock", "dry-run", ""])
    assert.equal(adapter.resolveSmsProvider(value), null);
  for (const enabled of ["TRUE", "1", "yes"]) {
    const h = harness({ enabled });
    assert.equal((await delivery.processSmsRecoveryBatch(config, h.deps)).state, "unconfigured");
    assert.equal(h.calls.length, 0);
  }
  const h = harness();
  h.deps.resolveProvider = adapter.resolveSmsProvider;
  assert.equal((await delivery.processSmsRecoveryBatch(config, h.deps)).state, "unconfigured");
  assert.equal(h.calls.length, 0);
});

test("FA/EN receipts contain only tracking data and use a stable provider idempotency key", async () => {
  for (const locale of ["fa", "en"] as const) {
    const h = harness({
      jobs: [{ ...job, locale, template_id: `receipt-${locale}-v1`, attempt: 2 }],
    });
    const result = await delivery.processSmsByRequestId(config, id, h.deps);
    assert.equal(result.accepted, 1);
    assert.deepEqual(h.messages, [
      {
        event: "request_received",
        to: authorize.phone,
        locale,
        templateId: `receipt-${locale}-v1`,
        parameters: { tracking_code: "REQ-1001" },
        idempotencyKey: `receipt:${id}`,
      },
    ]);
    assert.deepEqual(
      h.calls.map((c) => c.name),
      ["claim_sms_notifications", "authorize_sms_attempt", "complete_sms_notification"],
    );
    assert.equal(h.calls[0]!.body["p_limit"], 1);
    assert.equal(h.calls[2]!.body["p_lease_token"], job.lease_token);
    const summary = JSON.stringify(result);
    for (const secret of [authorize.phone, id, "synthetic-receipt", config.serviceRoleKey])
      assert.equal(summary.includes(secret), false);
  }
});

test("malformed/duplicate/oversized/cross-provider/expired claims never reach a sender", async () => {
  for (const jobs of [
    [job, job],
    [{ ...job, provider_id: "other" }],
    [{ ...job, phone: authorize.phone }],
    [{ ...job, attempt: "1" }],
    [{ ...job, locale: "ar" }],
    [{ ...job, template_id: "../template" }],
    [{ ...job, lease_until: new Date(now - 1).toISOString() }],
    Array(6).fill(job),
  ]) {
    const h = harness({ jobs });
    await assert.rejects(delivery.processSmsRecoveryBatch(config, h.deps), /SMS claim invalid/);
    assert.equal(h.messages.length, 0);
  }
  const h = harness();
  await assert.rejects(
    delivery.processSmsByRequestId(config, "33333333-3333-4333-8333-333333333333", h.deps),
    /SMS claim invalid/,
  );
  assert.equal(h.messages.length, 0);
});

test("DB kill switch/stale authorization and erased or malformed recipient prevent I/O", async () => {
  for (const auth of [
    { code: "CANCELLED" },
    { code: "STALE" },
    { ...authorize, phone: null },
    { ...authorize, phone: "09121234567" },
    { ...authorize, tracking_code: "unsafe\nvalue" },
    { ...authorize, customer_note: "private" },
  ]) {
    const h = harness({ auth });
    await delivery.processSmsRecoveryBatch(config, h.deps);
    assert.equal(h.messages.length, 0);
    assert.equal(h.calls.length, 2);
  }
});

test("short remaining lease prevents late send and leaves conservative recovery to the DB", async () => {
  const h = harness({ jobs: [{ ...job, lease_until: new Date(now + 19_000).toISOString() }] });
  const result = await delivery.processSmsRecoveryBatch(config, h.deps);
  assert.equal(h.messages.length, 0);
  assert.equal(result.completionFailures, 1);
});

test("provider timeout/exception and unrecognized responses become uncertain, never retryable", async () => {
  for (const options of [
    { sendError: true },
    { outcome: { kind: "accepted" } },
    { outcome: { kind: "retryable", retryAfterSeconds: 0 } },
    { outcome: { kind: "accepted", receipt: "safe", private: "body" } },
    { outcome: { status: 503 } },
  ]) {
    const h = harness({ ...options, completion: { code: "UNCERTAIN" } });
    const result = await delivery.processSmsRecoveryBatch(config, h.deps);
    assert.equal(h.messages.length, 1);
    assert.equal(result.uncertain, 1);
    assert.equal(h.calls[2]!.body["p_outcome"], "uncertain");
    assert.equal(h.calls[2]!.body["p_retry_after_seconds"], null);
    assert.equal(h.calls[2]!.body["p_provider_receipt"], null);
  }
});

test("only explicit adapter not-accepted outcome requests a bounded retry", async () => {
  const h = harness({
    outcome: { kind: "retryable", retryAfterSeconds: 3600 },
    completion: { code: "RETRY_SCHEDULED" },
  });
  assert.equal((await delivery.processSmsRecoveryBatch(config, h.deps)).retryScheduled, 1);
  assert.equal(h.calls[2]!.body["p_retry_after_seconds"], 3600);
  assert.deepEqual(adapter.parseSmsOutcome({ kind: "permanent_failure" }), {
    kind: "permanent_failure",
  });
});

test("completion failure/stale result never reports success or resends within the invocation", async () => {
  for (const options of [
    { failCompletion: true },
    { completion: { code: "STALE" } },
    { completion: { code: "ACCEPTED", private: "data" } },
  ]) {
    const h = harness(options);
    const result = await delivery.processSmsRecoveryBatch(config, h.deps);
    assert.equal(result.accepted, 0);
    assert.equal(result.completionFailures, 1);
    assert.equal(h.messages.length, 1);
  }
});

test("batch size and concurrent provider calls are bounded independently of Telegram", async () => {
  const jobs = Array.from({ length: 5 }, (_, i) => ({
    ...job,
    request_id: `11111111-1111-4111-8111-11111111111${i}`,
  }));
  const h = harness({ jobs });
  let active = 0;
  let peak = 0;
  h.deps.resolveProvider = () => ({
    id: "synthetic",
    send: async () => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return { kind: "accepted", receipt: "synthetic" };
    },
  });
  const result = await delivery.processSmsRecoveryBatch(config, h.deps);
  assert.equal(result.accepted, 5);
  assert.equal(peak, 2);
});

test("future JSON transport uses TLS, allowlisted origin, no redirects/cache and bounded JSON", async () => {
  const input = {
    endpoint: "https://panel.synthetic.invalid/v1/receipt",
    allowedOrigin: "https://panel.synthetic.invalid",
    headers: { authorization: "synthetic-panel-key" },
    body: { recipient: authorize.phone },
    signal: AbortSignal.timeout(1000),
  };
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(String(url), input.endpoint);
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal);
    return new Response('{"accepted":true}', { status: 503 });
  };
  assert.deepEqual(await adapter.postSmsJson(input, fetcher), {
    status: 503,
    body: { accepted: true },
  });
  for (const endpoint of [
    "http://panel.synthetic.invalid/v1",
    "https://other.invalid/v1",
    `${input.endpoint}?key=secret`,
    "https://user:secret@panel.synthetic.invalid/v1",
    `${input.endpoint}#fragment`,
  ]) {
    await assert.rejects(adapter.postSmsJson({ ...input, endpoint }, fetcher));
  }
  assert.equal(calls, 1);
  for (const response of [
    new Response("x".repeat(16385)),
    new Response("not JSON"),
    new Response(new Uint8Array([0xc3, 0x28])),
    new Response("{}", { headers: { "content-length": "16385" } }),
    new Response('{"id":1,"id":2}'),
  ]) {
    await assert.rejects(adapter.postSmsJson(input, async () => response));
  }
});

function loadEdge(
  entry: string,
  modules: Record<string, unknown>,
  env: Record<string, string> = {},
) {
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const tasks: Promise<unknown>[] = [];
  const source = readFileSync(
    new URL(`../../supabase/functions/${entry}/index.ts`, import.meta.url),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(
    code,
    {
      exports: {},
      Request,
      Response,
      Headers,
      URL,
      performance,
      console: { log() {}, error() {} },
      require: (name: string) => {
        assert.ok(name in modules, `Unexpected Edge dependency ${name}`);
        return modules[name];
      },
      Deno: {
        env: { get: (name: string) => env[name] },
        serve: (callback: typeof handler) => {
          handler = callback;
        },
      },
      EdgeRuntime: { waitUntil: (task: Promise<unknown>) => tasks.push(task) },
    },
    { timeout: 1000 },
  );
  assert.ok(handler);
  return { handler, tasks };
}

test("actual recovery entry runs SMS even when Telegram rejects, and rejects unauthenticated triggers", async () => {
  let smsCalls = 0;
  const modules = {
    "../_shared/cron-auth.ts": { verifyRecoveryCronRequest: async () => ({ kind: "ok" }) },
    "../_shared/supabase-rest.ts": { readSupabaseServerConfig: () => config },
    "../_shared/telegram-delivery.ts": {
      processTelegramRecoveryBatch: async () => {
        throw new Error("synthetic-telegram-failure");
      },
    },
    "../_shared/sms-delivery.ts": {
      processSmsRecoveryBatch: async () => {
        smsCalls++;
        return { state: "disabled", completionFailures: 0 };
      },
    },
  };
  assert.equal(
    (await loadEdge("telegram-recovery", modules).handler(new Request("https://synthetic.invalid")))
      .status,
    503,
  );
  assert.equal(smsCalls, 1);
  modules["../_shared/cron-auth.ts"].verifyRecoveryCronRequest = async () => ({ kind: "invalid" });
  assert.equal(
    (await loadEdge("telegram-recovery", modules).handler(new Request("https://synthetic.invalid")))
      .status,
    401,
  );
  assert.equal(smsCalls, 1);
});

test("actual submit entry schedules receipt only after a new persisted request, never for replay/failure", async () => {
  for (const storedCode of ["REQUEST_CREATED", "REQUEST_REPLAYED", "TEMPORARILY_UNAVAILABLE"]) {
    let sends = 0;
    const modules = {
      "../_shared/crypto.ts": {
        canonicalJson: JSON.stringify,
        hmacSha256Hex: async () => "a".repeat(64),
      },
      "../_shared/gateway-auth.ts": {
        verifyGatewayEnvelope: async () => ({
          kind: "ok",
          envelope: { gateway: { worker_request_id: id, ip_hash: null }, payload: {} },
        }),
      },
      "../_shared/request-business.ts": {
        prepareBusinessRequest: async () => ({ ok: true, storage: {} }),
      },
      "../_shared/request-contract.ts": {
        parseRequestPayload: () => ({
          ok: true,
          value: {
            request: { submission_id: id },
            honeypotFilled: false,
            formFillDurationMs: null,
          },
        }),
      },
      "../_shared/supabase-rest.ts": {
        readSupabaseServerConfig: () => config,
        supabaseRpc: async (_config: unknown, name: string) =>
          name === "inspect_request_idempotency"
            ? { code: "MISSING" }
            : { code: storedCode, request_id: id, tracking_code: "REQ-1001" },
      },
      "../_shared/telegram-delivery.ts": { processTelegramByRequestId: async () => ({}) },
      "../_shared/sms-delivery.ts": {
        processSmsByRequestId: async () => {
          sends++;
          throw new Error("synthetic-sms-failure");
        },
      },
      "../_shared/turnstile.ts": {
        verifyTurnstile: async () => ({
          kind: "accepted",
          botVerification: "verified",
          riskFlags: [],
        }),
      },
      "../_shared/json.ts": { parseStrictJson: JSON.parse },
    };
    const edge = loadEdge("submit-request", modules, {
      REQUEST_FINGERPRINT_KEYS_JSON: JSON.stringify({ "key-v1": "x".repeat(32) }),
      REQUEST_FINGERPRINT_PRIMARY_KEY_ID: "key-v1",
      TRACKING_CODE_PREFIX: "REQ",
    });
    const response = await edge.handler(new Request("https://synthetic.invalid"));
    await Promise.all(edge.tasks);
    assert.equal(
      response.status,
      storedCode === "REQUEST_CREATED" ? 201 : storedCode === "REQUEST_REPLAYED" ? 200 : 503,
    );
    assert.equal(sends, storedCode === "REQUEST_CREATED" ? 1 : 0);
  }
});
