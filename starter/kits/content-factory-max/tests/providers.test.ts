import { describe, expect, it } from "vitest";

import { GoogleImageProvider, meteredImageProvider, OpenAiImageProvider, openAiSize, openAiTokenEstimate, practiceSvg, PracticeImageProvider } from "../lib/art-factory/server/image-provider";
import { MemoryKv } from "../lib/art-factory/server/kv";
import { activeProvider, ArtSettingsStore, providerStatuses, siteKeyFor } from "../lib/art-factory/server/providers";
import { UsageLedger } from "../lib/art-factory/server/usage/usage-ledger";
import { FakeImageProvider } from "./support";

const png = Buffer.from("fake png").toString("base64");

function fakeFetch(answers: { status: number; body: unknown }[]) {
  const sent: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    sent.push({ url: String(input), body: JSON.parse(String(init?.body ?? "{}")), headers: init?.headers as Record<string, string> });
    const next = answers.shift()!;
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "content-type": "application/json" } });
  };
  return { fetcher, sent };
}

describe("which picture maker", () => {
  it("finds keys under any of their names, in any letter case, and never hands out the key itself in statuses", () => {
    expect(siteKeyFor("openai", { GPT_ImageGEN: "sk-x" })).toEqual({ key: "sk-x", from: "GPT_ImageGEN" });
    expect(siteKeyFor("google", { GEMINI_API_KEY: "g" })).toEqual({ key: "g", from: "GEMINI_API_KEY" });
    const statuses = providerStatuses({ OPENAI_API_KEY_ImageGen: "sk-secret" });
    expect(JSON.stringify(statuses)).not.toContain("sk-secret");
    expect(statuses.map((one) => [one.name, one.configured])).toEqual([
      ["openai", true],
      ["google", false],
      ["practice", true],
    ]);
  });

  it("uses the choice if it can draw, else the first real one with a key; practice only when picked", () => {
    expect(activeProvider({ GOOGLE_API_KEY_ImageGen: "g" }, "openai")!.name).toBe("google");
    expect(activeProvider({ GOOGLE_API_KEY_ImageGen: "g", OPENAI_API_KEY: "o" }, undefined)!.name).toBe("openai");
    expect(activeProvider({}, undefined)).toBeNull();
    expect(activeProvider({}, "practice")!.name).toBe("practice");
    expect(activeProvider({}, "practice", { practice: false })).toBeNull();
  });

  it("settings fall back to the env's daily cap and ignore junk", async () => {
    const kv = new MemoryKv();
    const settings = new ArtSettingsStore(kv, "t", { ART_DAILY_CAP: "3" });
    expect(await settings.read()).toEqual({ dailyCap: 3 });
    await kv.set("t:art-settings", JSON.stringify({ dailyCap: null, provider: "openai", openaiModel: "made-up", openaiQuality: "high" }));
    expect(await settings.read()).toEqual({ dailyCap: null, provider: "openai", openaiQuality: "high" });
  });
});

describe("OpenAI", () => {
  it("asks for see-through, and if the model will not, asks again on a plain ground rather than lose the picture", async () => {
    const { fetcher, sent } = fakeFetch([
      { status: 400, body: { error: { message: "Transparent background is not supported for this model." } } },
      { status: 200, body: { data: [{ b64_json: png }], usage: { input_tokens: 12, output_tokens: 1056 } } },
    ]);
    const result = await new OpenAiImageProvider("sk-test", "gpt-image-2", fetcher, "high").generate({ prompt: "a token", aspect: "3:4", background: "transparent" });
    expect(result.ok).toBe(true);
    expect(sent[0]!.body).toMatchObject({ model: "gpt-image-2", size: "1024x1536", quality: "high", background: "transparent" });
    expect(sent[1]!.body.background).toBeUndefined();
    expect(result.usage).toEqual({ model: "gpt-image-2", inputTokens: 12, outputTokens: 1056 });
  });

  it("names a moderation block as a refusal", async () => {
    const { fetcher } = fakeFetch([{ status: 400, body: { error: { message: "Your request was rejected by the safety system.", code: "moderation_blocked" } } }]);
    const result = await new OpenAiImageProvider("sk-test", undefined, fetcher).generate({ prompt: "x", aspect: "1:1" });
    expect(result).toMatchObject({ ok: false, code: "art-refused" });
  });

  it("sizes and token estimates", () => {
    expect(openAiSize("16:9")).toBe("1536x1024");
    expect(openAiTokenEstimate("gpt-image-1.5", "medium", "1:1")).toBe(1056);
    expect(openAiTokenEstimate("gpt-image-1.5", "medium", "3:2")).toBe(1584);
  });
});

describe("Google", () => {
  it("reads the picture and the token counts", async () => {
    const { fetcher, sent } = fakeFetch([{ status: 200, body: { modelVersion: "gemini-2.5-flash-image-001", usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 1290 }, candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: png } }] } }] } }]);
    const result = await new GoogleImageProvider("g-key", undefined, fetcher).generate({ prompt: "a map", aspect: "4:3" });
    expect(result).toMatchObject({ ok: true, usage: { model: "gemini-2.5-flash-image-001", inputTokens: 20, outputTokens: 1290 } });
    expect(sent[0]!.headers["x-goog-api-key"]).toBe("g-key");
    expect(sent[0]!.body).toMatchObject({ generationConfig: { imageConfig: { aspectRatio: "4:3" } } });
  });

  it("a safety finish is a refusal", async () => {
    const { fetcher } = fakeFetch([{ status: 200, body: { candidates: [{ finishReason: "IMAGE_SAFETY", content: { parts: [] } }] } }]);
    expect(await new GoogleImageProvider("g", undefined, fetcher).generate({ prompt: "x", aspect: "1:1" })).toMatchObject({ ok: false, code: "art-refused", detail: "IMAGE_SAFETY" });
  });
});

describe("practice pictures and the meter", () => {
  it("practice draws a real PNG with the picture's name, for free", async () => {
    expect(practiceSvg({ prompt: "x", aspect: "16:9", label: "Level <1> & up" })).toContain("Level &lt;1&gt; &amp; up");
    expect(practiceSvg({ prompt: "x", aspect: "1:1", background: "transparent" })).not.toContain("<rect");
    const result = await new PracticeImageProvider().generate({ prompt: "A heart", aspect: "1:1", label: "Heart" });
    expect(result.ok).toBe(true);
    expect(result.ok && Buffer.from(result.bytes).subarray(1, 4).toString()).toBe("PNG");
  });

  it("the meter records every real call with its purpose, and stop-at-zero blocks before paying", async () => {
    const ledger = new UsageLedger(new MemoryKv(), "t");
    const provider = new FakeImageProvider();
    const metered = meteredImageProvider(provider, ledger, "art-factory", "who");
    await metered.generate({ prompt: "a", aspect: "1:1" });
    const today = (await ledger.snapshot()).today;
    expect(today[0]).toMatchObject({ model: "gpt-image-1.5 · art-factory", answered: 1 });
    await ledger.setBalance("openai", 0);
    await ledger.setWalletSettings("openai", { stopAtZero: true });
    const stopped = await metered.generate({ prompt: "b", aspect: "1:1" });
    expect(stopped).toMatchObject({ ok: false, status: 402 });
    expect(provider.requests).toHaveLength(1);
    expect(meteredImageProvider(new PracticeImageProvider(), ledger, "art-factory")).toBeInstanceOf(PracticeImageProvider);
  });
});
