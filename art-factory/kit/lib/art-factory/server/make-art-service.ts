import { makeArtAllowance, readMakeArtPrompt, type MakeArtKind } from "../core/make-art-prompt";
import type { ArtStore } from "./art-store";
import type { ImageProvider } from "./image-provider";
import type { Kv } from "./kv";
import type { ImageConverter } from "./webp";

/**
 * The Make art buttons' server side (ported from DnD-Max, Issue 324):
 * someone building a level, a card or a character presses ✨ Make art, edits
 * the pre-filled words, and gets a picture back where they are.
 *
 * The order is the point:
 * 1. **Who.** The project's `whoIs` (its own accounts), or the admin. Nobody
 *    else, unless the project says so: pictures cost money.
 * 2. **The daily cap is checked before anything is drawn**, and counted only
 *    after the picture is stored, so a refusal or a failure costs nothing.
 *    Admins are never capped. The cap is set on the switcher.
 * 3. **Made small:** WebP, at most 1536px.
 * 4. **Labelled** with the words, the provider and who made it, and counted
 *    in AI usage as `make-art`.
 */
export type MakeArtFailure = "not-allowed" | "invalid-prompt" | "unknown-kind" | "art-provider-off" | "art-cap-reached" | "art-refused" | "art-failed" | "store-failed";

export type MakeArtResult = { ok: true; key: string; url: string; remaining: number | null } | { ok: false; code: MakeArtFailure; message: string };

export const makeArtSentences: Readonly<Record<MakeArtFailure, string>> = {
  "not-allowed": "Making pictures is for signed-in builders on this site.",
  "invalid-prompt": "Say what the picture should show, in a few words at least.",
  "unknown-kind": "That kind of picture is not one this site makes.",
  "art-provider-off": "Making pictures is not switched on for this site yet.",
  "art-cap-reached": "You have made all the pictures this site pays for today. Try again tomorrow.",
  "art-refused": "The picture maker would not draw that. Change the description and try again.",
  "art-failed": "The picture maker did not answer properly. Nothing was used up; try again in a minute.",
  "store-failed": "The picture was drawn but could not be saved. Nothing was counted; try again in a minute.",
};

export interface MakeArtLabel {
  prompt: string;
  kind: string;
  provider: string;
  model?: string;
  by: string;
  at: string;
  provenance: "ai-generated";
}

export interface MakeArtDeps {
  kv: Kv;
  prefix: string;
  art: ArtStore;
  kinds: Readonly<Record<string, MakeArtKind>>;
  /** The site's picture maker, metered as `make-art`, for this person; `null` when none is on. */
  provider: (who: string) => Promise<ImageProvider | null>;
  cap: () => Promise<number | null>;
  convert?: ImageConverter;
  now?: () => Date;
  makeId?: () => string;
}

const countKey = (prefix: string, who: string, day: string) => `${prefix}:make-art:count:${who}:${day}`;
const safe = (who: string) => who.replace(/[^a-z0-9-]+/gi, "-").slice(0, 60) || "someone";

export async function usedToday(deps: Pick<MakeArtDeps, "kv" | "prefix" | "now">, who: string): Promise<number> {
  const day = (deps.now?.() ?? new Date()).toISOString().slice(0, 10);
  return Number((await deps.kv.get(countKey(deps.prefix, who, day))) ?? 0);
}

export async function makeArt(deps: MakeArtDeps, input: { who: string | null; admin: boolean; prompt: unknown; kind: unknown }): Promise<MakeArtResult> {
  const fail = (code: MakeArtFailure): MakeArtResult => ({ ok: false, code, message: makeArtSentences[code] });
  const who = input.who ?? (input.admin ? "admin" : null);
  if (!who) return fail("not-allowed");
  const prompt = readMakeArtPrompt(input.prompt);
  if (!prompt) return fail("invalid-prompt");
  const kind = typeof input.kind === "string" ? deps.kinds[input.kind] : undefined;
  if (!kind) return fail("unknown-kind");

  const now = deps.now?.() ?? new Date();
  const day = now.toISOString().slice(0, 10);
  const cap = await deps.cap();
  const allowance = makeArtAllowance({ usedToday: await usedToday(deps, who), cap, unlimited: input.admin });
  if (!allowance.allowed) return fail("art-cap-reached");

  const provider = await deps.provider(who);
  if (!provider) return fail("art-provider-off");
  const drawn = await provider.generate({ prompt, aspect: kind.aspect, label: prompt.split(/[.\n]/)[0]!.slice(0, 60), ...(kind.seeThrough ? { background: "transparent" as const } : {}) });
  if (!drawn.ok) return fail(drawn.code);

  let bytes = drawn.bytes;
  let type = drawn.contentType;
  if (deps.convert) {
    try {
      const small = await deps.convert(bytes);
      bytes = small.bytes;
      type = small.contentType;
    } catch {
      // A picture that will not convert is still a picture; stored as it came.
    }
  }
  const id = deps.makeId?.() ?? `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const key = `made/${safe(who)}/${day}-${id}.${type === "image/webp" ? "webp" : "png"}`;
  let url: string;
  try {
    url = (await deps.art.put(key, bytes, type)).url;
  } catch (error) {
    console.error("[art-factory] Make art could not store a picture", error);
    return fail("store-failed");
  }

  const label: MakeArtLabel = { prompt, kind: String(input.kind), provider: provider.name, ...(provider.model ? { model: provider.model } : {}), by: who, at: now.toISOString(), provenance: "ai-generated" };
  await deps.kv.hset(`${deps.prefix}:make-art:labels`, { [key]: JSON.stringify(label) });
  const counted = await deps.kv.incr(countKey(deps.prefix, who, day));
  if (counted === 1) await deps.kv.expire(countKey(deps.prefix, who, day), 60 * 60 * 48);
  const remaining = input.admin || cap === null ? null : Math.max(0, cap - counted);
  return { ok: true, key, url, remaining };
}
