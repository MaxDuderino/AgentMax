import { describe, expect, it } from "vitest";

import example from "../art/art-catalogue.json";
import { jsonCatalogue, type CatalogueFile } from "../lib/art-factory/core/json-catalogue";
import { passwordGate } from "../lib/art-factory/server/admin-gate";
import { MemoryArtStore } from "../lib/art-factory/server/art-store";
import { createHandlers } from "../lib/art-factory/server/handlers";
import { MemoryKv } from "../lib/art-factory/server/kv";
import { createArtFactory, type ArtFactoryConfig } from "../lib/art-factory/server/setup";
import { FakeImageProvider, fakeConverter } from "./support";

/**
 * The doors end to end, as a browser would use them: sign in, switch the
 * picture maker, queue, make, approve, then fetch the approved picture at its
 * address. Memory stores, a fake picture maker, no network.
 */
const site = "https://game.example";

function build(env: Record<string, string> = {}, extra: Partial<ArtFactoryConfig> = {}) {
  const provider = new FakeImageProvider();
  const approved: string[] = [];
  const factory = createArtFactory({
    appName: "Space Snacks",
    prefix: "space-snacks",
    catalogue: jsonCatalogue(example as unknown as CatalogueFile, { onApprove: ({ image }) => void approved.push(image.id) }),
    env: { NODE_ENV: "production", ADMIN_PASSWORD: "correct horse", OPENAI_API_KEY_ImageGen: "sk-fake", ...env },
    kv: new MemoryKv(),
    art: new MemoryArtStore(),
    convert: fakeConverter().convert,
    providerFor: () => provider,
    ...extra,
  });
  const handlers = createHandlers(factory);
  let cookie = "";
  const call = async (handler: (request: Request) => Promise<Response>, path: string, body?: unknown) => {
    const response = await handler(new Request(`${site}${path}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0]!;
    return response;
  };
  return { factory, handlers, call, provider, approved, signOut: () => (cookie = "") };
}

describe("the doors", () => {
  it("every admin door is a 404 to anyone who is not the admin", async () => {
    const { handlers, call } = build();
    for (const [handler, path, body] of [
      [handlers.factoryGet, "/api/admin/art-factory", undefined],
      [handlers.factoryPost, "/api/admin/art-factory", { action: "work" }],
      [handlers.settingsGet, "/api/admin/art/settings", undefined],
      [handlers.settingsPost, "/api/admin/art/settings", { provider: "practice" }],
      [handlers.usageGet, "/api/admin/usage", undefined],
      [handlers.usagePost, "/api/admin/usage", { action: "set-balance", provider: "openai", amountUsd: 5 }],
    ] as const) {
      expect((await call(handler, path, body)).status).toBe(404);
    }
  });

  it("the whole loop: sign in, queue, make, approve, then the picture is served at its path", async () => {
    const { handlers, call, approved } = build();
    expect((await call(handlers.loginPost, "/api/admin/login", { password: "wrong" })).status).toBe(401);
    expect((await call(handlers.loginPost, "/api/admin/login", { password: "correct horse" })).status).toBe(200);

    const state = await (await call(handlers.factoryGet, "/api/admin/art-factory")).json();
    expect(state.groups.map((group: { id: string }) => group.id)).toEqual(["icons", "enemies", "backgrounds"]);
    expect(state.activeProvider).toBe("openai");
    expect(state.cost.usd).toBeGreaterThan(0.03);
    expect(JSON.stringify(state)).not.toContain("sk-fake");

    expect(await (await call(handlers.factoryPost, "/api/admin/art-factory", { action: "queue", job: "icons/ui" })).json()).toEqual({ added: 3, skipped: 0, unknown: 0 });
    const made = await (await call(handlers.factoryPost, "/api/admin/art-factory", { action: "work" })).json();
    expect(made).toMatchObject({ kind: "made", imageId: "icons/ui/heart" });

    // The review copy is served through the file door, privately.
    const review = await call(handlers.file, made.entry.reviewUrl);
    expect(review.status).toBe(200);
    expect(review.headers.get("cache-control")).toMatch(/^private/);

    expect((await call(handlers.factoryPost, "/api/admin/art-factory", { action: "approve", id: "icons/ui/heart" })).status).toBe(200);
    expect(approved).toEqual(["icons/ui/heart"]);

    const served = await call(handlers.made, "/api/art/made/art/icons/heart-small.webp");
    expect(served.status).toBe(307);
    expect(served.headers.get("location")).toBe(`${site}/api/art/file/art/art/icons/heart-small.webp`);
    const file = await call(handlers.file, "/api/art/file/art/art/icons/heart-small.webp");
    expect(await file.text()).toBe("webp 64x64");
    expect(file.headers.get("cache-control")).toMatch(/s-maxage=86400/);

    // Not approved yet: the public folder's copy, if the project has one.
    expect((await call(handlers.made, "/api/art/made/art/icons/star.webp")).headers.get("location")).toBe(`${site}/art/icons/star.webp`);
  });

  it("the file door only opens its own folders", async () => {
    const { handlers, call } = build();
    for (const path of ["/api/art/file/secrets/x", "/api/art/file/art/../made/x", "/api/art/file/"]) expect((await call(handlers.file, path)).status).toBe(404);
  });

  it("asking for a picture's words shows exactly what is sent; style edits change it", async () => {
    const { handlers, call } = build();
    await call(handlers.loginPost, "/api/admin/login", { password: "correct horse" });
    await call(handlers.factoryPost, "/api/admin/art-factory", { action: "style", group: "icons", text: "Pixel art, 16 colours." });
    const words = await (await call(handlers.factoryGet, "/api/admin/art-factory?prompt=icons%2Fui%2Fstar")).json();
    expect(words.sent).toBe("Pixel art, 16 colours.\n\nA five-pointed golden star, puffy like a marshmallow, a tiny smile.");
    await call(handlers.factoryPost, "/api/admin/art-factory", { action: "style", group: "icons", text: null });
    expect((await (await call(handlers.factoryGet, "/api/admin/art-factory?prompt=icons%2Fui%2Fstar")).json()).sent).toMatch(/^House style for Space Snacks icons/);
  });

  it("the switcher: refuses a provider with no key, switches to practice, and the factory follows", async () => {
    const { handlers, call } = build();
    await call(handlers.loginPost, "/api/admin/login", { password: "correct horse" });
    const refused = await call(handlers.settingsPost, "/api/admin/art/settings", { provider: "google" });
    expect(refused.status).toBe(400);
    expect((await refused.json()).error.message).toMatch(/not set up/);
    const switched = await (await call(handlers.settingsPost, "/api/admin/art/settings", { provider: "practice" })).json();
    expect(switched.activeProvider).toBe("practice");
    const state = await (await call(handlers.factoryGet, "/api/admin/art-factory")).json();
    expect(state.cost).toMatchObject({ providerName: "practice", usd: 0 });
    const quality = await (await call(handlers.settingsPost, "/api/admin/art/settings", { provider: "openai", openaiModel: "gpt-image-1-mini", openaiQuality: "low" })).json();
    expect(quality).toMatchObject({ activeProvider: "openai", openaiModel: "gpt-image-1-mini", openaiQuality: "low" });
    expect(quality.openaiModels.find((one: { id: string }) => one.id === "gpt-image-1-mini").usd.low).toBeGreaterThan(0);
  });

  it("the usage door records a balance and answers the whole report", async () => {
    const { handlers, call } = build();
    await call(handlers.loginPost, "/api/admin/login", { password: "correct horse" });
    const report = await (await call(handlers.usagePost, "/api/admin/usage", { action: "set-balance", provider: "openai", amountUsd: 12.5 })).json();
    expect(report.providers.find((one: { provider: string }) => one.provider === "openai").remainingUsd).toBe(12.5);
    expect(report.services.map((one: { id: string }) => one.id)).toEqual(["redis", "r2", "vercel"]);
    expect((await call(handlers.usagePost, "/api/admin/usage", { action: "top-up", provider: "openai", amountUsd: 0 })).status).toBe(400);
  });

  it("Make art: admin only by default, then capped per person per day when the project says who people are", async () => {
    const { handlers, call } = build();
    expect((await call(handlers.makePost, "/api/art/make", { prompt: "A cat", kind: "item" })).status).toBe(403);
    await call(handlers.loginPost, "/api/admin/login", { password: "correct horse" });
    const made = await (await call(handlers.makePost, "/api/art/make", { prompt: "A cat in a spacesuit", kind: "item" })).json();
    expect(made).toMatchObject({ ok: true, remaining: null });
    expect(made.key).toMatch(/^made\/admin\/2\d{3}-\d\d-\d\d-.+\.webp$/);

    const people = build({}, { whoIs: (request) => request.headers.get("x-user") });
    await people.factory.settings.write({ dailyCap: 1 });
    const asUser = (body: unknown) => people.handlers.makePost(new Request(`${site}/api/art/make`, { method: "POST", headers: { "content-type": "application/json", "x-user": "pat" }, body: JSON.stringify(body) }));
    expect((await asUser({ prompt: "A dog", kind: "item" })).status).toBe(200);
    const second = await asUser({ prompt: "A dog", kind: "item" });
    expect(second.status).toBe(429);
    expect((await asUser({ prompt: "A dog", kind: "nonsense" })).status).toBe(400);
    // Ten clicks at once with a cap of 3: exactly three pictures are drawn, and the refused ones cost nothing.
    const busy = build({}, { whoIs: (request) => request.headers.get("x-user") });
    await busy.factory.settings.write({ dailyCap: 3 });
    const results = await Promise.all(
      Array.from({ length: 10 }, () => busy.handlers.makePost(new Request(`${site}/api/art/make`, { method: "POST", headers: { "content-type": "application/json", "x-user": "kai" }, body: JSON.stringify({ prompt: "A fox", kind: "item" }) }))),
    );
    expect(results.filter((one) => one.status === 200)).toHaveLength(3);
    expect(busy.provider.requests).toHaveLength(3);
    // A failed drawing hands its slot back.
    const failing = build({}, { whoIs: () => "lee" });
    await failing.factory.settings.write({ dailyCap: 1 });
    failing.provider.next = [{ ok: false, code: "art-failed", detail: "boom" }];
    const tryOnce = () => failing.handlers.makePost(new Request(`${site}/api/art/make`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "A fox", kind: "item" }) }));
    expect((await tryOnce()).status).toBe(502);
    expect((await tryOnce()).status).toBe(200);

    const status = await (await people.handlers.makeGet(new Request(`${site}/api/art/make`, { headers: { "x-user": "pat" } }))).json();
    expect(status).toMatchObject({ allowed: true, on: true, remaining: 0, cap: 1 });
    expect(Object.keys(status.kinds)).toContain("character");
  });
});

describe("the admin gate", () => {
  it("signs a cookie that expires, and a forged one fails", async () => {
    const clock = { now: Date.parse("2026-10-16T00:00:00Z") };
    const gate = passwordGate({ env: { ADMIN_PASSWORD: "pw", NODE_ENV: "production" }, prefix: "g", now: () => clock.now });
    const response = await gate.login(new Request(`${site}/`, { method: "POST", body: JSON.stringify({ password: "pw" }) }));
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly; SameSite=Lax; Max-Age=2592000; Secure$/);
    const value = cookie.split(";")[0]!;
    expect(await gate.isAdmin(new Request(site, { headers: { cookie: value } }))).toBe(true);
    expect(await gate.isAdmin(new Request(site, { headers: { cookie: value.replace(/.$/, (c) => (c === "0" ? "1" : "0")) } }))).toBe(false);
    clock.now += 31 * 24 * 60 * 60 * 1000;
    expect(await gate.isAdmin(new Request(site, { headers: { cookie: value } }))).toBe(false);
  });

  it("no password: open on a laptop, locked live", async () => {
    expect(passwordGate({ env: {}, prefix: "g" }).mode()).toBe("open-laptop");
    expect(await passwordGate({ env: {}, prefix: "g" }).isAdmin(new Request(site))).toBe(true);
    const live = passwordGate({ env: { NODE_ENV: "production" }, prefix: "g" });
    expect(live.mode()).toBe("locked");
    expect(await live.isAdmin(new Request(site))).toBe(false);
    expect((await live.login(new Request(site, { method: "POST", body: "{}" }))).status).toBe(400);
  });

  it("slows down a guesser after ten tries a minute", async () => {
    const gate = passwordGate({ env: { ADMIN_PASSWORD: "pw", NODE_ENV: "production" }, prefix: "g", kv: new MemoryKv() });
    const guess = () => gate.login(new Request(site, { method: "POST", headers: { "x-forwarded-for": "1.2.3.4" }, body: JSON.stringify({ password: "nope" }) }));
    for (let i = 0; i < 10; i += 1) expect((await guess()).status).toBe(401);
    expect((await guess()).status).toBe(429);
  });

  it("a project's own isAdmin replaces the gate", async () => {
    const { handlers } = build({}, { isAdmin: (request) => request.headers.get("x-admin") === "yes" });
    expect((await handlers.factoryGet(new Request(`${site}/api/admin/art-factory`, { headers: { "x-admin": "yes" } }))).status).toBe(200);
    expect((await (await handlers.sessionGet(new Request(`${site}/api/admin/login`))).json()).gate).toBe("custom");
  });
});
