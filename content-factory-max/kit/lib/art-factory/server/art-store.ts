import { R2Error, type R2Client } from "./r2-client";

/**
 * Where pictures are kept (ported from DnD-Max).
 *
 * One layout in one bucket:
 * - `art/<path>`: approved art, at the path the app asks for
 *   (`art/icons/heart.webp`);
 * - `art-factory/review/…`: pictures waiting in the review tray;
 * - `made/…`: pictures made with the Make art buttons.
 *
 * Everything reaches a browser through the app at `/api/art/file/<key>`, so
 * there is one address for everything and no second host to configure.
 * Without R2 (a laptop, a test) the bytes are kept in memory and the same
 * route serves them, so the whole loop still works end to end.
 */
export const artFilePrefix = "/api/art/file/";

export interface StoredFile {
  body: ReadableStream<Uint8Array> | ArrayBuffer;
  contentType: string;
}

export interface ArtStore {
  readonly kind: "r2" | "memory";
  put(key: string, bytes: ArrayBuffer, contentType: string): Promise<{ url: string }>;
  /** The bytes at a URL this store handed out, or `null`. */
  read(url: string): Promise<ArrayBuffer | null>;
  /** For the file route: the file at a key. */
  open(key: string): Promise<StoredFile | null>;
  remove(url: string): Promise<void>;
  /** Count and size of what is stored under a prefix, for the usage panel. */
  measure?(prefix: string): Promise<{ files: number; bytes: number }>;
  /**
   * Why the store will not serve its files right now, if a recent read said
   * so (a bad key, a blocked account). `null` when reads are working.
   */
  problem(): string | null;
}

const keyOf = (url: string) => (url.startsWith(artFilePrefix) ? url.slice(artFilePrefix.length) : null);

export class MemoryArtStore implements ArtStore {
  readonly kind = "memory" as const;
  readonly files = new Map<string, { bytes: ArrayBuffer; contentType: string }>();
  async put(key: string, bytes: ArrayBuffer, contentType: string) {
    this.files.set(key, { bytes, contentType });
    return { url: `${artFilePrefix}${key}` };
  }
  async read(url: string) {
    const key = keyOf(url);
    return key ? (this.files.get(key)?.bytes ?? null) : null;
  }
  async open(key: string) {
    const file = this.files.get(key);
    return file ? { body: file.bytes, contentType: file.contentType } : null;
  }
  async remove(url: string) {
    const key = keyOf(url);
    if (key) this.files.delete(key);
  }
  async measure(prefix: string) {
    let files = 0;
    let bytes = 0;
    for (const [key, file] of this.files) {
      if (!key.startsWith(prefix)) continue;
      files += 1;
      bytes += file.bytes.byteLength;
    }
    return { files, bytes };
  }
  problem() {
    return null;
  }
}

export class R2ArtStore implements ArtStore {
  readonly kind = "r2" as const;
  readonly #r2: R2Client;
  #problem: { said: string; at: number } | null = null;

  constructor(r2: R2Client) {
    this.#r2 = r2;
  }

  #note(error: unknown) {
    // 401/403 from R2 is a key or permission problem, which every later call will share.
    if (error instanceof R2Error && (error.status === 401 || error.status === 403)) this.#problem = { said: error.message, at: Date.now() };
  }

  async put(key: string, bytes: ArrayBuffer, contentType: string) {
    try {
      await this.#r2.put(key, bytes, contentType);
    } catch (error) {
      this.#note(error);
      throw error;
    }
    return { url: `${artFilePrefix}${key}` };
  }
  async read(url: string) {
    const key = keyOf(url);
    if (!key) {
      // An address from somewhere else (a picture approved before a move): try it as a plain URL.
      const response = await fetch(url, { cache: "no-store" }).catch(() => null);
      return response?.ok ? response.arrayBuffer() : null;
    }
    try {
      const bytes = await this.#r2.getBytes(key);
      this.#problem = null;
      return bytes;
    } catch (error) {
      this.#note(error);
      console.error(`[art-factory] R2 read failed: ${error instanceof Error ? error.message : String(error)} (${key})`);
      return null;
    }
  }
  async open(key: string) {
    const found = await this.#r2.get(key);
    return found ? { body: found.body, contentType: found.contentType } : null;
  }
  async remove(url: string) {
    const key = keyOf(url);
    if (key) await this.#r2.remove(key).catch(() => false);
  }
  async measure(prefix: string) {
    const files = await this.#r2.list(prefix);
    return { files: files.length, bytes: files.reduce((sum, one) => sum + one.size, 0) };
  }
  problem() {
    // Remembered ten minutes, so a refusing store stops the factory without a read per picture.
    return this.#problem && Date.now() - this.#problem.at < 10 * 60_000 ? this.#problem.said : null;
  }
}
