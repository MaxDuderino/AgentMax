/**
 * Make art where you are building (ported from DnD-Max, Issue 324): the
 * words sent to a picture maker, pre-filled from what the screen already
 * knows, then edited by the person before anything is sent.
 *
 * The style blocks are per **kind**. These defaults are deliberately plain;
 * a project sets its own in `art-factory.config.ts` (Asset Forge writes them
 * from the style bible).
 *
 * Pure: no provider, no key, no network.
 */
import type { ArtAspect } from "./types";

export interface MakeArtSubject {
  /** One of the project's kinds: `scene`, `character`, `item`, `icon`, `background`, … */
  kind: string;
  /** The thing's own name. */
  name: string;
  /** A description, read-aloud text, a pitch: whatever the screen has. */
  text?: string;
  /** A few words of mood ("cosy", "eerie"). */
  tone?: string;
  /** Genre or setting ("sci-fi", "western"). */
  genre?: string;
}

export interface MakeArtKind {
  label: string;
  aspect: ArtAspect;
  style: string;
  seeThrough?: boolean;
}

export const defaultMakeArtKinds: Readonly<Record<string, MakeArtKind>> = {
  scene: {
    label: "Scene",
    aspect: "4:3",
    style: "A single image: one place or moment, painted, rich light and colour, filling the frame edge to edge. No text, no border.",
  },
  character: {
    label: "Character",
    aspect: "3:4",
    style: "A single image: a painted portrait of one character, facing roughly toward the viewer, soft background, warm directional light. No text, no frame.",
  },
  item: {
    label: "Item",
    aspect: "1:1",
    style: "A single image: one object, centred, the whole silhouette inside the frame, on a fully transparent background. Painted, crisp edges, no text.",
    seeThrough: true,
  },
  icon: {
    label: "Icon",
    aspect: "1:1",
    style: "A single image: one bold, simple symbol, centred, readable at 32 pixels, on a fully transparent background. No text.",
    seeThrough: true,
  },
  background: {
    label: "Background",
    aspect: "16:9",
    style: "A single image: a wide background with nothing important at the edges and calm space in the middle for interface on top. No text, no people.",
  },
};

const clean = (value: string | undefined, max: number) => (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** The pre-filled prompt. Editable before sending; never sent without being shown. */
export function makeArtPrompt(subject: MakeArtSubject, kinds: Readonly<Record<string, MakeArtKind>> = defaultMakeArtKinds): string {
  const kind = kinds[subject.kind];
  const name = clean(subject.name, 80) || "an unnamed thing";
  const text = clean(subject.text, 600);
  const tone = clean(subject.tone, 40);
  const genre = clean(subject.genre, 40);
  const what = kind ? `${kind.label}: ${name}.` : `${name}.`;
  const setting = [genre ? `Setting: ${genre}.` : "", tone ? `Mood: ${tone}.` : ""].filter(Boolean).join(" ");
  return [what, text, setting, kind?.style ?? ""].filter(Boolean).join("\n\n");
}

/** What may be sent: trimmed, non-empty, bounded. */
export function readMakeArtPrompt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const prompt = value.trim().slice(0, 4000);
  return prompt.length >= 3 ? prompt : null;
}

export interface MakeArtAllowance {
  allowed: boolean;
  /** `null` when there is no limit (an admin, or the cap switched off). */
  remaining: number | null;
}

/** `cap: null` means no daily limit. Admins are never limited. */
export function makeArtAllowance(input: { usedToday: number; cap: number | null; unlimited?: boolean }): MakeArtAllowance {
  if (input.cap === null || input.unlimited) return { allowed: true, remaining: null };
  const remaining = Math.max(0, input.cap - input.usedToday);
  return { allowed: remaining > 0, remaining };
}
