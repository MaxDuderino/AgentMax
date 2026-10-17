/**
 * The factory's memory: a tiny key-value interface with two homes.
 *
 * - **Upstash Redis** in production (`UPSTASH_REDIS_REST_URL` and
 *   `UPSTASH_REDIS_REST_TOKEN`, or Vercel's older `KV_REST_API_URL` /
 *   `KV_REST_API_TOKEN`), so the queue survives a closed tab, a redeploy and
 *   a crashed function.
 * - **Memory** on a laptop and in tests, so the whole loop still works.
 *
 * Every key is prefixed with the project's name (`mygame:art-factory:…`),
 * so two projects can share one Redis database without stepping on each
 * other. Values are plain strings; callers do their own JSON.
 */
export type Env = Readonly<Record<string, string | undefined>>;

export interface Kv {
  readonly kind: "redis" | "memory";
  get(key: string): Promise<string | null>;
  /** `nx`: only if absent. `px`: expires after that many ms. True when written. */
  set(key: string, value: string, options?: { nx?: boolean; px?: number }): Promise<boolean>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
  hget(key: string, field: string): Promise<string | null>;
  hgetall(key: string): Promise<Record<string, string>>;
  hset(key: string, fields: Readonly<Record<string, string>>): Promise<void>;
  hdel(key: string, field: string): Promise<void>;
  /** Many counters in one round trip. */
  hincrMany(ops: readonly { key: string; field: string; by: number }[], expire?: readonly { key: string; seconds: number }[]): Promise<void>;
  hgetallMany(keys: readonly string[]): Promise<Record<string, string>[]>;
  /** How many keys the whole database holds, when it can say. */
  size?(): Promise<number>;
}

export class MemoryKv implements Kv {
  readonly kind = "memory" as const;
  readonly #values = new Map<string, { value: string; until: number | null }>();
  readonly #hashes = new Map<string, Map<string, string>>();
  readonly #clock: () => number;

  constructor(clock: () => number = () => Date.now()) {
    this.#clock = clock;
  }

