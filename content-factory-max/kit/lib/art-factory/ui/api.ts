/** Where the kit's routes live. Change here if a project mounts them elsewhere. */
export const artApi = {
  factory: "/api/admin/art-factory",
  settings: "/api/admin/art/settings",
  usage: "/api/admin/usage",
  login: "/api/admin/login",
  make: "/api/art/make",
  made: "/api/art/made/",
  text: "/api/art/text",
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

const cleanPath = (path: string) => path.replace(/^\/+/, "").replace(/^public\//, "");

/** A file the factory made, with the words that go with it. */
export interface ArtMedia {
  src: string;
  /** A picture's alt text ("" until known, or for a picture with none). */
  alt: string;
  /** A sound's caption, for people who cannot hear it. */
  caption: string;
}

/** Path → alt text / caption, filled by {@link loadArtText} or {@link seedArtText}. */
const artText = new Map<string, { alt?: string; caption?: string }>();
let loading: Promise<void> | null = null;

/**
 * The address an approved file is always at: approved art first, else the
 * public folder's copy. With `{ withText: true }` it also hands back the alt
 * text (a picture) or caption (a sound) from the catalogue and review, once
 * {@link loadArtText} has run (or {@link seedArtText} on the server):
 *
 * ```tsx
 * const heart = artSrc("art/icons/heart.webp", { withText: true });
 * <img src={heart.src} alt={heart.alt} />
 * ```
 */
export function artSrc(path: string): string;
export function artSrc(path: string, options: { withText: true }): ArtMedia;
export function artSrc(path: string, options?: { withText?: boolean }): string | ArtMedia {
  const src = `${artApi.made}${cleanPath(path)}`;
  if (!options?.withText) return src;
  const words = artText.get(cleanPath(path));
  return { src, alt: words?.alt ?? "", caption: words?.caption ?? "" };
}

/** Puts alt texts and captions in by hand (a server page that read them itself, or a test). */
export function seedArtText(files: Readonly<Record<string, { alt?: string; caption?: string }>>): void {
  for (const [path, words] of Object.entries(files)) artText.set(cleanPath(path), words);
}

/** Reads every alt text and caption from the site once (`/api/art/text`); later calls share the first. */
export function loadArtText(): Promise<void> {
  loading ??= read<{ files: Record<string, { alt?: string; caption?: string }> }>(artApi.text).then((answer) => {
    if (answer) seedArtText(answer.files);
    else loading = null;
  });
  return loading;
}

/**
 * Where to go after signing in: only a path on this site. Backslashes, control characters and anything a browser
 * would read as another host (`//x`, `/\x`) fall back to the factory.
 */
export function safeNext(asked: string | null | undefined, fallback: string): string {
  const value = asked ?? "";
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f\s]/.test(value)) return fallback;
  try {
    const parsed = new URL(value, "http://same.origin");
    return parsed.origin === "http://same.origin" ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
  } catch {
    return fallback;
  }
}

export const money = (usd: number | null | undefined) => (usd == null ? "no price yet" : usd < 0.1 ? `${(usd * 100).toFixed(1)}¢` : `$${usd.toFixed(2)}`);
