const REQUEST_TIMEOUT_MS = 8_000;

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
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Supabase REST failed (${response.status})`);
  return (await response.json()) as T;
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
