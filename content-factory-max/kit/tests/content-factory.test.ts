import { describe, expect, it } from "vitest";

import example from "../art/art-catalogue.json";
import { checkCatalogue, groupsFromFile, jsonCatalogue, type CatalogueFile } from "../lib/art-factory/core/json-catalogue";
import { indexCatalogue, kindOf, type ApprovedPicture, type ContentKind } from "../lib/art-factory/core/types";
import { MemoryArtStore, type ArtStore } from "../lib/art-factory/server/art-store";
import { approve, cleanPrevious, enqueue, keepPreviousDays, putBack, redo, retryHook, runIsSpent, setText, work, type FactoryDeps } from "../lib/art-factory/server/factory-service";
import { defaultFactorySettings, FactoryStore } from "../lib/art-factory/server/factory-store";
import { createHandlers } from "../lib/art-factory/server/handlers";
import { MemoryKv } from "../lib/art-factory/server/kv";
import { imageMaker, meteredMaker, practiceMaker, practiceWav, type Maker, type MakeRequest, type MakeResult } from "../lib/art-factory/server/maker";
import { createArtFactory } from "../lib/art-factory/server/setup";
import { costMicros, isUsageProvider, priceFor } from "../lib/art-factory/server/usage/price-table";
import { UsageLedger } from "../lib/art-factory/server/usage/usage-ledger";
import { artSrc, seedArtText } from "../lib/art-factory/ui/api";
import { bytesOf, FakeImageProvider, fakeConverter, textOf } from "./support";

/**
 * Content Factory MAX, phase 1 (2026-10-17): one engine for every kind,
 * usage in units, and the safety nets Max picked to be on by default.
 * Fakes only: no real picture, voice or music API is called.
 */

/** Makes "sounds" (tagged bytes) for the kinds it is given, and can be told to answer a set result next. */
class FakeSoundMaker implements Maker {
  readonly name: string;
  readonly model = "fake-sound-1";
  readonly kinds: readonly ContentKind[];
  readonly requests: MakeRequest[] = [];
  next: MakeResult[] = [];
  constructor(kinds: readonly ContentKind[] = ["voice", "sfx", "music"], name = "fakesound") {
    this.kinds = kinds;
    this.name = name;
  }
  async make(input: MakeRequest): Promise<MakeResult> {
    this.requests.push(input);
    const queued = this.next.shift();
    if (queued) return queued;
    return { ok: true, bytes: bytesOf(`sound:${input.prompt}`), contentType: "audio/mpeg", usage: { model: this.model, unit: "characters", quantity: input.prompt.length } };
  }
}

const catalogueFile = example as unknown as CatalogueFile;
const heart = "icons/ui/heart";
const star = "icons/ui/star";
const chime = "sounds/effects/star-pickup";
const line = "sounds/voices/level-start";
const theme = "sounds/music/orbit-theme";

function setup(options: { sounds?: Maker | null; art?: ArtStore; provider?: FakeImageProvider | null } = {}) {
  const clock = { now: Date.parse("2026-10-17T12:00:10.000Z") };
  const kv = new MemoryKv(() => clock.now);
  const store = new FactoryStore(kv, "test");
  const art = options.art ?? new MemoryArtStore();
  const provider = options.provider === undefined ? new FakeImageProvider() : options.provider;
  const sounds = options.sounds === undefined ? new FakeSoundMaker() : options.sounds;
  const { convert, cuts } = fakeConverter();
  const approved: ApprovedPicture[] = [];
  const indexed = indexCatalogue(groupsFromFile(catalogueFile));
  const deps: FactoryDeps = {
    store,
    art,
    catalogue: async () => indexed,
    provider: async () => provider,
    makers: async (kind) => (sounds && sounds.kinds.includes(kind) ? sounds : null),
    convert,
    now: () => new Date(clock.now),
    onApprove: (picture) => void approved.push(picture),
  };
  return { deps, store, art: art as MemoryArtStore, provider: provider!, sounds: sounds as FakeSoundMaker, cuts, clock, approved, kv };
}

