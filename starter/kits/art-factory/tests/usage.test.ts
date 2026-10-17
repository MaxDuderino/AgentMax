import { describe, expect, it } from "vitest";

import { MemoryKv } from "../lib/art-factory/server/kv";
import { costMicros, priceFor } from "../lib/art-factory/server/usage/price-table";
import { classifyFailure } from "../lib/art-factory/server/usage/usage-event";
import { linesFrom, sumLines, UsageLedger } from "../lib/art-factory/server/usage/usage-ledger";

describe("the price table", () => {
  it("matches the longest prefix and respects dated rows", () => {
    expect(priceFor("openai", "gpt-image-1.5", "2026-10-16")).toEqual({ inputPerMillion: 5, outputPerMillion: 32 });
    expect(priceFor("openai", "gpt-image-1-mini", "2026-10-16")).toEqual({ inputPerMillion: 2, outputPerMillion: 8 });
    expect(priceFor("google", "gemini-3.6-flash", "2026-12-31")!.outputPerMillion).toBe(3.75);
    expect(priceFor("google", "gemini-3.6-flash", "2027-01-01")!.outputPerMillion).toBe(7.5);
    expect(priceFor("openai", "dall-e-9", "2026-10-16")).toBeNull();
    expect(priceFor("openai", "dall-e-9", "2026-10-16", { "dall-e-9": { inputPerMillion: 1, outputPerMillion: 2 } })).toEqual({ inputPerMillion: 1, outputPerMillion: 2 });
    expect(costMicros({ inputPerMillion: 5, outputPerMillion: 32 }, 300, 1056)).toBe(35292);
  });

  it("reads credit problems from the words, not just the status", () => {
    expect(classifyFailure(400, "Your credit balance is too low")).toBe("no-credit");
    expect(classifyFailure(429, "You exceeded your current quota")).toBe("no-credit");
    expect(classifyFailure(429, "Rate limit")).toBe("busy");
    expect(classifyFailure(401, "Incorrect API key")).toBe("bad-key");
    expect(classifyFailure(404, "")).toBe("model-missing");
  });
});

describe("the usage ledger", () => {
  function ledgerAt(iso: string) {
    const clock = { now: new Date(iso) };
    const kv = new MemoryKv();
    return { ledger: new UsageLedger(kv, "test", () => clock.now), clock, kv };
  }

  it("counts calls by day, month and hour, priced, with the purpose beside the model", async () => {
    const { ledger } = ledgerAt("2026-10-16T12:30:00Z");
    await ledger.record({ provider: "openai", model: "gpt-image-1.5", billedTo: "site", ok: true, inputTokens: 300, outputTokens: 1056, purpose: "art-factory" });
    await ledger.record({ provider: "openai", model: "gpt-image-1.5", billedTo: "site", ok: false, failure: "busy", inputTokens: 0, outputTokens: 0, purpose: "art-factory" });
    await ledger.record({ provider: "openai", model: "mystery-model", billedTo: "site", ok: true, inputTokens: 10, outputTokens: 10, tag: "level-3" });
    const snapshot = await ledger.snapshot();
    const art = snapshot.today.find((line) => line.model === "gpt-image-1.5 · art-factory")!;
    expect(art).toMatchObject({ answered: 1, failed: 1, inputTokens: 300, outputTokens: 1056, costMicros: 35292, failures: { busy: 1 } });
    expect(snapshot.today.find((line) => line.model === "mystery-model")!.unpriced).toBe(1);
    expect(sumLines(snapshot.lastHour).answered).toBe(2);
    expect(snapshot.months[0]!.month).toBe("2026-10");
    expect(snapshot.tagsToday).toEqual([expect.objectContaining({ tag: "level-3" })]);
    expect(snapshot.firstDay).toBe("2026-10-16");
  });

  it("the wallet counts down from the balance the admin typed in, and stop-at-zero says skip", async () => {
    const { ledger } = ledgerAt("2026-10-16T12:30:00Z");
    await ledger.record({ provider: "openai", model: "gpt-image-1", billedTo: "site", ok: true, inputTokens: 0, outputTokens: 1_000_000 }); // $40 before the balance was set
    await ledger.setBalance("openai", 1);
    await ledger.record({ provider: "openai", model: "gpt-image-1", billedTo: "site", ok: true, inputTokens: 0, outputTokens: 12_500 }); // $0.50
    expect((await ledger.creditLeft("openai")).remainingUsd).toBeCloseTo(0.5, 6);
    await ledger.topUp("openai", 2);
    expect((await ledger.creditLeft("openai")).remainingUsd).toBeCloseTo(2.5, 6);
    await ledger.record({ provider: "openai", model: "gpt-image-1", billedTo: "site", ok: true, inputTokens: 0, outputTokens: 100_000 }); // $4
    expect(await ledger.shouldSkip("openai")).toBe(false);
    await ledger.setWalletSettings("openai", { stopAtZero: true });
    expect(await ledger.shouldSkip("openai")).toBe(true);
    const snapshot = await ledger.snapshot();
    expect(snapshot.warnings.join(" ")).toMatch(/OpenAI's estimated credit is used up, so the app has stopped asking it/);
    expect(snapshot.providers.find((one) => one.provider === "openai")!.wallet.history.map((one) => one.kind)).toEqual(["topup", "set"]);
  });

  it("own-key calls are counted but never added to the site's spend", async () => {
    const { ledger } = ledgerAt("2026-10-16T12:30:00Z");
    await ledger.setBalance("openai", 10);
    await ledger.record({ provider: "openai", model: "gpt-image-1", billedTo: "own-key", ok: true, inputTokens: 0, outputTokens: 1_000_000 });
    expect((await ledger.creditLeft("openai")).remainingUsd).toBe(10);
  });

  it("a standing problem shows until the next good answer", async () => {
    const { ledger, clock } = ledgerAt("2026-10-16T12:30:00Z");
    await ledger.record({ provider: "google", model: "gemini-2.5-flash-image", billedTo: "site", ok: false, failure: "bad-key", detail: "API key not valid", inputTokens: 0, outputTokens: 0 });
    expect((await ledger.snapshot()).warnings[0]).toMatch(/Google Gemini is key refused/);
    clock.now = new Date("2026-10-16T12:31:00Z");
    await ledger.record({ provider: "google", model: "gemini-2.5-flash-image", billedTo: "site", ok: true, inputTokens: 1, outputTokens: 1290 });
    expect((await ledger.snapshot()).providers.find((one) => one.provider === "google")!.problem).toBeNull();
  });

  it("an admin's price wins from the next call on", async () => {
    const { ledger } = ledgerAt("2026-10-16T12:30:00Z");
    await ledger.setPrice("brand-new-model", { inputPerMillion: 0, outputPerMillion: 100 });
    await ledger.record({ provider: "openai", model: "brand-new-model", billedTo: "site", ok: true, inputTokens: 0, outputTokens: 10_000 });
    expect((await ledger.snapshot()).today[0]!.costMicros).toBe(1_000_000);
  });

  it("reads hash fields it understands and skips the rest", () => {
    expect(linesFrom({ "openai|m|site|answered": "2", junk: "1", "openai|m|site|cost": "5" })).toEqual([expect.objectContaining({ answered: 2, costMicros: 5 })]);
  });
});
