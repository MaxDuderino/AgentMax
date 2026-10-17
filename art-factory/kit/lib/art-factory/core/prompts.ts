import type { ArtAspect, FactoryGroup, FactoryImage, FactoryOutput } from "./types";

/**
 * The words side of the factory (ported from DnD-Max's `domain/art/factory.ts`):
 * style blocks, see-through detection, cutting a batch prompt into single
 * pictures, sizes and file-safe names.
 *
 * Pure: no provider, no store, no network.
 */

/** The group's style: the admin's edit if there is one, else the catalogue's default. */
export function styleFor(group: Pick<FactoryGroup, "id" | "style"> | string, overrides: Readonly<Record<string, string>> = {}, defaults: Readonly<Record<string, string>> = {}): string {
  const id = typeof group === "string" ? group : group.id;
  const fallback = typeof group === "string" ? defaults[id] : (group.style ?? defaults[id]);
  return (overrides[id] ?? fallback ?? "").trim();
}

/** What is actually sent: the group's style, then the picture's own (or edited) words. At most 6,000 characters. */
export function factoryPrompt(style: string, image: Pick<FactoryImage, "prompt">, edited?: string): string {
  const body = (edited ?? image.prompt).trim();
  const head = style.trim();
  return (head ? `${head}\n\n${body}` : body).slice(0, 6000);
}

/**
 * Whether a picture should be drawn on a see-through ground. In DnD-Max 70 of
 * 102 art jobs wanted one (tokens, icons, dice, objects).
 *
 * "No transparency" anywhere wins, then any mention of a transparent ground or
 * an alpha channel, then a cut that keeps the silhouette whole (`contain`).
 */
export function wantsSeeThrough(words: string, outputs: readonly Pick<FactoryOutput, "fit">[] = []): boolean {
  if (/\b(no|not|never|without)\s+(any\s+)?(transparen|alpha)|\bopaque\b/i.test(words)) return false;
  if (/transparen|\balpha\b/i.test(words)) return true;
  return outputs.some((one) => one.fit === "contain");
}

/** Pulls the numbered list out of a batch prompt. A blank line followed by prose ends the list. */
export function splitBatch(prompt: string): { head: string; items: string[]; tail: string } {
  const lines = prompt.split(/\r?\n/);
  const numbered = /^\s*\d+[.)]\s/;
  const first = lines.findIndex((line) => numbered.test(line));
  if (first === -1) return { head: prompt, items: [], tail: "" };
  const items: string[] = [];
  let current: string[] = [];
  let blankBefore = false;
  let at = first;
  for (; at < lines.length; at += 1) {
    const line = lines[at]!;
    if (numbered.test(line)) {
      if (current.length > 0) items.push(current.join("\n"));
      current = [line];
      blankBefore = false;
      continue;
    }
    if (line.trim().length === 0) {
      blankBefore = true;
      continue;
    }
    if (blankBefore) break;
    current.push(line);
  }
  if (current.length > 0) items.push(current.join("\n"));
  return { head: lines.slice(0, first).join("\n").trim(), items, tail: lines.slice(at).join("\n").trim() };
}

export const itemBody = (item: string) => item.replace(/^\s*\d+[.)]\s*/, "").trim();

/** One picture's prompt from a batch: intro, the one item, the batch's rules, and a line saying only one is wanted. */
export function singlePrompt(head: string, item: string, tail: string, number: number, of: number): string {
  return [
    head,
    `Draw ONE picture only — number ${number} of ${of} in the set:\n\n${itemBody(item)}`,
    tail ? `The set's rules (written for the whole batch; apply them to this one picture, and make a single image, not a grid or a sheet):\n\n${tail}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

/** A file-safe slug from the opening words of a description. */
export function slugOf(text: string, words = 5): string {
  const head = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .split(/[:;.,—–(]/)[0]!
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !/^[0-9]+$/.test(word) && word !== "x");
  const noise = new Set(["a", "an", "the", "of", "in", "on", "with", "and", "one", "its", "their", "his", "her"]);
  while (head.length > 0 && noise.has(head[0]!)) head.shift();
  const kept = head.slice(0, words);
  while (kept.length > 1 && noise.has(kept[kept.length - 1]!)) kept.pop();
  return kept.join("-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "") || "picture";
}

/** The aspect a picture maker is asked for, nearest to the size wanted. */
export function aspectForSize(width: number, height: number): ArtAspect {
  const ratio = width / height;
  const options: [ArtAspect, number][] = [
    ["1:1", 1],
    ["4:3", 4 / 3],
    ["3:4", 3 / 4],
    ["2:3", 2 / 3],
    ["3:2", 3 / 2],
    ["16:9", 16 / 9],
    ["9:16", 9 / 16],
  ];
  return options.reduce((best, one) => (Math.abs(Math.log(one[1] / ratio)) < Math.abs(Math.log(best[1] / ratio)) ? one : best))[0];
}

/** No output bigger than the longest side a picture maker draws. */
export function capped(size: { width: number; height: number }, longest = 2048) {
  const scale = Math.min(1, longest / Math.max(size.width, size.height));
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
}