/** A different picture each draw, so a test can tell versions apart. */
function numberedPictures(provider: FakeImageProvider) {
  let n = 0;
  const original = provider.generate.bind(provider);
  provider.generate = async (input) => {
    const result = await original(input);
    n += 1;
    return result.ok ? { ...result, bytes: bytesOf(`png v${n}`) } : result;
  };
}

/** A converter that keeps the version in its output, so the files written say which draw they came from. */
function versionedConverter(deps: FactoryDeps) {
  // The tray copy is the draw as it came; each size adds its width.
  deps.convert = async (input, target) => ({ bytes: target ? bytesOf(`${textOf(input)} ${target.width}`) : input, contentType: "image/webp", width: 1, height: 1 });
}

describe("one engine for every kind", () => {
  it("the catalogue gives every item a kind; sounds land at <dir>/<file>.<format> with no sizes", () => {
    const { byId } = indexCatalogue(groupsFromFile(catalogueFile));
    expect(kindOf(byId.get(heart)!)).toBe("image");
    expect(byId.get(chime)).toMatchObject({ kind: "sfx", target: "art/sounds/star-pickup.mp3", outputs: [], seconds: 1, caption: "[A sparkly chime]" });
    expect(byId.get(line)).toMatchObject({ kind: "voice", voice: "cheerful-astronaut" });
    // A voice line's caption defaults to the line itself: a transcript for people who cannot hear it.
    expect(byId.get(line)!.caption).toBe("Lunchbox secured. Snack defence, engage!");
    expect(byId.get(theme)).toMatchObject({ kind: "music", loop: true, seconds: 30, format: "mp3" });
    // A computed item with no kind (written before kinds) is a picture.
    expect(kindOf({})).toBe("image");
  });

  it("alt text: from the catalogue, and a first draft from a batch item's own words", () => {
    const { byId } = indexCatalogue(groupsFromFile(catalogueFile));
    expect(byId.get(heart)!.alt).toBe("A glossy red gummy heart.");
    expect(byId.get("enemies/wave-one/01")!.alt).toBe("A jelly blob: a wobbly lime jelly with two googly eyes and a grumpy mouth.");
  });

  it("a broken kind or sound format is a plain-English problem, not a quiet empty factory", () => {
    const bad = { groups: [{ id: "x", title: "X", kind: "smell", jobs: [{ id: "j", title: "J", format: "flac", seconds: -1, images: [{ name: "A", prompt: "a" }] }] }] };
    const problems = checkCatalogue(bad).join(" ");
    expect(problems).toMatch(/kind "smell" is not one of image, voice, sfx, music/);
    expect(problems).toMatch(/sound format "flac"/);
    expect(problems).toMatch(/seconds must be a number/);
    expect(() => jsonCatalogue(bad as unknown as CatalogueFile)).toThrow(/problems/);
  });

  it("pictures come through the Maker door exactly as before", async () => {
    const provider = new FakeImageProvider();
    const maker = imageMaker(provider);
    expect(maker.kinds).toEqual(["image"]);
    const made = await maker.make({ kind: "image", prompt: "a cat", aspect: "3:2", background: "transparent", label: "Cat" });
    expect(made.ok).toBe(true);
    expect(provider.requests[0]).toEqual({ prompt: "a cat", aspect: "3:2", background: "transparent", label: "Cat" });
    expect((await maker.make({ kind: "voice", prompt: "hello" })).ok).toBe(false);
  });

  it("Practice makes every kind for free: a real WAV for sounds, a refusal on cue", async () => {
    const maker = practiceMaker();
    expect(maker.kinds).toEqual(["image", "voice", "sfx", "music"]);
    const sound = await maker.make({ kind: "sfx", prompt: "boing", seconds: 1 });
    expect(sound.ok && sound.contentType).toBe("audio/wav");
    const wav = new Uint8Array(practiceWav({ kind: "sfx", prompt: "boing", seconds: 1 }));
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
    expect(wav.byteLength).toBe(44 + 22_050 * 2);
    expect((await maker.make({ kind: "voice", prompt: "say practice-refuse" })).ok).toBe(false);
  });

  it("a sound goes queue → review (as it came) → approve, written to its one path", async () => {
    const { deps, store, art, sounds, cuts, approved } = setup();
    await enqueue(deps, [chime]);
    const made = await work(deps);
    expect(made.kind).toBe("made");
    const entry = (await store.entry(chime))!;
    expect(entry).toMatchObject({ status: "review", provider: "fakesound", reviewType: "audio/mpeg" });
    expect(entry.reviewUrl).toMatch(/^\/api\/art\/file\/art-factory\/review\/.+\.mp3$/);
    // An effect takes the group's style in front, like a picture; it is not cut by the picture converter.
    expect(sounds.requests[0]).toMatchObject({ kind: "sfx", seconds: 1, format: "mp3" });
    expect(sounds.requests[0]!.prompt).toMatch(/^Space Snacks sound: .+\n\nA sparkly rising chime/);
    expect(cuts).toEqual([]);

    expect((await approve(deps, chime)).ok).toBe(true);
    expect(textOf(await art.read("/api/art/file/art/art/sounds/star-pickup.mp3"))).toBe(`sound:${sounds.requests[0]!.prompt}`);
    expect(art.files.get("art/art/sounds/star-pickup.mp3")!.contentType).toBe("audio/mpeg");
    expect((await store.approvedFile("art/sounds/star-pickup.mp3"))!.imageId).toBe(chime);
    expect(approved[0]).toMatchObject({ files: { "art/sounds/star-pickup.mp3": "/api/art/file/art/art/sounds/star-pickup.mp3" }, text: "[A sparkly chime]" });
  });

  it("a voice reads only its line; the style goes alongside as direction", async () => {
    const { deps, sounds } = setup();
    await enqueue(deps, [line]);
    await work(deps);
    expect(sounds.requests[0]).toMatchObject({ kind: "voice", prompt: "Lunchbox secured. Snack defence, engage!", voice: "cheerful-astronaut" });
    expect(sounds.requests[0]!.style).toMatch(/^Space Snacks sound/);
  });

  it("a kind with no maker waits in the queue while the others carry on, and the page is told why", async () => {
    const { deps, store } = setup({ sounds: null });
    await enqueue(deps, [chime, heart]);
    const first = await work(deps);
    expect(first.kind === "made" && first.imageId).toBe(heart);
    const second = await work(deps);
    expect(second.kind).toBe("off");
    expect(second.kind === "off" && second.message).toMatch(/sound effects still waiting.+Practice/);
    expect((await store.entry(chime))!.status).toBe("queued");
  });

  it("a maker that only does voices is never asked for music", async () => {
    const voices = new FakeSoundMaker(["voice"]);
    const { deps, store } = setup({ sounds: voices });
    await enqueue(deps, [theme, line]);
    expect((await work(deps)).kind).toBe("made");
    expect(voices.requests.map((one) => one.kind)).toEqual(["voice"]);
    expect((await store.entry(theme))!.status).toBe("queued");
  });
});

