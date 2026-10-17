import { parseJson, type Kv } from "./kv";

/**
 * The art factory's memory (ported from DnD-Max, Issue 421): the queue, the
 * review tray, what was approved and where it lives, the style blocks, and
 * the pace.
 *
 * On the project's {@link Kv} (Redis in production), so it survives a closed
 * tab, a redeploy and a crashed function: the queue picks up where it was.
 * The catalogue itself is never written to; what is done is recorded here, so
 * the site serves approved art without a commit.
 */
export type EntryStatus = "queued" | "making" | "review" | "approved" | "rejected" | "failed";

export interface FactoryEntry {
  imageId: string;
  status: EntryStatus;
  /** Order in the queue: lower goes first. */
  seq: number;
  /** Edited words from Redo; absent uses the catalogue's own. */
  prompt?: string;
  attempts: number;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  /** The picture waiting for review (WebP, at most 1536px). */
  reviewUrl?: string;
  provider?: string;
  model?: string;
  /** Plain-English reason for a failure or refusal. */
  error?: string;
  /** Approved files: relative path → served URL. */
  files?: Record<string, string>;
  /** What drawing this picture has cost so far, every try and redo, in dollars. */
  spentUsd?: number;
}

export interface ApprovedFile {
  url: string;
  imageId: string;
  at: string;
}

export interface FactorySettings {
  /** Pictures started per minute, across every open factory tab. */
  perMinute: number;
  /** How many the page asks for at once. */
  concurrency: number;
}

export const defaultFactorySettings: FactorySettings = { perMinute: 8, concurrency: 1 };

export class FactoryStore {
  readonly #kv: Kv;
  readonly #p: string;

  constructor(kv: Kv, prefix: string) {
    this.#kv = kv;
    this.#p = `${prefix}:art-factory`;
  }

  async entries(): Promise<FactoryEntry[]> {
    return Object.values(await this.#kv.hgetall(`${this.#p}:entries`))
      .map((raw) => parseJson<FactoryEntry>(raw))
      .filter((one): one is FactoryEntry => one !== null);
  }
  async entry(imageId: string): Promise<FactoryEntry | null> {
    return parseJson<FactoryEntry>(await this.#kv.hget(`${this.#p}:entries`, imageId));
  }
  async save(entry: FactoryEntry): Promise<void> {
    await this.#kv.hset(`${this.#p}:entries`, { [entry.imageId]: JSON.stringify(entry) });
  }
  async remove(imageId: string): Promise<void> {
    await this.#kv.hdel(`${this.#p}:entries`, imageId);
  }
  async nextSeq(): Promise<number> {
    return this.#kv.incr(`${this.#p}:seq`);
  }
  /** A lease on one entry, so two tabs never draw the same picture. */
  async lock(imageId: string, ms: number): Promise<boolean> {
    return this.#kv.set(`${this.#p}:lock:${imageId}`, "1", { nx: true, px: ms });
  }
  async unlock(imageId: string): Promise<void> {
    await this.#kv.del(`${this.#p}:lock:${imageId}`);
  }
  /** Counts a start in this minute and returns how many there have been. */
  async countStart(minute: string): Promise<number> {
    const key = `${this.#p}:starts:${minute}`;
    const count = await this.#kv.incr(key);
    if (count === 1) await this.#kv.expire(key, 180);
    return count;
  }
  async approved(): Promise<Record<string, ApprovedFile>> {
    const out: Record<string, ApprovedFile> = {};
    for (const [path, raw] of Object.entries(await this.#kv.hgetall(`${this.#p}:approved`))) {
      const file = parseJson<ApprovedFile>(raw);
      if (file) out[path] = file;
    }
    return out;
  }
  async approvedFile(path: string): Promise<ApprovedFile | null> {
    return parseJson<ApprovedFile>(await this.#kv.hget(`${this.#p}:approved`, path));
  }
  async setApproved(path: string, file: ApprovedFile): Promise<void> {
    await this.#kv.hset(`${this.#p}:approved`, { [path]: JSON.stringify(file) });
  }
  async styles(): Promise<Record<string, string>> {
    return this.#kv.hgetall(`${this.#p}:styles`);
  }
  async setStyle(group: string, text: string | null): Promise<void> {
    if (text === null) await this.#kv.hdel(`${this.#p}:styles`, group);
    else await this.#kv.hset(`${this.#p}:styles`, { [group]: text });
  }
  async settings(): Promise<FactorySettings> {
    return { ...defaultFactorySettings, ...(parseJson<FactorySettings>(await this.#kv.get(`${this.#p}:settings`)) ?? {}) };
  }
  async saveSettings(settings: FactorySettings): Promise<void> {
    await this.#kv.set(`${this.#p}:settings`, JSON.stringify(settings));
  }
}
