import { kindNames, type ContentKind, type SoundFormat } from "../core/types";
import { PracticeImageProvider, type ImageAspect, type ImageProvider } from "./image-provider";
import { providerName, type CountedUnit } from "./usage/price-table";
import { classifyFailure, type UsageMeter } from "./usage/usage-event";

/**
 * The one door every maker comes through (2026-10-17): pictures, voice lines,
 * sound effects and music.
 *
 * A **maker** says which kinds it can make and answers `make`. The factory
 * asks for a maker by kind, so a new provider (a voice company, a music
 * model) is a new object handed to the config's `makers`, never a change to
 * the queue, the review tray or approval.
 *
 * The picture makers the kit already had (OpenAI, Google, Practice) keep
 * their own `generate` and come through here unchanged with
 * {@link imageMaker}. **Practice** makes every kind for free: placeholder
 * pictures and placeholder beeps, so a whole studio can be rehearsed before a
 * cent is spent.
 */
export interface MakeRequest {
  kind: ContentKind;
  /** The words: a picture's prompt, the line a voice reads, what an effect or a piece of music should sound like. */
  prompt: string;
  /** The group's style block on its own, for makers that take direction apart from the words (voices). */
  style?: string;
  /** A short label, for placeholders and logs. */
  label?: string;
  // Pictures
  aspect?: ImageAspect;
  background?: "transparent";
  // Sounds
  format?: SoundFormat;
  seconds?: number;
  loop?: boolean;
  voice?: string;
}

/** What a call used, so the usage ledger can price it: tokens, or another unit (characters read, seconds made, pictures). */
export interface MakerUsage {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  unit?: CountedUnit;
  quantity?: number;
}

export type MakeResult =
  | { ok: true; bytes: ArrayBuffer; contentType: string; usage?: MakerUsage }
  | { ok: false; code: "art-refused" | "art-failed"; detail: string; status?: number; usage?: MakerUsage };

export interface Maker {
  /** The provider's id, as the usage ledger records it (`openai`, `elevenlabs`, `suno`, `practice`). */
  readonly name: string;
  readonly model?: string;
  /** What it can make. The factory never asks it for anything else. */
  readonly kinds: readonly ContentKind[];
  make(input: MakeRequest): Promise<MakeResult>;
}

/** A picture provider as a maker. It draws exactly as before; only the door is new. */
export function imageMaker(provider: ImageProvider): Maker {
  return {
    name: provider.name,
    ...(provider.model ? { model: provider.model } : {}),
    kinds: ["image"],
    async make(input) {
      if (input.kind !== "image") return { ok: false, code: "art-failed", detail: `${providerName(provider.name)} makes pictures, not ${kindNames[input.kind].many}.` };
      return provider.generate({ prompt: input.prompt, aspect: input.aspect ?? "1:1", ...(input.label ? { label: input.label } : {}), ...(input.background ? { background: input.background } : {}) });
    },
  };
}

/** How long a practice sound lasts when the catalogue does not say. */
function practiceSeconds(input: MakeRequest): number {
  if (input.seconds) return Math.min(8, Math.max(0.3, input.seconds));
  if (input.kind === "voice") return Math.min(6, Math.max(1, input.prompt.split(/\s+/).length * 0.3));
  return input.kind === "music" ? 6 : 1.2;
}

/**
 * A placeholder sound as a WAV file: a tone whose pitch comes from the words,
 * a warble for a voice, a falling blip for an effect, a little tune for music.
 * Plain arithmetic, no library, so it runs anywhere.
 */
export function practiceWav(input: MakeRequest, rate = 22_050): ArrayBuffer {
  const seconds = practiceSeconds(input);
  const samples = Math.round(seconds * rate);
  let hash = 0;
  for (const char of input.prompt) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  const base = 220 + (hash % 220);
  const tune = [0, 4, 7, 12, 7, 4];
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const text = (at: number, value: string) => [...value].forEach((char, index) => view.setUint8(at + index, char.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  let phase = 0;
  for (let i = 0; i < samples; i += 1) {
    const t = i / rate;
    const left = seconds - t;
    let frequency = base;
    if (input.kind === "voice") frequency = base * (1 + 0.08 * Math.sin(2 * Math.PI * 5 * t));
    else if (input.kind === "sfx") frequency = base * 2 * (1 - (0.6 * t) / seconds);
    else if (input.kind === "music") frequency = base * 2 ** (tune[Math.floor(t * 2) % tune.length]! / 12);
    phase += (2 * Math.PI * frequency) / rate;
    // Soft start and end so a placeholder never clicks; a loop fades less so it can repeat.
    const fade = Math.min(1, t / 0.02, left / (input.loop ? 0.02 : 0.15));
    view.setInt16(44 + i * 2, Math.round(Math.sin(phase) * 0.3 * fade * 32_767), true);
  }
  return buffer;
}

/** Free placeholders of every kind. Never metered, never billed. */
export function practiceMaker(): Maker {
  const pictures = new PracticeImageProvider();
  return {
    name: "practice",
    model: "practice-placeholder",
    kinds: ["image", "voice", "sfx", "music"],
    async make(input) {
      if (input.kind === "image") return imageMaker(pictures).make(input);
      if (/\bpractice-refuse\b/i.test(input.prompt)) return { ok: false, code: "art-refused", detail: "practice refusal (the words said practice-refuse)" };
      return { ok: true, bytes: practiceWav(input), contentType: "audio/wav", usage: { model: "practice-placeholder", unit: "seconds", quantity: practiceSeconds(input) } };
    },
  };
}

/** What a call refused by "stop at zero" says. The factory reads the 402 and pauses rather than failing the item. */
export function creditStoppedFor(provider: string): string {
  return `Stopped: the estimated ${providerName(provider)} credit is used up and "stop at zero" is on. Top up, record it in the credit box, then carry on.`;
}

/**
 * Wraps a maker so every call lands in the usage ledger, priced, in its own
 * unit, with what it was for; and so "stop at zero" stops it. Practice is never
 * metered. Never lets a broken counter cost a picture or a line.
 */
export function meteredMaker(maker: Maker, meter: UsageMeter | undefined, purpose: string, tag?: string): Maker {
  if (!meter || maker.name === "practice") return maker;
  return {
    name: maker.name,
    ...(maker.model ? { model: maker.model } : {}),
    kinds: maker.kinds,
    async make(input) {
      const stopped = await Promise.resolve(meter.shouldSkip?.(maker.name)).catch(() => false);
      if (stopped) return { ok: false, code: "art-failed", status: 402, detail: creditStoppedFor(maker.name) };
      const result = await maker.make(input);
      const usage = result.usage ?? { model: maker.model ?? maker.name };
      try {
        await meter.record({
          provider: maker.name,
          model: maker.model ?? usage.model,
          ...(usage.model !== maker.model ? { resolvedModel: usage.model } : {}),
          billedTo: "site",
          ok: result.ok,
          ...(result.ok ? {} : { failure: classifyFailure(result.status, result.detail), detail: result.detail }),
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          ...(usage.unit && usage.quantity ? { unit: usage.unit, quantity: usage.quantity } : {}),
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

/** The file extension for what a maker handed back. */
export function extensionFor(contentType: string, fallback = "bin"): string {
  const type = contentType.toLowerCase();
  if (type.includes("webp")) return "webp";
  if (type.includes("png")) return "png";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  if (type.includes("wav")) return "wav";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  return fallback;
}

/** The content type for a stored file, from its name. */
export function contentTypeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return (
    { webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg" } as Record<string, string>
  )[ext] ?? "application/octet-stream";
}
