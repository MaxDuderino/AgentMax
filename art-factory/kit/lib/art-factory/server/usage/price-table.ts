/**
 * What each AI model costs, per million tokens, in US dollars (ported from
 * DnD-Max, Issue 401).
 *
 * **Every number here is an estimate input, and dated.** Providers change
 * prices without telling the app, so the usage panel labels every dollar it
 * works out as "about", and the admin can override any model's price from
 * the panel without a deploy.
 *
 * Checked 2026-10-13 against Anthropic's and Google's pricing pages; the
 * OpenAI image rows on 2026-10-16 from third-party pages (OpenAI's own page
 * was not read). Override on the panel if a console says otherwise.
 *
 * Matching is by longest prefix, so `claude-opus-5-5` finds its own row
 * rather than `claude-opus-5`'s. Rows with `from` only apply on and after
 * that day (Google's announced 2027 Flash price rise is written once here).
 */
export type UsageProvider = "anthropic" | "google" | "openai" | "elevenlabs";

export const usageProviders: readonly UsageProvider[] = ["openai", "google", "anthropic", "elevenlabs"];

export const providerNames: Readonly<Record<UsageProvider, string>> = {
  openai: "OpenAI",
  google: "Google Gemini",
  anthropic: "Claude",
  elevenlabs: "ElevenLabs",
};

export interface ModelPrice {
  /** Dollars per million input tokens. */
  inputPerMillion: number;
  /** Dollars per million output tokens (thinking included, for Gemini). */
  outputPerMillion: number;
}

interface PriceRow extends ModelPrice {
  provider: UsageProvider;
  prefix: string;
  /** First UTC day (YYYY-MM-DD) the row applies. Absent means always. */
  from?: string;
}

export const pricesCheckedOn = "2026-10-16";

