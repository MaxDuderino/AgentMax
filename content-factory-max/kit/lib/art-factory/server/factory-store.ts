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

/** A version that was live before a re-approve, kept so it can be put back (30 days, then tidied away). */
export interface PreviousVersion {
  /** When that version was approved. */
  at: string;
  /** When it stopped being live and was kept here. */
  keptAt: string;
  /** Relative path → where the kept copy is (`/api/art/file/art-factory/previous/…`). */
  files: Record<string, string>;
}

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
  /** The item waiting for review (a picture as WebP, at most 1536px; a sound as it came). */
  reviewUrl?: string;
  /** The review copy's content type, so a sound is approved as what it is. */
  reviewType?: string;
  provider?: string;
  model?: string;
  /** Plain-English reason for a failure or refusal. */
  error?: string;
  /** Approved files: relative path → served URL. */
  files?: Record<string, string>;
  /** When the live version was approved. */
  approvedAt?: string;
  /** Earlier live versions, newest first, for Put back. */
  previous?: PreviousVersion[];
  /**
   * An approve in progress: the live version has been kept (if there was one)
   * and the new files are being written. A retry carries on from here, so the
   * new picture is never kept as the "previous" one.
   */
  approving?: { at: string; previous?: PreviousVersion };
  /** A Put back in progress, kept the same way. */
  puttingBack?: { current: PreviousVersion | null };
  /** The project's on-approve hook failed for the live version: the reason, for the Retry button. */
  hookError?: { at: string; message: string };
  /** What making this item has cost so far, every try and redo, in dollars. */
  spentUsd?: number;
  /** How many times it was sent back to be made again after one came back. */
  redos?: number;
  /** How many versions have come back from a maker. */
  draws?: number;
  /** The last failure was a refusal (a safety filter), so the refusal helper is offered. */
  refused?: boolean;
  /** Make the next try on this picture provider only (the refusal helper's "try the other one"). */
  useProvider?: string;
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
  /**
   * The most one run (one press of Start making) may spend, in dollars, before
   * the factory stops and asks. `null` is no limit. On by default (Max,
   * 2026-10-16).
   */
  runLimitUsd: number | null;
}

export const defaultRunLimitUsd = 5;

export const defaultFactorySettings: FactorySettings = { perMinute: 8, concurrency: 1, runLimitUsd: defaultRunLimitUsd };

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
  async saveSettings(settings: Partial<FactorySettings>): Promise<FactorySettings> {
    const next = { ...(await this.settings()), ...settings };
    await this.#kv.set(`${this.#p}:settings`, JSON.stringify(next));
    return next;
  }
  /** What one run has spent and how many tries it made. */
  async run(runId: string): Promise<{ spentUsd: number; tries: number }> {
    const hash = await this.#kv.hgetall(`${this.#p}:run:${runId}`);
    return { spentUsd: Number(hash.spent ?? 0) / 1_000_000, tries: Number(hash.tries ?? 0) };
  }
  async addToRun(runId: string, usd: number): Promise<void> {
    const key = `${this.#p}:run:${runId}`;
    await this.#kv.hincrMany(
      [
        { key, field: "spent", by: Math.round(usd * 1_000_000) },
        { key, field: "tries", by: 1 },
      ],
      [{ key, seconds: 60 * 60 * 48 }],
    );
  }
  /** Alt text and caption edits made in review, by item id. They win over the catalogue's own. */
  async texts(): Promise<Record<string, string>> {
    return this.#kv.hgetall(`${this.#p}:texts`);
  }
  async setText(imageId: string, text: string | null): Promise<void> {
    if (text === null) await this.#kv.hdel(`${this.#p}:texts`, imageId);
    else await this.#kv.hset(`${this.#p}:texts`, { [imageId]: text });
  }
}
