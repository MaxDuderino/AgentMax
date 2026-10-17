import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import example from "../art/art-catalogue.json";
import { groupsFromFile, jsonCatalogue, type CatalogueFile } from "../lib/art-factory/core/json-catalogue";
import { softenWords } from "../lib/art-factory/core/soften";
import { indexCatalogue } from "../lib/art-factory/core/types";
import { MemoryArtStore } from "../lib/art-factory/server/art-store";
import { approve, enqueue, redo, work, type FactoryDeps } from "../lib/art-factory/server/factory-service";
import { FactoryStore } from "../lib/art-factory/server/factory-store";
import { createHandlers } from "../lib/art-factory/server/handlers";
import type { ImageProvider } from "../lib/art-factory/server/image-provider";
import { MemoryKv } from "../lib/art-factory/server/kv";
import { createArtFactory } from "../lib/art-factory/server/setup";
import type { Entry, GroupRow } from "../lib/art-factory/ui/factory-shared";
import { ItemBrowser, RefusalHelper, ReviewMode, type Found } from "../lib/art-factory/ui/factory-views";
import { FakeImageProvider, fakeConverter } from "./support";

/**
 * Content Factory MAX phase 2 (2026-10-17): working at 907-item scale.
 * Redo counts and cost truth, the refusal helper (soften the words, or try
 * the other provider), prompt-fix export, and the grid and review mode.
 */
const catalogueFile = example as unknown as CatalogueFile;
const heart = "icons/ui/heart";

function setup() {
  const kv = new MemoryKv();
  const store = new FactoryStore(kv, "test");
  const openai = new FakeImageProvider("openai", "gpt-image-1.5");
  const google = new FakeImageProvider("google", "gemini-2.5-flash-image");
  const keys = new Set(["openai", "google"]);
  const indexed = indexCatalogue(groupsFromFile(catalogueFile));
  const deps: FactoryDeps = {
    store,
    art: new MemoryArtStore(),
    catalogue: async () => indexed,
    // The switcher is on OpenAI; asking for one by name gets that one if its key is set.
    provider: async (only?: string): Promise<ImageProvider | null> => (only ? (keys.has(only) ? (only === "google" ? google : openai) : null) : openai),
    convert: fakeConverter().convert,
  };
  return { deps, store, openai, google, keys };
}

describe("the refusal helper's soften", () => {
  it("swaps the words that trip safety filters, says what it changed, and keeps the scene", () => {
    const soft = softenWords("A bloody orc axe over a pile of corpses. Blood pools on the stones; the goblin was decapitated.");
    expect(soft.text).toBe("A battle-worn orc axe over a pile of fallen figures. Red paint pools on the stones; the goblin was defeated.");
    expect(soft.changes).toEqual([
      { from: "decapitated", to: "defeated" },
      { from: "corpses", to: "fallen figures" },
      { from: "bloody", to: "battle-worn" },
      { from: "Blood", to: "Red paint" },
    ]);
    expect(softenWords("A happy cat on a cushion.")).toEqual({ text: "A happy cat on a cushion.", changes: [] });
  });
});

describe("redo counts, draws and refusals", () => {
  it("counts a redo only once something came back; a first try after a failure is not one", async () => {
    const { deps, store, openai } = setup();
    openai.next = [{ ok: false, code: "art-refused", detail: "safety system" }];
    await enqueue(deps, [heart]);
    await work(deps);
    expect((await store.entry(heart))!).toMatchObject({ status: "failed", refused: true });
    await redo(deps, heart);
    expect((await store.entry(heart))!.redos).toBeUndefined();
    await work(deps);
    expect((await store.entry(heart))!).toMatchObject({ status: "review", draws: 1 });
    expect((await store.entry(heart))!.refused).toBeUndefined();
    await redo(deps, heart);
    await work(deps);
    await approve(deps, heart);
    await redo(deps, heart);
    expect((await store.entry(heart))!).toMatchObject({ redos: 2, draws: 2, status: "queued" });
  });

  it("try the other provider: that one draws it, once, and the next redo goes back to the switcher", async () => {
    const { deps, store, openai, google } = setup();
    openai.next = [{ ok: false, code: "art-refused", detail: "moderation_blocked" }];
    await enqueue(deps, [heart]);
    await work(deps);
    await redo(deps, heart, undefined, { provider: "google" });
    expect((await store.entry(heart))!.useProvider).toBe("google");
    expect((await work(deps)).kind).toBe("made");
    expect(google.requests).toHaveLength(1);
    expect((await store.entry(heart))!).toMatchObject({ provider: "google" });
    expect((await store.entry(heart))!.useProvider).toBeUndefined();
    await redo(deps, heart);
    await work(deps);
    expect(openai.requests).toHaveLength(2);
  });

  it("asked for a provider with no key, the item waits rather than going to the wrong one", async () => {
    const { deps, store, keys } = setup();
    keys.delete("google");
    await enqueue(deps, [heart]);
    await work(deps);
    await redo(deps, heart, undefined, { provider: "google" });
    expect((await work(deps)).kind).toBe("off");
    expect((await store.entry(heart))!.status).toBe("queued");
  });
});