describe("usage in units, with an open provider list", () => {
  it("prices a call by the character, the second or the picture", () => {
    expect(costMicros({ inputPerMillion: 0, outputPerMillion: 0, unit: "seconds", perUnit: 0.01 }, 0, 0, { unit: "seconds", quantity: 30 })).toBe(300_000);
    // A unit the price is not in adds nothing: never a guess.
    expect(costMicros({ inputPerMillion: 0, outputPerMillion: 0, unit: "seconds", perUnit: 0.01 }, 0, 0, { unit: "characters", quantity: 30 })).toBe(0);
    // ElevenLabs by the character, the new way and the old way (characters as input tokens), cost the same.
    const eleven = priceFor("elevenlabs", "eleven_multilingual_v2", "2026-10-17")!;
    expect(costMicros(eleven, 0, 0, { unit: "characters", quantity: 1000 })).toBe(costMicros(eleven, 1000, 0));
  });

  it("records units on the line, prices them, and shows any provider that was used", async () => {
    const ledger = new UsageLedger(new MemoryKv(), "test", () => new Date("2026-10-17T12:00:00Z"));
    await ledger.record({ provider: "elevenlabs", model: "eleven_flash_v2_5", billedTo: "site", ok: true, inputTokens: 0, outputTokens: 0, unit: "characters", quantity: 2000, purpose: "factory-voice" });
    await ledger.setPrice("tune-1", { inputPerMillion: 0, outputPerMillion: 0, unit: "seconds", perUnit: 0.002 });
    await ledger.record({ provider: "suno", model: "tune-1", billedTo: "site", ok: true, inputTokens: 0, outputTokens: 0, unit: "seconds", quantity: 30 });
    await ledger.record({ provider: "suno", model: "tune-2", billedTo: "site", ok: true, inputTokens: 0, outputTokens: 0, unit: "seconds", quantity: 10 });
    const snapshot = await ledger.snapshot();
    expect(snapshot.today.find((one) => one.provider === "elevenlabs")).toMatchObject({ units: { characters: 2000 }, costMicros: 300_000 });
    expect(snapshot.today.find((one) => one.model === "tune-1")).toMatchObject({ units: { seconds: 30 }, costMicros: 60_000, unpriced: 0 });
    // Billed by the second with no price yet: counted and flagged, never guessed at.
    expect(snapshot.today.find((one) => one.model === "tune-2")).toMatchObject({ units: { seconds: 10 }, costMicros: 0, unpriced: 1 });
    expect(snapshot.providers.map((one) => one.provider)).toEqual(["openai", "google", "anthropic", "elevenlabs", "suno"]);
    expect(snapshot.providers.find((one) => one.provider === "suno")!.name).toBe("Suno");
    expect(isUsageProvider("suno")).toBe(true);
    expect(isUsageProvider("Not A|Provider")).toBe(false);
  });

  it("older rows (tokens only) still read exactly as before", async () => {
    const ledger = new UsageLedger(new MemoryKv(), "test", () => new Date("2026-10-17T12:00:00Z"));
    await ledger.record({ provider: "openai", model: "gpt-image-1.5", billedTo: "site", ok: true, inputTokens: 300, outputTokens: 1056 });
    expect((await ledger.snapshot()).today[0]).toMatchObject({ inputTokens: 300, outputTokens: 1056, costMicros: 35292, units: {} });
  });

  it("a plugged-in maker is metered in its own unit and stopped at zero", async () => {
    const ledger = new UsageLedger(new MemoryKv(), "test", () => new Date("2026-10-17T12:00:00Z"));
    await ledger.setPrice("fake-sound-1", { inputPerMillion: 0, outputPerMillion: 0, unit: "characters", perUnit: 0.001 });
    const metered = meteredMaker(new FakeSoundMaker(), ledger, "factory-voice");
    expect((await metered.make({ kind: "voice", prompt: "hello there" })).ok).toBe(true);
    expect((await ledger.snapshot()).today[0]).toMatchObject({ provider: "fakesound", units: { characters: 11 }, costMicros: 11_000 });
    await ledger.setBalance("fakesound", 0.01);
    await ledger.record({ provider: "fakesound", model: "fake-sound-1", billedTo: "site", ok: true, inputTokens: 0, outputTokens: 0, unit: "characters", quantity: 20 });
    // Stop at zero is on for a new wallet, so the next call is refused before it is made.
    const stopped = await metered.make({ kind: "voice", prompt: "again" });
    expect(stopped).toMatchObject({ ok: false, status: 402 });
    expect(!stopped.ok && stopped.detail).toMatch(/Fakesound credit is used up/);
    // Practice is never metered.
    expect(meteredMaker(practiceMaker(), ledger, "x").name).toBe("practice");
  });
});