const rows: readonly PriceRow[] = [
  // Anthropic: standard rates, prompts under 100k tokens.
  { provider: "anthropic", prefix: "claude-haiku-5-5", inputPerMillion: 0.1, outputPerMillion: 0.5 },
  { provider: "anthropic", prefix: "claude-haiku-4-5", inputPerMillion: 1, outputPerMillion: 5 },
  { provider: "anthropic", prefix: "claude-sonnet-5-5", inputPerMillion: 2, outputPerMillion: 10 },
  { provider: "anthropic", prefix: "claude-sonnet-5", inputPerMillion: 2, outputPerMillion: 10 },
  { provider: "anthropic", prefix: "claude-sonnet-4", inputPerMillion: 3, outputPerMillion: 15 },
  { provider: "anthropic", prefix: "claude-opus-5-5", inputPerMillion: 4, outputPerMillion: 20 },
  { provider: "anthropic", prefix: "claude-opus-5", inputPerMillion: 5, outputPerMillion: 25 },
  { provider: "anthropic", prefix: "claude-opus-4", inputPerMillion: 5, outputPerMillion: 25 },
  { provider: "anthropic", prefix: "claude-fable-5", inputPerMillion: 10, outputPerMillion: 50 },

  // Google: paid tier, text.
  { provider: "google", prefix: "gemini-3.1-flash-lite", inputPerMillion: 0.25, outputPerMillion: 1.5 },
  { provider: "google", prefix: "gemini-3.5-flash-lite", inputPerMillion: 0.3, outputPerMillion: 2.5 },
  { provider: "google", prefix: "gemini-3-flash", inputPerMillion: 0.5, outputPerMillion: 3 },
  { provider: "google", prefix: "gemini-3.6-flash", inputPerMillion: 0.75, outputPerMillion: 3.75 },
  { provider: "google", prefix: "gemini-3.6-flash", inputPerMillion: 1.5, outputPerMillion: 7.5, from: "2027-01-01" },
  { provider: "google", prefix: "gemini-3.8-flash", inputPerMillion: 0.75, outputPerMillion: 3.75 },
  { provider: "google", prefix: "gemini-3.8-flash", inputPerMillion: 1.5, outputPerMillion: 7.5, from: "2027-01-01" },
  // `-latest` aliases are priced as the newest model of that kind: an estimate that runs high warns early.
  { provider: "google", prefix: "gemini-flash-lite-latest", inputPerMillion: 0.3, outputPerMillion: 2.5 },
  { provider: "google", prefix: "gemini-flash-latest", inputPerMillion: 0.75, outputPerMillion: 3.75 },
  { provider: "google", prefix: "gemini-flash-latest", inputPerMillion: 1.5, outputPerMillion: 7.5, from: "2027-01-01" },

  /*
     Pictures. Image models bill the picture as output tokens: Gemini 2.5
     Flash Image counts a picture up to 1024px as 1,290 tokens at $30 a
     million (about $0.039). gpt-image-1 bills $40 a million; a medium 1024²
     is about 1,056 tokens (about $0.04).
  */
  { provider: "google", prefix: "gemini-2.5-flash-image", inputPerMillion: 0.3, outputPerMillion: 30 },
  { provider: "google", prefix: "gemini-3-pro-image", inputPerMillion: 2, outputPerMillion: 120 },
  { provider: "openai", prefix: "gpt-image-1-mini", inputPerMillion: 2, outputPerMillion: 8 },
  { provider: "openai", prefix: "gpt-image-1", inputPerMillion: 5, outputPerMillion: 40 },
  { provider: "openai", prefix: "gpt-image-1.5", inputPerMillion: 5, outputPerMillion: 32 },
  { provider: "openai", prefix: "gpt-image-2", inputPerMillion: 5, outputPerMillion: 30 },

  // Voices: Gemini TTS bills text in and audio out; the 3.8 models double on 2027-01-01.
  { provider: "google", prefix: "gemini-3.8-flash-tts", inputPerMillion: 0.5, outputPerMillion: 9 },
  { provider: "google", prefix: "gemini-3.8-flash-tts", inputPerMillion: 1, outputPerMillion: 18, from: "2027-01-01" },
  { provider: "google", prefix: "gemini-3.8-flash-lite-tts", inputPerMillion: 0.5, outputPerMillion: 6 },
  { provider: "google", prefix: "gemini-3.8-flash-lite-tts", inputPerMillion: 1, outputPerMillion: 12, from: "2027-01-01" },
  // Billed by the character: the recorder counts characters as input tokens, priced per million characters.
  { provider: "google", prefix: "chirp3-hd", inputPerMillion: 30, outputPerMillion: 0 },
  { provider: "elevenlabs", prefix: "eleven_multilingual", inputPerMillion: 300, outputPerMillion: 0 },
  { provider: "elevenlabs", prefix: "eleven_flash", inputPerMillion: 150, outputPerMillion: 0 },
  { provider: "elevenlabs", prefix: "eleven_turbo", inputPerMillion: 150, outputPerMillion: 0 },
  { provider: "elevenlabs", prefix: "eleven_v3", inputPerMillion: 300, outputPerMillion: 0 },
];

/** Admin-entered prices, by exact model id. They win over the table above. */
export type PriceOverrides = Readonly<Record<string, ModelPrice>>;

/** The price for one model on one day, or `null`: an unpriced model is counted in tokens and flagged, never guessed at. */
export function priceFor(provider: UsageProvider, model: string, day: string, overrides: PriceOverrides = {}): ModelPrice | null {
  const override = overrides[model];
  if (override) return override;
  let best: PriceRow | null = null;
  for (const row of rows) {
    if (row.provider !== provider || !model.startsWith(row.prefix)) continue;
    if (row.from && row.from > day) continue;
    if (!best || row.prefix.length > best.prefix.length || (row.prefix.length === best.prefix.length && (row.from ?? "") > (best.from ?? ""))) best = row;
  }
  return best ? { inputPerMillion: best.inputPerMillion, outputPerMillion: best.outputPerMillion } : null;
}

/** Cost in micro-dollars (millionths of a dollar), so counters stay integers. */
export function costMicros(price: ModelPrice, inputTokens: number, outputTokens: number): number {
  return Math.round(price.inputPerMillion * inputTokens + price.outputPerMillion * outputTokens);
}

export function isUsageProvider(value: unknown): value is UsageProvider {
  return usageProviders.includes(value as UsageProvider);
}
