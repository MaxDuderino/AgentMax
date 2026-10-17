/** Where the kit's routes live. Change here if a project mounts them elsewhere. */
export const artApi = {
  factory: "/api/admin/art-factory",
  settings: "/api/admin/art/settings",
  usage: "/api/admin/usage",
  login: "/api/admin/login",
  make: "/api/art/make",
  made: "/api/art/made/",
} as const;

export type Answer<T> = { ok: true; value: T } | { ok: false; message: string };

export async function send<T>(url: string, body: Record<string, unknown>): Promise<Answer<T>> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const value = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
    return response.ok ? { ok: true, value } : { ok: false, message: value.error?.message ?? `That did not work (HTTP ${response.status}).` };
  } catch {
    return { ok: false, message: "No answer from the server." };
  }
}

export async function read<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

/** The address an approved picture is always at: approved art first, else the public folder's copy. */
export function artSrc(path: string): string {
  return `${artApi.made}${path.replace(/^\/+/, "").replace(/^public\//, "")}`;
}

export const money = (usd: number | null | undefined) => (usd == null ? "no price yet" : usd < 0.1 ? `${(usd * 100).toFixed(1)}¢` : `$${usd.toFixed(2)}`);
