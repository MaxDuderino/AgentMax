/**
 * The picture maker behind one interface (ported from DnD-Max, Issues 324
 * and 421).
 *
 * The factory and Make art only ever call {@link ImageProvider.generate}.
 * Which company draws is decided here and nowhere else, so a new provider is
 * a new class, not a change to the callers. Plain `fetch`, no SDKs.
 *
 * - **OpenAI** (`gpt-image-1.5` by default): the only one that draws on a
 *   see-through ground.
 * - **Google** (Gemini's image model, `gemini-2.5-flash-image` by default; a
 *   model whose name starts `imagen` is asked through Imagen's shape).
 * - **Practice**: free placeholder pictures drawn on the server, so the whole
 *   flow (queue, review, approve, every size cut) can be rehearsed before a
 *   cent is spent. Never metered.
 *
 * Every real call reports its token counts so the usage ledger can price it.
 */
import { classifyFailure, type UsageMeter } from "./usage/usage-event";

export type ImageAspect = "1:1" | "4:3" | "3:4" | "2:3" | "3:2" | "16:9" | "9:16";

export interface ImageUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export type ImageResult =
  | { ok: true; bytes: ArrayBuffer; contentType: string; usage?: ImageUsage }
  | { ok: false; code: "art-refused" | "art-failed"; detail: string; status?: number; usage?: ImageUsage };

export interface ImageRequest {
  prompt: string;
  aspect: ImageAspect;
  /** Ask for a see-through ground. Only OpenAI can; the others draw whatever ground the words describe. */
  background?: "transparent";
  /** A short label, used by the practice maker to write on its placeholder. */
  label?: string;
}

export interface ImageProvider {
  readonly name: string;
  readonly model?: string;
  generate(input: ImageRequest): Promise<ImageResult>;
}

export type ImageProviderName = "openai" | "google" | "practice";

export const imageProviderNames: readonly ImageProviderName[] = ["openai", "google", "practice"];

export const imageProviderLabels: Readonly<Record<ImageProviderName, string>> = {
  openai: "OpenAI (gpt-image)",
  google: "Google (Gemini image)",
  practice: "Practice (free placeholders)",
};

function base64ToArrayBuffer(data: string): ArrayBuffer {
  const bytes = Uint8Array.from(Buffer.from(data, "base64"));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const blockedReasons = new Set(["SAFETY", "PROHIBITED_CONTENT", "IMAGE_SAFETY", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_PROHIBITED_CONTENT"]);

/** Gemini bills a 1024px picture as 1,290 output tokens; used when a reply does not say. */
export const geminiImageTokens = 1290;

export const defaultGoogleModel = "gemini-2.5-flash-image";

export class GoogleImageProvider implements ImageProvider {
  readonly name = "google";
  readonly model: string;
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;

  constructor(apiKey: string, model = defaultGoogleModel, fetcher: typeof fetch = (input, init) => fetch(input, init)) {
    this.#apiKey = apiKey;
    this.model = model;
    this.#fetch = fetcher;
  }

  async generate(input: ImageRequest): Promise<ImageResult> {
    const base = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}`;
    const imagen = this.model.startsWith("imagen");
    const aspect = imagen && (input.aspect === "2:3" || input.aspect === "3:2") ? (input.aspect === "2:3" ? "3:4" : "4:3") : input.aspect;
    let response: Response;
    try {
      response = await this.#fetch(imagen ? `${base}:predict` : `${base}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.#apiKey },
        body: JSON.stringify(
          imagen
            ? { instances: [{ prompt: input.prompt }], parameters: { sampleCount: 1, aspectRatio: aspect } }
            : { contents: [{ role: "user", parts: [{ text: input.prompt }] }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect } } },
        ),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      return { ok: false, code: "art-failed", detail: error instanceof Error ? error.message : "could not reach the picture maker" };
    }
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok || !body) {
      const message = (body?.["error"] as { message?: string } | undefined)?.message ?? `HTTP ${response.status}`;
      return { ok: false, code: response.status === 400 && /safety|blocked|policy/i.test(message) ? "art-refused" : "art-failed", detail: message, status: response.status };
    }
    const metadata = body["usageMetadata"] as { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;
    const usage: ImageUsage = {
      model: (body["modelVersion"] as string | undefined) ?? this.model,
      inputTokens: metadata?.promptTokenCount ?? 0,
      outputTokens: metadata?.candidatesTokenCount ?? (imagen ? 0 : geminiImageTokens),
    };
    if (imagen) {
      const prediction = (body["predictions"] as { bytesBase64Encoded?: string; mimeType?: string; raiFilteredReason?: string }[] | undefined)?.[0];
      if (!prediction?.bytesBase64Encoded) return { ok: false, code: "art-refused", detail: prediction?.raiFilteredReason ?? "no picture came back" };
      return { ok: true, bytes: base64ToArrayBuffer(prediction.bytesBase64Encoded), contentType: prediction.mimeType ?? "image/png", usage };
    }
    const blocked = (body["promptFeedback"] as { blockReason?: string } | undefined)?.blockReason;
    if (blocked) return { ok: false, code: "art-refused", detail: blocked, usage: { ...usage, outputTokens: 0 } };
    const candidate = (body["candidates"] as { finishReason?: string; content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] | undefined)?.[0];
    const image = candidate?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
    if (!image?.data) {
      return { ok: false, code: candidate?.finishReason && blockedReasons.has(candidate.finishReason) ? "art-refused" : "art-failed", detail: candidate?.finishReason ?? "no picture came back", usage: { ...usage, outputTokens: 0 } };
    }
    return { ok: true, bytes: base64ToArrayBuffer(image.data), contentType: image.mimeType ?? "image/png", usage };
  }
}

