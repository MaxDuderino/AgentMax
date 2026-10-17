import { parseJson, type Env, type Kv } from "./kv";
import {
  defaultGoogleModel,
  defaultOpenAiModel,
  GoogleImageProvider,
  imageProviderLabels,
  imageProviderNames,
  OpenAiImageProvider,
  openAiModels,
  openAiQualities,
  PracticeImageProvider,
  type ImageProvider,
  type ImageProviderName,
  type OpenAiQuality,
} from "./image-provider";

/**
 * Which picture maker the site uses, and the one-click switcher's settings
 * (ported from DnD-Max).
 *
 * Each real provider is switched on by its own key in the environment and
 * nothing else; the switcher chooses between the ones that are on. A choice
 * whose key has since been removed falls back to one that works rather than
 * switching pictures off. **Practice** is always there but never chosen for
 * you: approving a practice placeholder puts it live, so it is only used when
 * the admin picks it.
 *
 * Key names match in any letter case: in DnD-Max the key went in as
 * `GPT_ImageGEN`, and one capital letter should not switch pictures off.
 */
export const defaultKeyNames: Readonly<Record<"openai" | "google", readonly string[]>> = {
  openai: ["OPENAI_API_KEY_ImageGen", "GPT_ImageGen", "OPENAI_API_KEY"],
  google: ["GOOGLE_API_KEY_ImageGen", "GEMINI_API_KEY", "GOOGLE_API_KEY"],
};

export interface ProviderStatus {
  name: ImageProviderName;
  label: string;
  configured: boolean;
  /** Which env var the key was found in (never the key). */
  keyFrom: string | null;
  model: string;
}

export interface ArtSettings {
  /** Make art pictures per person per day on the site's key; `null` is no limit. Admins are never limited. */
  dailyCap: number | null;
  provider?: ImageProviderName;
  openaiModel?: string;
  openaiQuality?: OpenAiQuality;
}

export const defaultDailyCap = 5;

export function siteKeyFor(name: "openai" | "google", env: Env, keyNames = defaultKeyNames): { key: string; from: string } | null {
  const present = Object.keys(env);
  for (const variable of keyNames[name]) {
    const wanted = variable.toLowerCase();
    for (const actual of present.filter((one) => one.toLowerCase() === wanted)) {
      const key = env[actual]?.trim();
      if (key) return { key, from: actual };
    }
  }
  return null;
}

export function modelFor(name: ImageProviderName, env: Env, settings: Pick<ArtSettings, "openaiModel"> = {}): string {
  if (name === "openai") return settings.openaiModel || env.ART_OPENAI_MODEL || defaultOpenAiModel;
  if (name === "google") return env.ART_GOOGLE_MODEL || env.ART_MODEL || defaultGoogleModel;
  return "practice-placeholder";
}

export const qualityFor = (settings: Pick<ArtSettings, "openaiQuality"> = {}): OpenAiQuality => settings.openaiQuality ?? "medium";

export const readProviderName = (value: unknown): ImageProviderName | undefined => (imageProviderNames.includes(value as ImageProviderName) ? (value as ImageProviderName) : undefined);
export const readOpenAiModel = (value: unknown): string | undefined => (openAiModels.some((one) => one.id === value) ? (value as string) : undefined);
export const readOpenAiQuality = (value: unknown): OpenAiQuality | undefined => (openAiQualities.includes(value as OpenAiQuality) ? (value as OpenAiQuality) : undefined);

export function readDailyCap(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10_000) return value;
  return undefined;
}

export function providerStatuses(env: Env, settings: ArtSettings = { dailyCap: null }, options: { practice?: boolean; keyNames?: typeof defaultKeyNames } = {}): ProviderStatus[] {
  return imageProviderNames
    .filter((name) => name !== "practice" || options.practice !== false)
    .map((name) => {
      const found = name === "practice" ? { from: "built in" } : siteKeyFor(name, env, options.keyNames);
      return { name, label: imageProviderLabels[name], configured: found !== null, keyFrom: found?.from ?? null, model: modelFor(name, env, settings) };
    });
}

/** The chosen provider if it can draw, else the first real one with a key, else none. */
export function activeProvider(env: Env, chosen: ImageProviderName | undefined, options: { practice?: boolean; keyNames?: typeof defaultKeyNames } = {}): { name: ImageProviderName; key: string | null; from: string } | null {
  if (chosen === "practice" && options.practice !== false) return { name: "practice", key: null, from: "built in" };
  const order: ("openai" | "google")[] = chosen === "google" ? ["google", "openai"] : ["openai", "google"];
  for (const name of order) {
    const found = siteKeyFor(name, env, options.keyNames);
    if (found) return { name, ...found };
  }
  return null;
}

export function buildProvider(active: { name: ImageProviderName; key: string | null }, env: Env, settings: ArtSettings): ImageProvider {
  if (active.name === "openai") return new OpenAiImageProvider(active.key ?? "", modelFor("openai", env, settings), undefined, qualityFor(settings));
  if (active.name === "google") return new GoogleImageProvider(active.key ?? "", modelFor("google", env));
  return new PracticeImageProvider();
}

/** The switcher's choices and Make art's daily cap. In Redis, so changing them needs no redeploy. */
export class ArtSettingsStore {
  readonly #kv: Kv;
  readonly #key: string;
  readonly #fallbackCap: number | null;

  constructor(kv: Kv, prefix: string, env: Env = {}) {
    this.#kv = kv;
    this.#key = `${prefix}:art-settings`;
    const value = env.ART_DAILY_CAP === undefined ? NaN : Number(env.ART_DAILY_CAP);
    this.#fallbackCap = Number.isFinite(value) && value >= 0 ? value : defaultDailyCap;
  }

  async read(): Promise<ArtSettings> {
    const stored = parseJson<ArtSettings>(await this.#kv.get(this.#key));
    if (!stored || readDailyCap(stored.dailyCap) === undefined) return { dailyCap: this.#fallbackCap };
    const provider = readProviderName(stored.provider);
    const openaiModel = readOpenAiModel(stored.openaiModel);
    const openaiQuality = readOpenAiQuality(stored.openaiQuality);
    return { dailyCap: stored.dailyCap, ...(provider ? { provider } : {}), ...(openaiModel ? { openaiModel } : {}), ...(openaiQuality ? { openaiQuality } : {}) };
  }

  async write(settings: ArtSettings): Promise<void> {
    await this.#kv.set(this.#key, JSON.stringify(settings));
  }
}