describe("the doors for phase 2", () => {
  const site = "https://game.example";
  function build(env: Record<string, string> = {}) {
    const provider = new FakeImageProvider();
    const factory = createArtFactory({
      appName: "Space Snacks",
      prefix: "space-snacks",
      catalogue: jsonCatalogue(catalogueFile),
      env: { NODE_ENV: "production", ADMIN_PASSWORD: "pw", OPENAI_API_KEY_ImageGen: "sk-fake", ...env },
      kv: new MemoryKv(),
      art: new MemoryArtStore(),
      convert: fakeConverter().convert,
      providerFor: () => provider,
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
    return { factory, handlers, call, post, provider };
  }

  it("soften shows the words and changes it would send; nothing is redrawn until Redo", async () => {
    const { handlers, call, post, factory } = build();
    await call(handlers.loginPost, "/api/admin/login", { password: "pw" });
    await post({ action: "queue", ids: [heart] });
    await post({ action: "work" });
    await post({ action: "redo", id: heart, prompt: "A bloody heart" });
    const soft = await (await post({ action: "soften", id: heart })).json();
    expect(soft).toEqual({ id: heart, before: "A bloody heart", text: "A battle-worn heart", changes: [{ from: "bloody", to: "battle-worn" }] });
    expect((await factory.store.entry(heart))!.prompt).toBe("A bloody heart");
  });

  it("try the other provider is refused when that provider has no key, and lists the ones that do", async () => {
    const { handlers, call, post } = build();
    await call(handlers.loginPost, "/api/admin/login", { password: "pw" });
    await post({ action: "queue", ids: [heart] });
    await post({ action: "work" });
    const refused = await post({ action: "redo", id: heart, provider: "google" });
    expect(refused.status).toBe(400);
    expect((await refused.json()).error.message).toMatch(/Google is not set up/);
    expect((await post({ action: "redo", id: heart, provider: "practice" })).status).toBe(400);
    const both = build({ GOOGLE_API_KEY_ImageGen: "g-fake" });
    await both.call(both.handlers.loginPost, "/api/admin/login", { password: "pw" });
    expect((await (await both.call(both.handlers.factoryGet, "/api/admin/art-factory")).json()).pictureMakers).toEqual(["openai", "google"]);
  });

  it("exports the prompt fixes, alt text edits and style edits as a download for the project's prompts.json", async () => {
    const { handlers, call, post } = build();
    await call(handlers.loginPost, "/api/admin/login", { password: "pw" });
    await post({ action: "queue", ids: [heart] });
    await post({ action: "work" });
    await post({ action: "redo", id: heart, prompt: "A heart made of jelly." });
    await post({ action: "text", id: heart, text: "A jelly heart." });
    await post({ action: "style", group: "icons", text: "Pixel art." });
    const response = await call(handlers.factoryGet, "/api/admin/art-factory?export=fixes");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="space-snacks-prompt-fixes-\d{4}-\d\d-\d\d\.json"$/);
    const file = await response.json();
    expect(file).toMatchObject({ kind: "content-factory-prompt-fixes", version: 1, project: "Space Snacks" });
    expect(file.fixes).toEqual([{ id: heart, assetId: "heart", prompt: "A heart made of jelly.", original: "A glossy red heart, slightly squashed like a gummy sweet, with a white highlight.", status: "queued" }]);
    expect(file.texts).toEqual([{ id: heart, assetId: "heart", field: "alt", text: "A jelly heart." }]);
    expect(file.styles).toEqual({ "Interface icons": "Pixel art." });
    // Admins only, like every factory door.
    expect((await build().handlers.factoryGet(new Request(`${site}/api/admin/art-factory?export=fixes`))).status).toBe(404);
  });

  it("cost truth: what an approved item really cost, redos included, against the list price", async () => {
    const { handlers, call, post } = build();
    await call(handlers.loginPost, "/api/admin/login", { password: "pw" });
    await post({ action: "queue", ids: [heart, "icons/ui/star"] });
    for (let i = 0; i < 2; i += 1) await post({ action: "work" });
    await post({ action: "redo", id: heart });
    await post({ action: "work" });
    await post({ action: "approve", id: heart });
    await post({ action: "approve", id: "icons/ui/star" });
    const truth = (await (await call(handlers.usageGet, "/api/admin/usage")).json()).factory;
    expect(truth.groups).toHaveLength(1);
    expect(truth.groups[0]).toMatchObject({ id: "icons", items: 3, approved: 2, draws: 3, redos: 1, redoRate: 0.5 });
    // Three draws at about 3.5¢ for two approved pictures: about 5.3¢ each, against 3.5¢ list.
    expect(truth.total.perApprovedUsd).toBeCloseTo(0.0353 * 1.5, 3);
    expect(truth.listUsd).toBeCloseTo(0.0353, 3);
  });
});

describe("the grid and review mode render", () => {
  const groups = groupsFromFile(catalogueFile);
  const rows: GroupRow[] = groups.map((group) => ({
    id: group.id,
    title: group.title,
    intro: null,
    style: group.style ?? "",
    styleEdited: false,
    defaultStyle: group.style ?? "",
    jobs: group.jobs.map((job) => ({ key: job.key, title: job.title, meta: job.meta, note: job.note, images: job.images.map((image) => ({ id: image.id, kind: image.kind ?? "image", number: image.number, description: image.description, target: image.target, outputs: [...image.outputs], aspect: image.aspect, text: image.alt ?? image.caption ?? "", textEdited: false })) })),
  }));
  const images = new Map<string, Found>();
  for (const group of rows) for (const job of group.jobs) for (const image of job.images) images.set(image.id, { image, job, group });
  const entries: Record<string, Entry> = {
    [heart]: { imageId: heart, status: "review", seq: 1, attempts: 1, reviewUrl: "/api/art/file/art-factory/review/heart.webp", provider: "openai", redos: 2, spentUsd: 0.1 },
    "icons/ui/star": { imageId: "icons/ui/star", status: "failed", seq: 2, attempts: 1, refused: true, provider: "openai", error: "refused" },
  };

  it("the grid: every item as a tile with its status, redos and cost; the filters and a bulk queue for the new ones", () => {
    const html = renderToStaticMarkup(<ItemBrowser images={images} groups={rows} entries={entries} onQueue={() => undefined} renderDetail={() => null} />);
    expect(html).toContain(`${images.size} of ${images.size} items`);
    expect(html).toContain("2 redos");
    expect(html).toContain("$0.10");
    expect(html).toContain("refused by a safety filter");
    expect(html).toContain("Make the 10 new ones shown");
    expect(html.match(/class="af-tile"/g)).toHaveLength(images.size);
  });

  it("review mode: one item big, the keys spelled out, and the rest of its set", () => {
    const html = renderToStaticMarkup(<ReviewMode review={[entries[heart]!]} images={images} entries={entries} onDecided={() => undefined} onText={() => undefined} onClose={() => undefined} />);
    expect(html).toContain('aria-label="Review mode"');
    expect(html).toContain("<kbd>A</kbd> approve");
    expect(html).toContain("1 of 1");
    expect(html).toContain("The rest of this set");
    expect(html).toContain('alt="A glossy red gummy heart."');
  });

  it("the refusal helper offers to soften and to try the other provider, never the one that refused", () => {
    const html = renderToStaticMarkup(<RefusalHelper entry={entries["icons/ui/star"]!} image={images.get("icons/ui/star")!.image} others={["openai", "google"]} onDone={() => undefined} />);
    expect(html).toContain("Soften the words");
    expect(html).toContain("Try Google instead");
    expect(html).not.toContain("Try OpenAI instead");
  });
});