export type OpenAiQuality = "low" | "medium" | "high";

export const openAiQualities: readonly OpenAiQuality[] = ["low", "medium", "high"];

/**
 * The OpenAI picture models the switcher offers (2026-10-16). Prices and
 * retirement dates came from third-party pages that disagreed, so notes say
 * "about" and the usage ledger counts what each call really reported.
 */
export const openAiModels: readonly { id: string; label: string; note: string }[] = [
  { id: "gpt-image-1.5", label: "GPT Image 1.5", note: "the default: sharp, follows long prompts, see-through backgrounds" },
  { id: "gpt-image-2", label: "GPT Image 2", note: "the newest; see-through backgrounds were still in preview, so a token may come back on a plain ground" },
  { id: "gpt-image-1-mini", label: "GPT Image 1 mini", note: "the cheapest: good for a test round before the real one" },
  { id: "gpt-image-1", label: "GPT Image 1", note: "the original; reported to be retiring in late October 2026" },
];

export const defaultOpenAiModel = "gpt-image-1.5";

/** OpenAI's three sizes, nearest to the aspect asked for. */
export function openAiSize(aspect: ImageAspect): "1024x1024" | "1536x1024" | "1024x1536" {
  if (aspect === "4:3" || aspect === "3:2" || aspect === "16:9") return "1536x1024";
  if (aspect === "3:4" || aspect === "2:3" || aspect === "9:16") return "1024x1536";
  return "1024x1024";
}

/** About how many image tokens one picture is billed as, for the estimate only; the ledger records the real count. */
export function openAiTokenEstimate(model: string, quality: OpenAiQuality, aspect: ImageAspect): number {
  const square = model.startsWith("gpt-image-2") ? { low: 200, medium: 1770, high: 7030 }[quality] : { low: 272, medium: 1056, high: 4160 }[quality];
  if (openAiSize(aspect) === "1024x1024") return square;
  return model.startsWith("gpt-image-2") ? Math.round(square * 0.78) : Math.round(square * 1.5);
}

export class OpenAiImageProvider implements ImageProvider {
  readonly name = "openai";
  readonly model: string;
  readonly quality: OpenAiQuality;
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;

  constructor(apiKey: string, model = defaultOpenAiModel, fetcher: typeof fetch = (input, init) => fetch(input, init), quality: OpenAiQuality = "medium") {
    this.#apiKey = apiKey;
    this.model = model;
    this.#fetch = fetcher;
    this.quality = quality;
  }

  async generate(input: ImageRequest): Promise<ImageResult> {
    const ask = (seeThrough: boolean) =>
      this.#fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.#apiKey}` },
        body: JSON.stringify({
          model: this.model,
          prompt: input.prompt.slice(0, 32_000),
          n: 1,
          size: openAiSize(input.aspect),
          quality: this.quality,
          output_format: "png",
          ...(seeThrough ? { background: "transparent" } : {}),
        }),
        signal: AbortSignal.timeout(180_000),
      });
    let response: Response;
    let body: Record<string, unknown> | null;
    try {
      response = await ask(input.background === "transparent");
      body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      // A model that will not do see-through says so with a 400 naming it: ask again on a plain ground rather than lose the picture.
      const said = (body?.["error"] as { message?: string } | undefined)?.message ?? "";
      if (input.background === "transparent" && response.status === 400 && /background|transparen/i.test(said)) {
        response = await ask(false);
        body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      }
    } catch (error) {
      return { ok: false, code: "art-failed", detail: error instanceof Error ? error.message : "could not reach the picture maker" };
    }
    if (!response.ok || !body) {
      const error = body?.["error"] as { message?: string; code?: string } | undefined;
      const message = error?.message ?? `HTTP ${response.status}`;
      const refused = error?.code === "moderation_blocked" || /safety|moderation|policy/i.test(message);
      return { ok: false, code: refused ? "art-refused" : "art-failed", detail: message, status: response.status };
    }
    const used = body["usage"] as { input_tokens?: number; output_tokens?: number } | undefined;
    const usage: ImageUsage = { model: this.model, inputTokens: used?.input_tokens ?? 0, outputTokens: used?.output_tokens ?? 0 };
    const data = (body["data"] as { b64_json?: string }[] | undefined)?.[0]?.b64_json;
    if (!data) return { ok: false, code: "art-failed", detail: "no picture came back", usage };
    return { ok: true, bytes: base64ToArrayBuffer(data), contentType: "image/png", usage };
  }
}

