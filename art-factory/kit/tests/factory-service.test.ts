import { describe, expect, it } from "vitest";

import example from "../art/art-catalogue.json";
import { groupsFromFile, type CatalogueFile } from "../lib/art-factory/core/json-catalogue";
import { indexCatalogue, type ApprovedPicture } from "../lib/art-factory/core/types";
import { MemoryArtStore, R2ArtStore } from "../lib/art-factory/server/art-store";
import { approve, approvedUrl, clearQueue, enqueue, isBusy, isOutOfCredit, makingLeaseMs, redo, reject, unqueue, work, type FactoryDeps } from "../lib/art-factory/server/factory-service";
import { FactoryStore } from "../lib/art-factory/server/factory-store";
import type { ImageProvider } from "../lib/art-factory/server/image-provider";
import { MemoryKv } from "../lib/art-factory/server/kv";
import { FakeImageProvider, FakeR2, fakeConverter, textOf } from "./support";

/**
 * The factory's queue and review tray, with a fake picture maker and a fake
 * converter: no test calls a real image API.
 */
function setup(options: { provider?: ImageProvider | null; perMinute?: number; art?: MemoryArtStore | R2ArtStore } = {}) {
  const clock = { now: Date.parse("2026-10-16T12:00:10.000Z") };
  const kv = new MemoryKv(() => clock.now);
  const store = new FactoryStore(kv, "test");
  const art = options.art ?? new MemoryArtStore();
  const provider = options.provider === undefined ? new FakeImageProvider() : options.provider;
  const { convert, cuts } = fakeConverter();
  const approvedPictures: ApprovedPicture[] = [];
  const indexed = indexCatalogue(groupsFromFile(example as unknown as CatalogueFile));
  const deps: FactoryDeps = {
    store,
    art,
    catalogue: async () => indexed,
    provider: async () => provider,
    convert,
    now: () => new Date(clock.now),
    onApprove: (picture) => {
      approvedPictures.push(picture);
    },
  };
  if (options.perMinute) void store.saveSettings({ perMinute: options.perMinute, concurrency: 1 });
  return { deps, store, art, provider: provider as FakeImageProvider, cuts, clock, approvedPictures };
}

const heart = "icons/ui/heart";
const star = "icons/ui/star";

