import { parseStrictJson, readBoundedUtf8 } from "./json.ts";

const REQUEST_TIMEOUT_MS = 8_000;
const RESPONSE_BODY_LIMIT = 512 * 1024;

export interface SupabaseServerConfig {
  readonly baseUrl: string;
  readonly serviceRoleKey: string;
}

export function readSupabaseServerConfig(): SupabaseServerConfig {
  const rawUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
  if (rawUrl === "" || serviceRoleKey === "") throw new Error("Supabase server config missing");

  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
    throw new Error("Supabase URL is invalid");
  }
  return { baseUrl: parsed.origin, serviceRoleKey };
}

export async function supabaseRest<T>(
  config: SupabaseServerConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${config.baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`,
      ...(init?.headers ?? {}),
    },
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Supabase REST failed (${response.status})`);
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > RESPONSE_BODY_LIMIT) {
      throw new Error("Supabase REST response exceeded the size limit");
    }
  }
  const raw = await readBoundedUtf8(response.body, RESPONSE_BODY_LIMIT);
  if (raw === null || raw === "") throw new Error("Supabase REST response was invalid");
  return parseStrictJson(raw) as T;
}

export async function supabaseRpc<T>(
  config: SupabaseServerConfig,
  functionName: string,
  body: Readonly<Record<string, unknown>>,
): Promise<T> {
  return supabaseRest<T>(config, `rpc/${encodeURIComponent(functionName)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