const practiceSizes: Readonly<Record<ImageAspect, [number, number]>> = {
  "1:1": [1024, 1024],
  "4:3": [1024, 768],
  "3:4": [768, 1024],
  "2:3": [768, 1152],
  "3:2": [1152, 768],
  "16:9": [1280, 720],
  "9:16": [720, 1280],
};

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The SVG a practice picture is drawn from: a coloured card with the picture's name, on clear when see-through was asked for. */
export function practiceSvg(input: ImageRequest): string {
  const [width, height] = practiceSizes[input.aspect];
  const words = (input.label ?? input.prompt).replace(/\s+/g, " ").trim().slice(0, 90);
  let hash = 0;
  for (const char of words) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  const lines = words.match(/.{1,22}(\s|$)/g)?.slice(0, 4) ?? [words];
  const clear = input.background === "transparent";
  const size = Math.round(Math.min(width, height) / 14);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${clear ? "" : `<rect width="100%" height="100%" fill="hsl(${hash},45%,22%)"/>`}
<circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) * 0.38}" fill="hsl(${(hash + 40) % 360},70%,55%)" stroke="white" stroke-width="${size / 3}"/>
${lines.map((line, index) => `<text x="50%" y="${height / 2 + (index - (lines.length - 1) / 2) * size * 1.2}" font-family="sans-serif" font-size="${size}" font-weight="700" fill="white" text-anchor="middle" dominant-baseline="middle">${escapeXml(line.trim())}</text>`).join("\n")}
<text x="50%" y="${height - size}" font-family="sans-serif" font-size="${Math.round(size * 0.6)}" fill="white" text-anchor="middle">PRACTICE PICTURE</text>
</svg>`;
}

/** Free placeholder pictures, drawn locally with `sharp`. Lets the whole flow be rehearsed with no key and no bill. */
export class PracticeImageProvider implements ImageProvider {
  readonly name = "practice";
  readonly model = "practice-placeholder";
  async generate(input: ImageRequest): Promise<ImageResult> {
    if (/\bpractice-refuse\b/i.test(input.prompt)) return { ok: false, code: "art-refused", detail: "practice refusal (the words said practice-refuse)" };
    const sharp = (await import("sharp")).default;
    const png = await sharp(Buffer.from(practiceSvg(input))).png().toBuffer();
    return { ok: true, bytes: png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer, contentType: "image/png", usage: { model: this.model, inputTokens: 0, outputTokens: 0 } };
  }
}

/** What a picture refused by "stop at zero" says. The factory reads the 402 and pauses rather than failing the picture. */
export function creditStopped(provider: string): string {
  return `Stopped: the estimated ${provider === "openai" ? "OpenAI" : "Google"} credit is used up and "stop at zero" is on. Top up, record it in the credit box, then carry on.`;
}

/** Wraps a provider so every call lands in the usage ledger, priced, with what it was for. Never lets a broken counter cost a picture. */
export function meteredImageProvider(provider: ImageProvider, meter: UsageMeter | undefined, purpose: string, tag?: string): ImageProvider {
  if (!meter || (provider.name !== "google" && provider.name !== "openai")) return provider;
  const billed = provider.name as "google" | "openai";
  return {
    name: provider.name,
    ...(provider.model ? { model: provider.model } : {}),
    async generate(input) {
      const stopped = await Promise.resolve(meter.shouldSkip?.(billed)).catch(() => false);
      if (stopped) return { ok: false, code: "art-failed", status: 402, detail: creditStopped(provider.name) };
      const result = await provider.generate(input);
      const usage = result.usage ?? { model: provider.model ?? provider.name, inputTokens: 0, outputTokens: 0 };
      try {
        await meter.record({
          provider: billed,
          model: provider.model ?? usage.model,
          ...(usage.model !== provider.model ? { resolvedModel: usage.model } : {}),
          billedTo: "site",
          ok: result.ok,
          ...(result.ok ? {} : { failure: classifyFailure(result.status, result.detail), detail: result.detail }),
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          purpose,
          ...(tag ? { tag } : {}),
        });
      } catch {
        // Counting must never cost a picture.
      }
      return result;
    },
  };
}