  #live(key: string) {
    const found = this.#values.get(key);
    if (found && found.until !== null && found.until <= this.#clock()) {
      this.#values.delete(key);
      return undefined;
    }
    return found;
  }

  async get(key: string) {
    return this.#live(key)?.value ?? null;
  }
  async set(key: string, value: string, options: { nx?: boolean; px?: number } = {}) {
    if (options.nx && this.#live(key)) return false;
    this.#values.set(key, { value, until: options.px ? this.#clock() + options.px : null });
    return true;
  }
  async del(key: string) {
    this.#values.delete(key);
    this.#hashes.delete(key);
  }
  async incr(key: string) {
    const next = Number(this.#live(key)?.value ?? 0) + 1;
    this.#values.set(key, { value: String(next), until: this.#values.get(key)?.until ?? null });
    return next;
  }
  async decr(key: string) {
    const next = Number(this.#live(key)?.value ?? 0) - 1;
    this.#values.set(key, { value: String(next), until: this.#values.get(key)?.until ?? null });
    return next;
  }
  async expire(key: string, seconds: number) {
    const found = this.#live(key);
    if (found) found.until = this.#clock() + seconds * 1000;
  }
  async hget(key: string, field: string) {
    return this.#hashes.get(key)?.get(field) ?? null;
  }
  async hgetall(key: string) {
    return Object.fromEntries(this.#hashes.get(key) ?? []);
  }
  async hset(key: string, fields: Readonly<Record<string, string>>) {
    const hash = this.#hashes.get(key) ?? new Map<string, string>();
    for (const [field, value] of Object.entries(fields)) hash.set(field, value);
    this.#hashes.set(key, hash);
  }
  async hdel(key: string, field: string) {
    this.#hashes.get(key)?.delete(field);
  }
  async hincrMany(ops: readonly { key: string; field: string; by: number }[]) {
    for (const op of ops) {
      const hash = this.#hashes.get(op.key) ?? new Map<string, string>();
      hash.set(op.field, String(Number(hash.get(op.field) ?? 0) + op.by));
      this.#hashes.set(op.key, hash);
    }
  }
  async hgetallMany(keys: readonly string[]) {
    return keys.map((key) => Object.fromEntries(this.#hashes.get(key) ?? []));
  }
  async size() {
    return this.#values.size + this.#hashes.size;
  }
}

export function redisCredentials(env: Env): { url: string; token: string } | null {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

/** Minimal shape of the Upstash client this file uses, so tests can hand in a fake. */
interface UpstashLike {
  get(key: string): Promise<unknown>;
  set(key: string, value: string, options?: Record<string, unknown>): Promise<unknown>;
  del(key: string): Promise<unknown>;
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  hget(key: string, field: string): Promise<unknown>;
  hgetall(key: string): Promise<Record<string, unknown> | null>;
  hset(key: string, fields: Record<string, string>): Promise<unknown>;
  hdel(key: string, field: string): Promise<unknown>;
  dbsize(): Promise<number>;
  pipeline(): { hincrby(key: string, field: string, by: number): unknown; expire(key: string, seconds: number): unknown; hgetall(key: string): unknown; exec(): Promise<unknown[]> };
}

const asString = (value: unknown) => (value === null || value === undefined ? null : typeof value === "string" ? value : JSON.stringify(value));

export class RedisKv implements Kv {
  readonly kind = "redis" as const;
  readonly #client: Promise<UpstashLike>;

  /** Hand in a client (tests), or use {@link RedisKv.connect}. */
  constructor(client: UpstashLike | Promise<UpstashLike>) {
    this.#client = Promise.resolve(client);
  }

  /** Values are kept as the strings written: automatic JSON parsing off. */
  static connect(credentials: { url: string; token: string }): RedisKv {
    return new RedisKv(import("@upstash/redis").then(({ Redis }) => new Redis({ ...credentials, automaticDeserialization: false }) as unknown as UpstashLike));
  }

  async get(key: string) {
    return asString(await (await this.#client).get(key));
  }
  async set(key: string, value: string, options: { nx?: boolean; px?: number } = {}) {
    const answer = await (await this.#client).set(key, value, { ...(options.nx ? { nx: true } : {}), ...(options.px ? { px: options.px } : {}) });
    return answer === "OK";
  }
  async del(key: string) {
    await (await this.#client).del(key);
  }
  async incr(key: string) {
    return (await this.#client).incr(key);
  }
  async decr(key: string) {
    return (await this.#client).decr(key);
  }
  async expire(key: string, seconds: number) {
    await (await this.#client).expire(key, seconds);
  }
  async hget(key: string, field: string) {
    return asString(await (await this.#client).hget(key, field));
  }
  async hgetall(key: string) {
    const hash = (await (await this.#client).hgetall(key)) ?? {};
    return Object.fromEntries(Object.entries(hash).map(([field, value]) => [field, asString(value) ?? ""]));
  }
  async hset(key: string, fields: Readonly<Record<string, string>>) {
    if (Object.keys(fields).length) await (await this.#client).hset(key, { ...fields });
  }
  async hdel(key: string, field: string) {
    await (await this.#client).hdel(key, field);
  }
  async hincrMany(ops: readonly { key: string; field: string; by: number }[], expire: readonly { key: string; seconds: number }[] = []) {
    if (ops.length === 0) return;
    const pipeline = (await this.#client).pipeline();
    for (const op of ops) pipeline.hincrby(op.key, op.field, op.by);
    for (const one of expire) pipeline.expire(one.key, one.seconds);
    await pipeline.exec();
  }
  async hgetallMany(keys: readonly string[]) {
    if (keys.length === 0) return [];
    const pipeline = (await this.#client).pipeline();
    for (const key of keys) pipeline.hgetall(key);
    const results = (await pipeline.exec()) as (Record<string, unknown> | null)[];
    return results.map((hash) => Object.fromEntries(Object.entries(hash ?? {}).map(([field, value]) => [field, asString(value) ?? ""])));
  }
  async size() {
    return (await this.#client).dbsize();
  }
}

/** Redis when its two variables are set, else memory. */
export function kvFromEnv(env: Env): Kv {
  const credentials = redisCredentials(env);
  return credentials ? RedisKv.connect(credentials) : new MemoryKv();
}

export function parseJson<T>(value: string | null): T | null {
  if (value === null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
