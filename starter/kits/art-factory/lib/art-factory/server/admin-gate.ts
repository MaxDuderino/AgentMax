import type { Env, Kv } from "./kv";

/**
 * Who counts as the admin, for projects that have no accounts yet.
 *
 * One password in the environment (`ADMIN_PASSWORD`). Logging in sets a
 * signed cookie good for 30 days; the signature uses `ADMIN_SESSION_SECRET`
 * when set, else the password itself (so changing the password signs every
 * admin out). Ten tries a minute per address, then a wait.
 *
 * - **No password set, on a laptop** (`NODE_ENV` is not `production`):
 *   everyone is the admin, so the factory works the moment it is installed.
 *   The page says so.
 * - **No password set, live:** nobody is the admin. The login page says to
 *   set `ADMIN_PASSWORD`.
 *
 * A project with real accounts replaces all of this with its own `isAdmin`
 * in `art-factory.config.ts`.
 */
const cookieDays = 30;

export type GateMode = "password" | "open-laptop" | "locked";

export interface AdminGate {
  mode(): GateMode;
  isAdmin(request: Request): Promise<boolean>;
  /** POST `{ password }` → sets the cookie, or says why not. */
  login(request: Request): Promise<Response>;
  logout(): Response;
  readonly cookieName: string;
}

const encoder = new TextEncoder();

async function hmac(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(text)));
  return [...signature].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Same length, every character compared, so the time taken says nothing about how close a guess was. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function passwordGate(options: { env: Env; prefix: string; kv?: Kv; now?: () => number }): AdminGate {
  const cookieName = `${options.prefix.replace(/[^a-z0-9-]/gi, "")}-admin`;
  const now = options.now ?? (() => Date.now());
  const password = () => options.env.ADMIN_PASSWORD?.trim() ?? "";
  const secret = () => options.env.ADMIN_SESSION_SECRET?.trim() || password();
  const live = () => options.env.NODE_ENV === "production";

  const mode = (): GateMode => (password() ? "password" : live() ? "locked" : "open-laptop");

  async function sign(expires: number) {
    return `${expires}.${await hmac(secret(), `admin:${expires}`)}`;
  }

  return {
    cookieName,
    mode,
    async isAdmin(request) {
      const current = mode();
      if (current === "open-laptop") return true;
      if (current === "locked") return false;
      const value = readCookie(request.headers.get("cookie"), cookieName);
      const [expires, signature] = (value ?? "").split(".");
      const until = Number(expires);
      if (!signature || !Number.isFinite(until) || until < now()) return false;
      return sameText(signature, (await sign(until)).split(".")[1]!);
    },
    async login(request) {
      if (mode() === "locked") return Response.json({ error: { code: "no-password", message: "No admin password is set. Add ADMIN_PASSWORD to the project's environment variables and redeploy." } }, { status: 400 });
      if (mode() === "open-laptop") return Response.json({ ok: true, note: "No password is set on this computer, so you are already the admin." });
      const address = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0]!.trim();
      if (options.kv) {
        const key = `${options.prefix}:admin-login:${new Date(now()).toISOString().slice(0, 16)}:${address}`;
        const tries = await options.kv.incr(key);
        if (tries === 1) await options.kv.expire(key, 120);
        if (tries > 10) return Response.json({ error: { code: "slow-down", message: "Too many tries. Wait a minute and try again." } }, { status: 429 });
      }
      const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
      const given = typeof body?.password === "string" ? body.password : "";
      const ok = sameText(await hmac("compare", given), await hmac("compare", password()));
      if (!ok) return Response.json({ error: { code: "wrong-password", message: "That is not the admin password." } }, { status: 401 });
      const expires = now() + cookieDays * 24 * 60 * 60 * 1000;
      const secure = live() ? "; Secure" : "";
      return Response.json(
        { ok: true },
        { headers: { "set-cookie": `${cookieName}=${encodeURIComponent(await sign(expires))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${cookieDays * 24 * 60 * 60}${secure}` } },
      );
    },
    logout() {
      return Response.json({ ok: true }, { headers: { "set-cookie": `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` } });
    },
  };
}