describe("the safety nets, on by default", () => {
  it("a run stops before the try that would take it past its limit, and a new run starts fresh", async () => {
    expect(defaultFactorySettings.runLimitUsd).toBe(5);
    expect(runIsSpent({ spentUsd: 0, tries: 0 }, 0.05)).toBe(false);
    expect(runIsSpent({ spentUsd: 0.035, tries: 1 }, 0.05)).toBe(true);
    expect(runIsSpent({ spentUsd: 99, tries: 1 }, null)).toBe(false);

    const { deps, store } = setup();
    await store.saveSettings({ runLimitUsd: 0.08 });
    await enqueue(deps, [heart, star, "icons/ui/pause"]);
    expect((await work(deps, { runId: "run-one" })).kind).toBe("made");
    expect((await work(deps, { runId: "run-one" })).kind).toBe("made");
    // Two pictures at about 3.5¢ each: a third would pass 8¢.
    const third = await work(deps, { runId: "run-one" });
    expect(third.kind).toBe("off");
    expect(third.kind === "off" && third.message).toMatch(/This run has spent about \$0\.07 of its \$0\.08 limit/);
    expect((await store.entry("icons/ui/pause"))!.status).toBe("queued");
    expect((await work(deps, { runId: "run-two" })).kind).toBe("made");
  });

  it("re-approving keeps the previous version; Put back swaps it in and keeps the newer one", async () => {
    const { deps, store, art, provider, approved } = setup();
    numberedPictures(provider);
    versionedConverter(deps);
    await enqueue(deps, [heart]);
    await work(deps);
    await approve(deps, heart);
    expect(textOf(await art.read("/api/art/file/art/art/icons/heart.webp"))).toBe("png v1 256");

    await redo(deps, heart);
    // While the new one is made and reviewed, the approved one stays live.
    expect((await store.approvedFile("art/icons/heart.webp"))!.url).toBe("/api/art/file/art/art/icons/heart.webp");
    await work(deps);
    expect((await approve(deps, heart)).ok).toBe(true);
    expect(textOf(await art.read("/api/art/file/art/art/icons/heart.webp"))).toBe("png v2 256");
    const entry = (await store.entry(heart))!;
    expect(entry.previous).toHaveLength(1);
    expect(entry.previous![0]!.files["art/icons/heart.webp"]).toMatch(/^\/api\/art\/file\/art-factory\/previous\//);
    expect(textOf(await art.read(entry.previous![0]!.files["art/icons/heart-small.webp"]!))).toBe("png v1 64");

    const back = await putBack(deps, heart);
    expect(back.ok).toBe(true);
    expect(textOf(await art.read("/api/art/file/art/art/icons/heart.webp"))).toBe("png v1 256");
    expect(textOf(await art.read("/api/art/file/art/art/icons/heart-small.webp"))).toBe("png v1 64");
    const after = (await store.entry(heart))!;
    // The newer one is kept, so Put back can be undone; the old copy of v1 is gone (it is live again).
    expect(textOf(await art.read(after.previous![0]!.files["art/icons/heart.webp"]!))).toBe("png v2 256");
    expect(await art.read(entry.previous![0]!.files["art/icons/heart.webp"]!)).toBeNull();
    expect(approved.at(-1)).toMatchObject({ putBack: true });
    expect((await putBack(deps, heart)).ok).toBe(true);
    expect(textOf(await art.read("/api/art/file/art/art/icons/heart.webp"))).toBe("png v2 256");
  });

  it("earlier versions are tidied away after 30 days", async () => {
    const { deps, store, art, clock } = setup();
    await enqueue(deps, [heart]);
    await work(deps);
    await approve(deps, heart);
    await redo(deps, heart);
    await work(deps);
    await approve(deps, heart);
    const kept = (await store.entry(heart))!.previous![0]!;
    clock.now += (keepPreviousDays - 1) * 24 * 60 * 60 * 1000;
    expect(await cleanPrevious(deps)).toBe(0);
    clock.now += 2 * 24 * 60 * 60 * 1000;
    expect(await cleanPrevious(deps)).toBe(1);
    expect((await store.entry(heart))!.previous).toBeUndefined();
    expect(await art.read(kept.files["art/icons/heart.webp"]!)).toBeNull();
    // The live picture is untouched.
    expect(await art.read("/api/art/file/art/art/icons/heart.webp")).not.toBeNull();
  });
});

describe("approve is resumable", () => {
  /** An art store that refuses the next `n` writes under `art/`. */
  class FlakyStore extends MemoryArtStore {
    failNext = 0;
    override async put(key: string, bytes: ArrayBuffer, contentType: string) {
      if (key.startsWith("art/") && this.failNext > 0) {
        this.failNext -= 1;
        throw new Error("R2 hiccup");
      }
      return super.put(key, bytes, contentType);
    }
  }

  it("interrupted mid-set: nothing is recorded, and Approve again finishes without keeping the new one as 'previous'", async () => {
    const flaky = new FlakyStore();
    const { deps, store, provider, clock } = setup({ art: flaky });
    numberedPictures(provider);
    versionedConverter(deps);
    await enqueue(deps, [heart]);
    await work(deps);
    await approve(deps, heart);
    await redo(deps, heart);
    await work(deps);

    clock.now += 60_000;
    // The first size is written, the second refused.
    let calls = 0;
    const put = flaky.put.bind(flaky);
    flaky.put = async (key, bytes, type) => {
      if (key === "art/art/icons/heart-small.webp" && calls++ === 0) throw new Error("R2 hiccup");
      return put(key, bytes, type);
    };
    const failed = await approve(deps, heart);
    expect(failed).toMatchObject({ ok: false, code: "store-failed" });
    expect(!failed.ok && failed.message).toMatch(/Press Approve again: it carries on/);
    const halfway = (await store.entry(heart))!;
    expect(halfway.status).toBe("review");
    expect(halfway.approving?.previous?.files["art/icons/heart.webp"]).toBeDefined();
    // Not recorded yet: the approved map still points at the old set's time.
    const before = (await store.approvedFile("art/icons/heart-small.webp"))!.at;

    expect((await approve(deps, heart)).ok).toBe(true);
    const done = (await store.entry(heart))!;
    expect(done.status).toBe("approved");
    expect(done.approving).toBeUndefined();
    expect(done.previous).toHaveLength(1);
    // The kept version is v1, never the half-written v2.
    expect(textOf(await flaky.read(done.previous![0]!.files["art/icons/heart.webp"]!))).toBe("png v1 256");
    expect(textOf(await flaky.read("/api/art/file/art/art/icons/heart-small.webp"))).toBe("png v2 64");
    expect((await store.approvedFile("art/icons/heart-small.webp"))!.at).not.toBe(before);
  });

  it("a failed on-approve hook keeps the item approved, says so, and Retry tells the app again", async () => {
    const { deps, store } = setup();
    let tries = 0;
    deps.onApprove = () => {
      tries += 1;
      if (tries === 1) throw new Error("the game was busy");
    };
    await enqueue(deps, [heart]);
    await work(deps);
    const result = await approve(deps, heart);
    expect(result.ok && result.warning).toMatch(/on-approve step failed \(the game was busy\)/);
    expect((await store.entry(heart))!).toMatchObject({ status: "approved", hookError: { message: "the game was busy" } });
    const again = await retryHook(deps, heart);
    expect(again.ok && again.warning).toBeUndefined();
    expect((await store.entry(heart))!.hookError).toBeUndefined();
    expect(tries).toBe(2);
  });
});

describe("alt text and captions", () => {
  it("edited in review, they win over the catalogue's; empty goes back", async () => {
    const { deps, approved } = setup();
    expect(await setText(deps, heart, "  A red   heart-shaped gummy sweet. ")).toEqual({ ok: true, text: "A red heart-shaped gummy sweet." });
    await enqueue(deps, [heart]);
    await work(deps);
    await approve(deps, heart);
    expect(approved[0]!.text).toBe("A red heart-shaped gummy sweet.");
    expect(await setText(deps, heart, "")).toEqual({ ok: true, text: "A glossy red gummy heart." });
    expect((await setText(deps, "no/such/thing", "x")).ok).toBe(false);
  });

  it("artSrc hands back the alt text and caption with the address", () => {
    expect(artSrc("art/icons/heart.webp")).toBe("/api/art/made/art/icons/heart.webp");
    seedArtText({ "art/icons/heart.webp": { alt: "A gummy heart." }, "/public/art/sounds/star-pickup.mp3": { caption: "[A chime]" } });
    expect(artSrc("/art/icons/heart.webp", { withText: true })).toEqual({ src: "/api/art/made/art/icons/heart.webp", alt: "A gummy heart.", caption: "" });
    expect(artSrc("art/sounds/star-pickup.mp3", { withText: true }).caption).toBe("[A chime]");
    expect(artSrc("art/unknown.webp", { withText: true }).alt).toBe("");
  });
});

describe("the doors, for the new actions", () => {
  const site = "https://game.example";
  function build() {
    const provider = new FakeImageProvider();
    const sounds = new FakeSoundMaker(["sfx"]);
    const factory = createArtFactory({
      appName: "Space Snacks",
      prefix: "space-snacks",
      catalogue: jsonCatalogue(catalogueFile),
      env: { NODE_ENV: "production", ADMIN_PASSWORD: "pw", OPENAI_API_KEY_ImageGen: "sk-fake" },
      kv: new MemoryKv(),
      art: new MemoryArtStore(),
      convert: fakeConverter().convert,
      providerFor: () => provider,
      makers: [sounds],
    });
    const handlers = createHandlers(factory);
    let cookie = "";
    const call = async (handler: (request: Request) => Promise<Response>, path: string, body?: unknown) => {
      const response = await handler(new Request(`${site}${path}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
      const set = response.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0]!;
      return response;
    };
    const post = (body: unknown) => call(handlers.factoryPost, "/api/admin/art-factory", body);
    return { factory, handlers, call, post, sounds };
  }

  it("lists kinds and words, saves the run limit, edits alt text, puts back, and serves the words publicly", async () => {
    const { handlers, call, post } = build();
    await call(handlers.loginPost, "/api/admin/login", { password: "pw" });
    const state = await (await call(handlers.factoryGet, "/api/admin/art-factory")).json();
    const rows = state.groups.flatMap((group: { jobs: { images: { id: string }[] }[] }) => group.jobs.flatMap((job) => job.images));
    expect(rows.find((one: { id: string }) => one.id === chime)).toMatchObject({ kind: "sfx", format: "mp3", text: "[A sparkly chime]", textEdited: false });
    expect(rows.find((one: { id: string }) => one.id === heart)).toMatchObject({ kind: "image", text: "A glossy red gummy heart." });
    expect(state.settings).toMatchObject({ runLimitUsd: 5 });
    // The plugged-in maker makes effects; nothing is on for voices or music (the switcher is not on Practice).
    expect(state.makers).toEqual({ voice: null, sfx: "fakesound", music: null });

    expect(await (await post({ action: "settings", runLimitUsd: 2.5 })).json()).toMatchObject({ runLimitUsd: 2.5, perMinute: 8 });
    expect((await post({ action: "settings", runLimitUsd: -1 })).status).toBe(400);
    expect(await (await post({ action: "settings", runLimitUsd: null })).json()).toMatchObject({ runLimitUsd: null });

    expect(await (await post({ action: "text", id: heart, text: "A gummy heart." })).json()).toEqual({ id: heart, text: "A gummy heart." });
    const words = await (await call(handlers.textGet, "/api/art/text")).json();
    expect(words.files["art/icons/heart.webp"]).toEqual({ alt: "A gummy heart." });
    expect(words.files["art/icons/heart-small.webp"]).toEqual({ alt: "A gummy heart." });
    expect(words.files["art/sounds/star-pickup.mp3"]).toEqual({ caption: "[A sparkly chime]" });

    await post({ action: "queue", ids: [heart, chime] });
    await post({ action: "work", runId: "run-abcdef" });
    await post({ action: "work", runId: "run-abcdef" });
    expect((await post({ action: "approve", id: chime })).status).toBe(200);
    expect((await post({ action: "approve", id: heart })).status).toBe(200);
    expect((await post({ action: "put-back", id: heart })).status).toBe(409);
    await post({ action: "redo", id: heart });
    await post({ action: "work" });
    await post({ action: "approve", id: heart });
    const back = await post({ action: "put-back", id: heart });
    expect(back.status).toBe(200);
    expect((await back.json()).previous).toHaveLength(1);
    // A kept version is served privately through the file door.
    const entry = (await (await call(handlers.factoryGet, "/api/admin/art-factory?only=entries")).json()).entries[heart];
    const kept = await call(handlers.file, entry.previous[0].files["art/icons/heart.webp"]);
    expect(kept.status).toBe(200);
    expect(kept.headers.get("cache-control")).toMatch(/^private/);
  });

  it("the usage door takes a price by the unit, and a wallet for any provider", async () => {
    const { handlers, call } = build();
    await call(handlers.loginPost, "/api/admin/login", { password: "pw" });
    const report = await (await call(handlers.usagePost, "/api/admin/usage", { action: "set-price", model: "tune-1", unit: "seconds", perUnit: 0.002 })).json();
    expect(report.priceOverrides["tune-1"]).toEqual({ inputPerMillion: 0, outputPerMillion: 0, unit: "seconds", perUnit: 0.002 });
    expect((await call(handlers.usagePost, "/api/admin/usage", { action: "set-price", model: "tune-1", unit: "smells", perUnit: 1 })).status).toBe(400);
    const wallet = await (await call(handlers.usagePost, "/api/admin/usage", { action: "set-balance", provider: "suno", amountUsd: 3 })).json();
    expect(wallet.providers.find((one: { provider: string }) => one.provider === "suno")).toBeUndefined();
    // A wallet alone does not list a provider; once it has been used, it shows with its wallet.
    const { factory } = build();
    await factory.usage.setBalance("suno", 3);
    await factory.usage.record({ provider: "suno", model: "tune-1", billedTo: "site", ok: true, inputTokens: 0, outputTokens: 0, unit: "seconds", quantity: 5 });
    const summary = (await factory.usage.snapshot()).providers.find((one) => one.provider === "suno")!;
    expect(summary.wallet).toMatchObject({ balanceUsd: 3, stopAtZero: true });
  });

  it("on Practice, sounds with no real maker get free placeholders", async () => {
    const { factory } = build();
    await factory.settings.write({ dailyCap: 5, provider: "practice" });
    expect((await factory.maker("music", "x"))?.name).toBe("practice");
    // A maker the project plugged in still wins on its own kind.
    expect((await factory.maker("sfx", "x"))?.name).toBe("fakesound");
    await factory.settings.write({ dailyCap: 5, provider: "openai" });
    expect(await factory.maker("music", "x")).toBeNull();
  });
});
