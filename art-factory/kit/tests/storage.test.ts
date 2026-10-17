import { describe, expect, it } from "vitest";

import { MemoryArtStore, R2ArtStore } from "../lib/art-factory/server/art-store";
import { MemoryKv, RedisKv, kvFromEnv, redisCredentials } from "../lib/art-factory/server/kv";
import { R2Error, r2Config } from "../lib/art-factory/server/r2-client";
import { FakeR2, bytesOf, textOf } from "./support";

describe("R2 (the lesson that cost a day)", () => {
  it("sends uploads with their length, so R2 does not answer 411", async () => {
    const r2 = new FakeR2();
    await r2.client().put("art/a.webp", bytesOf("hello"), "image/webp");
    expect(textOf(await r2.client().getBytes("art/a.webp"))).toBe("hello");
    await r2.client().put("art/b.webp", new Uint8Array([1, 2, 3]), "image/webp");
    expect(r2.files.get("art/b.webp")!.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("is switched on only when all four variables are set", () => {
    expect(r2Config({ R2_ACCOUNT_ID: "a", R2_BUCKET: "b", R2_ACCESS_KEY_ID: "c" })).toBeNull();
    expect(r2Config({ R2_ACCOUNT_ID: "a", R2_BUCKET: "b", R2_ACCESS_KEY_ID: "c", R2_SECRET_ACCESS_KEY: "d" })).toMatchObject({ bucket: "b" });
  });

  it("lists, removes, and reports refusals as R2Error", async () => {
    const r2 = new FakeR2();
    const client = r2.client();
    await client.put("made/x.webp", bytesOf("1"), "image/webp");
    await client.put("made/y.webp", bytesOf("22"), "image/webp");
    expect((await client.list("made/")).map((one) => [one.key, one.size])).toEqual([
      ["made/x.webp", 1],
      ["made/y.webp", 2],
    ]);
    expect(await client.remove("made/x.webp")).toBe(true);
    expect(await client.remove("made/x.webp")).toBe(false);
    r2.failWith = 403;
    await expect(client.put("made/z.webp", bytesOf("3"), "image/webp")).rejects.toBeInstanceOf(R2Error);
  });

  it("the R2 art store remembers a refusing bucket for ten minutes, and clears it on a good read", async () => {
    const r2 = new FakeR2();
    const store = new R2ArtStore(r2.client());
    const { url } = await store.put("art/a.webp", bytesOf("a"), "image/webp");
    expect(url).toBe("/api/art/file/art/a.webp");
    r2.failWith = 401;
    expect(await store.read(url)).toBeNull();
    expect(store.problem()).toMatch(/401/);
    r2.failWith = null;
    expect(textOf(await store.read(url))).toBe("a");
    expect(store.problem()).toBeNull();
    expect(await store.measure!("art/")).toEqual({ files: 1, bytes: 1 });
  });

  it("the memory art store serves what it was given at the same addresses", async () => {
    const store = new MemoryArtStore();
    const { url } = await store.put("made/admin/x.webp", bytesOf("x"), "image/webp");
    expect(textOf(await store.read(url))).toBe("x");
    expect((await store.open("made/admin/x.webp"))!.contentType).toBe("image/webp");
    await store.remove(url);
    expect(await store.open("made/admin/x.webp")).toBeNull();
  });
});

describe("the key-value memory", () => {
  it("memory: set nx, expiry, counters and hashes", async () => {
    const clock = { now: 0 };
    const kv = new MemoryKv(() => clock.now);
    expect(await kv.set("lock", "1", { nx: true, px: 1000 })).toBe(true);
    expect(await kv.set("lock", "1", { nx: true, px: 1000 })).toBe(false);
    clock.now = 1001;
    expect(await kv.set("lock", "1", { nx: true, px: 1000 })).toBe(true);
    expect(await kv.incr("n")).toBe(1);
    expect(await kv.incr("n")).toBe(2);
    await kv.hincrMany([
      { key: "h", field: "a", by: 2 },
      { key: "h", field: "a", by: 3 },
    ]);
    expect(await kv.hgetallMany(["h", "none"])).toEqual([{ a: "5" }, {}]);
  });

  it("finds Upstash's variables, or Vercel's older KV names", () => {
    expect(redisCredentials({ UPSTASH_REDIS_REST_URL: "u", UPSTASH_REDIS_REST_TOKEN: "t" })).toEqual({ url: "u", token: "t" });
    expect(redisCredentials({ KV_REST_API_URL: "u", KV_REST_API_TOKEN: "t" })).toEqual({ url: "u", token: "t" });
    expect(kvFromEnv({}).kind).toBe("memory");
    expect(kvFromEnv({ KV_REST_API_URL: "https://example.upstash.io", KV_REST_API_TOKEN: "t" }).kind).toBe("redis");
  });

  it("Redis: speaks to the client as plain strings, and pipelines counters", async () => {
    const calls: string[] = [];
    const data = new Map<string, unknown>([["obj", { a: 1 }]]);
    const fake = {
      get: async (key: string) => data.get(key) ?? null,
      set: async (key: string, value: string, options?: Record<string, unknown>) => {
        calls.push(`set ${key} ${JSON.stringify(options)}`);
        data.set(key, value);
        return "OK";
      },
      del: async () => 1,
      incr: async () => 7,
      expire: async () => 1,
      hget: async () => null,
      hgetall: async () => ({ n: 3, s: "x" }),
      hset: async () => 1,
      hdel: async () => 1,
      dbsize: async () => 42,
      pipeline: () => {
        const queued: string[] = [];
        return {
          hincrby: (key: string, field: string, by: number) => queued.push(`hincrby ${key} ${field} ${by}`),
          expire: (key: string, seconds: number) => queued.push(`expire ${key} ${seconds}`),
          hgetall: (key: string) => queued.push(`hgetall ${key}`),
          exec: async () => {
            calls.push(...queued);
            return queued.map(() => ({ f: 1 }));
          },
        };
      },
    };
    const kv = new RedisKv(fake);
    expect(await kv.get("obj")).toBe('{"a":1}');
    expect(await kv.set("lock", "1", { nx: true, px: 50 })).toBe(true);
    expect(await kv.hgetall("h")).toEqual({ n: "3", s: "x" });
    await kv.hincrMany([{ key: "d", field: "f", by: 2 }], [{ key: "d", seconds: 9 }]);
    expect(await kv.hgetallMany(["a", "b"])).toEqual([{ f: "1" }, { f: "1" }]);
    expect(await kv.size()).toBe(42);
    expect(calls).toEqual(['set lock {"nx":true,"px":50}', "hincrby d f 2", "expire d 9", "hgetall a", "hgetall b"]);
  });
});