describe("the art factory queue", () => {
  it("queues pictures once, draws them in order, one per call, into the review tray", async () => {
    const { deps, store, provider } = setup();
    expect(await enqueue(deps, [heart, star, heart, "nope"])).toEqual({ added: 2, skipped: 1, unknown: 1 });

    const first = await work(deps);
    expect(first.kind).toBe("made");
    expect(first.kind === "made" && first.imageId).toBe(heart);
    expect((await store.entry(heart))!.status).toBe("review");
    expect((await store.entry(star))!.status).toBe("queued");

    // The group's style went in front, and an icon was asked for on a see-through ground.
    expect(provider.requests[0]!.prompt).toMatch(/^House style for Space Snacks icons/);
    expect(provider.requests[0]!.prompt).toContain("A glossy red heart");
    expect(provider.requests[0]!.background).toBe("transparent");

    expect((await work(deps)).kind).toBe("made");
    expect((await work(deps)).kind).toBe("idle");
  });

  it("prices each picture from the tokens it reported, and keeps the cost through redos", async () => {
    const { deps, store } = setup();
    await enqueue(deps, [heart]);
    await work(deps);
    const once = (await store.entry(heart))!.spentUsd!;
    // gpt-image-1.5: $5/M in, $32/M out → 300 in + 1,056 out ≈ $0.0353.
    expect(once).toBeCloseTo(0.0353, 4);
    await redo(deps, heart);
    await work(deps);
    expect((await store.entry(heart))!.spentUsd!).toBeCloseTo(once * 2, 6);
  });

  it("approving cuts every size, writes each to art/<path>, records it, deletes the review copy and calls onApprove", async () => {
    const { deps, store, art, cuts, approvedPictures } = setup();
    await enqueue(deps, [heart]);
    const made = await work(deps);
    const reviewUrl = made.kind === "made" ? made.entry.reviewUrl! : "";
    expect(reviewUrl).toMatch(/^\/api\/art\/file\/art-factory\/review\//);

    const result = await approve(deps, heart);
    expect(result.ok).toBe(true);
    expect(cuts).toEqual(["preview", { width: 256, height: 256, fit: "contain" }, { width: 64, height: 64, fit: "contain" }]);
    expect(textOf(await art.read("/api/art/file/art/art/icons/heart-small.webp"))).toBe("webp 64x64");
    expect(await approvedUrl(store, "/art/icons/heart.webp")).toBe("/api/art/file/art/art/icons/heart.webp");
    expect(await art.read(reviewUrl)).toBeNull();
    expect((await store.entry(heart))!.status).toBe("approved");
    expect(approvedPictures).toHaveLength(1);
    expect(Object.keys(approvedPictures[0]!.files)).toEqual(["art/icons/heart.webp", "art/icons/heart-small.webp"]);
  });

  it("an onApprove that throws never undoes the approval", async () => {
    const { deps, store } = setup();
    deps.onApprove = () => {
      throw new Error("the game was busy");
    };
    await enqueue(deps, [heart]);
    await work(deps);
    expect((await approve(deps, heart)).ok).toBe(true);
    expect((await store.entry(heart))!.status).toBe("approved");
  });

  it("redo with new words keeps them; null goes back to the catalogue's words; reject clears the tray", async () => {
    const { deps, store, provider } = setup();
    await enqueue(deps, [heart]);
    await work(deps);
    await redo(deps, heart, "A heart made of jelly.");
    expect((await store.entry(heart))!.prompt).toBe("A heart made of jelly.");
    await work(deps);
    expect(provider.requests[1]!.prompt).toContain("A heart made of jelly.");
    await redo(deps, heart, null);
    expect((await store.entry(heart))!.prompt).toBeUndefined();
    await work(deps);
    expect((await reject(deps, heart)).ok).toBe(true);
    expect((await store.entry(heart))!.status).toBe("rejected");
    expect((await approve(deps, heart)).ok).toBe(false);
  });

  it("unqueue and empty-the-queue take waiting pictures out, and nothing else", async () => {
    const { deps, store } = setup();
    await enqueue(deps, [heart, star, "icons/ui/pause"]);
    await work(deps);
    expect(await unqueue(deps, heart)).toBe(false);
    expect(await unqueue(deps, star)).toBe(true);
    expect(await clearQueue(deps)).toBe(1);
    expect((await store.entry(heart))!.status).toBe("review");
  });

  it("a refusal fails the picture with a reason; a failure retries up to three tries", async () => {
    const { deps, store, provider } = setup();
    provider.next = [{ ok: false, code: "art-refused", detail: "safety system" }];
    await enqueue(deps, [heart]);
    const refused = await work(deps);
    expect(refused.kind).toBe("failed");
    expect((await store.entry(heart))!.error).toMatch(/would not draw this \(safety system\)/);

    await enqueue(deps, [star]);
    provider.next = [1, 2, 3].map(() => ({ ok: false as const, code: "art-failed" as const, detail: "boom" }));
    expect((await work(deps)).kind).toBe("failed");
    expect((await store.entry(star))!.status).toBe("queued");
    await work(deps);
    expect((await work(deps)).kind).toBe("failed");
    expect((await store.entry(star))!.status).toBe("failed");
    expect((await store.entry(star))!.attempts).toBe(3);
  });

  it("busy is the provider's pace: back in the queue without using a try, and a wait with its own words", async () => {
    const { deps, store, provider } = setup();
    provider.next = [{ ok: false, code: "art-failed", detail: "Rate limit reached for images", status: 429 }];
    await enqueue(deps, [heart]);
    const answer = await work(deps);
    expect(answer).toEqual({ kind: "wait", ms: 20_000, reason: "Rate limit reached for images" });
    expect((await store.entry(heart))!).toMatchObject({ status: "queued", attempts: 0 });
  });

  it("out of credit stops the run and leaves the picture untouched in the queue", async () => {
    const { deps, store, provider } = setup();
    provider.next = [{ ok: false, code: "art-failed", detail: "You exceeded your current quota, please check your plan and billing details.", status: 429 }];
    await enqueue(deps, [heart]);
    const answer = await work(deps);
    expect(answer.kind).toBe("off");
    expect(answer.kind === "off" && answer.message).toMatch(/no credit to draw with/);
    expect((await store.entry(heart))!).toMatchObject({ status: "queued", attempts: 0 });
    expect(isOutOfCredit("insufficient_quota")).toBe(true);
    expect(isBusy(429, "insufficient_quota")).toBe(false);
    expect(isBusy(503, "overloaded")).toBe(true);
  });

  it("keeps to the pace: past perMinute starts, it says wait until the next minute", async () => {
    const { deps } = setup({ perMinute: 1 });
    await enqueue(deps, [heart, star]);
    expect((await work(deps)).kind).toBe("made");
    const waited = await work(deps);
    expect(waited.kind).toBe("wait");
    expect(waited.kind === "wait" && waited.ms).toBe(60_000 - 10_000 + 250);
  });

  it("a picture whose function died mid-draw goes back in the queue once its lease runs out", async () => {
    const { deps, store, clock } = setup();
    await enqueue(deps, [heart]);
    const entry = (await store.entry(heart))!;
    await store.save({ ...entry, status: "making", startedAt: new Date(clock.now).toISOString(), attempts: 1 });
    expect((await work(deps)).kind).toBe("idle");
    clock.now += makingLeaseMs + 1000;
    expect((await work(deps)).kind).toBe("made");
  });

  it("with no picture maker it says how to switch one on", async () => {
    const { deps } = setup({ provider: null });
    await enqueue(deps, [heart]);
    const answer = await work(deps);
    expect(answer.kind === "off" && answer.message).toMatch(/OPENAI_API_KEY_ImageGen/);
  });

  it("on R2: a refused save stops the factory (it would keep paying) and puts the picture back", async () => {
    const r2 = new FakeR2();
    const { deps, store } = setup({ art: new R2ArtStore(r2.client()) });
    await enqueue(deps, [heart]);
    r2.failWith = 403;
    const answer = await work(deps);
    expect(answer.kind).toBe("off");
    expect(answer.kind === "off" && answer.message).toMatch(/would not save it/);
    expect((await store.entry(heart))!).toMatchObject({ status: "queued", attempts: 0 });
    // The store now remembers it is refusing, so the next call stops before paying for a picture.
    const again = await work(deps);
    expect(again.kind === "off" && again.message).toMatch(/art store is refusing/);
  });

  it("on R2: the whole loop works, review copy and every approved size in the bucket", async () => {
    const r2 = new FakeR2();
    const { deps } = setup({ art: new R2ArtStore(r2.client()) });
    await enqueue(deps, [heart]);
    expect((await work(deps)).kind).toBe("made");
    expect((await approve(deps, heart)).ok).toBe(true);
    expect([...r2.files.keys()].sort()).toEqual(["art/art/icons/heart-small.webp", "art/art/icons/heart.webp"]);
  });
});
