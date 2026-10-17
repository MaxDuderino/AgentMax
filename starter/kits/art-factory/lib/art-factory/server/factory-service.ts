import { factoryPrompt, styleFor, wantsSeeThrough } from "../core/prompts";
import type { ArtCatalogue, IndexedCatalogue } from "../core/types";
import type { ArtStore } from "./art-store";
import type { FactoryEntry, FactoryStore } from "./factory-store";
import type { ImageProvider, ImageResult } from "./image-provider";
import { costMicros, priceFor } from "./usage/price-table";
import type { ImageConverter } from "./webp";

/**
 * The art factory's work (ported from DnD-Max, Issue 421): a queue of single
 * pictures, drawn one (or a few) at a time on the site's picture maker, each
 * landing in a review tray to be approved, redone or rejected.
 *
 * ## Why the page drives the queue
 *
 * A serverless function lives for a request, not an evening. So nothing runs
 * in the background: the factory page asks for **one picture per request**
 * while it is open (`work`), and the queue itself is in Redis. Close the tab
 * and the queue waits; open it on another machine and it carries on. A
 * picture that was being drawn when its function died is noticed by its
 * lease running out and goes back in the queue.
 *
 * ## Pace
 *
 * At most `perMinute` pictures start in any minute across every open tab,
 * and a "busy" answer puts the picture back without using up a try.
 *
 * ## Approval is where the files are written
 *
 * The tray holds one WebP, at most 1536px. Approving cuts it to every size
 * the catalogue lists and writes each to the art store at its own path, then
 * records the path in the approved map, so `/api/art/made/<path>` serves it
 * with no deploy. Then the catalogue's `onApprove` hook runs.
 */
export interface FactoryDeps {
  store: FactoryStore;
  art: ArtStore;
  catalogue: () => Promise<IndexedCatalogue>;
  /** The site's picture maker, already metered as `art-factory`; `null` when none is on. */
  provider: () => Promise<ImageProvider | null>;
  convert: ImageConverter;
  onApprove?: ArtCatalogue["onApprove"];
  now?: () => Date;
}

/** How long a picture may be "being drawn" before it is assumed lost and queued again. */
// Longer than any one draw can live: a route runs at most 300 s (OpenAI alone may take 180 s twice, with the see-through
// retry), so a slow picture is never taken for lost and drawn, and paid for, a second time by another lane (BVD, Henry, 2026-10-16).
export const makingLeaseMs = 7 * 60 * 1000;
/** The longest a factory route is allowed to run (`maxDuration` on the routes). The lease must outlast it. */
export const longestDrawMs = 300 * 1000;
/** Tries before a picture that keeps failing is left for a person to look at. */
export const maxAttempts = 3;

const nowOf = (deps: Pick<FactoryDeps, "now">) => deps.now?.() ?? new Date();

export type EnqueueResult = { added: number; skipped: number; unknown: number };

/** Puts pictures in the queue. Anything approved, waiting, being drawn or in review is left alone. */
export async function enqueue(deps: FactoryDeps, imageIds: readonly string[]): Promise<EnqueueResult> {
  const { byId } = await deps.catalogue();
  const result: EnqueueResult = { added: 0, skipped: 0, unknown: 0 };
  for (const id of imageIds) {
    if (!byId.has(id)) {
      result.unknown += 1;
      continue;
    }
    const existing = await deps.store.entry(id);
    if (existing && existing.status !== "rejected" && existing.status !== "failed") {
      result.skipped += 1;
      continue;
    }
    await deps.store.save({
      imageId: id,
      status: "queued",
      seq: await deps.store.nextSeq(),
      attempts: 0,
      queuedAt: nowOf(deps).toISOString(),
      ...(existing?.prompt ? { prompt: existing.prompt } : {}),
      ...(existing?.spentUsd !== undefined ? { spentUsd: existing.spentUsd } : {}),
    });
    result.added += 1;
  }
  return result;
}

/** Takes a queued picture back out. */
export async function unqueue(deps: FactoryDeps, imageId: string): Promise<boolean> {
  const entry = await deps.store.entry(imageId);
  if (!entry || entry.status !== "queued") return false;
  await deps.store.remove(imageId);
  return true;
}

/** Takes everything waiting back out of the queue. */
export async function clearQueue(deps: FactoryDeps): Promise<number> {
  let cleared = 0;
  for (const entry of await deps.store.entries()) {
    if (entry.status !== "queued") continue;
    await deps.store.remove(entry.imageId);
    cleared += 1;
  }
  return cleared;
}

/** Lost pictures (their function died mid-draw) back into the queue. */
export async function recoverLost(deps: FactoryDeps): Promise<number> {
  const now = nowOf(deps).getTime();
  let recovered = 0;
  for (const entry of await deps.store.entries()) {
    if (entry.status === "making" && (!entry.startedAt || now - Date.parse(entry.startedAt) > makingLeaseMs)) {
      await deps.store.save({ ...entry, status: "queued", error: "The last try did not finish (the page or the server stopped); queued again." });
      recovered += 1;
    }
  }
  return recovered;
}

export type WorkResult =
  | { kind: "idle" }
  | { kind: "off"; message: string }
  /** `reason` is the provider's own words when it said busy; absent is the factory's pace limit. */
  | { kind: "wait"; ms: number; reason?: string }
  | { kind: "made"; imageId: string; entry: FactoryEntry }
  | { kind: "failed"; imageId: string; entry: FactoryEntry };

const safeName = (id: string) => id.replace(/[^a-z0-9-]+/gi, "-").replace(/-{2,}/g, "-").slice(0, 120);

/** Dollars one call cost, from the tokens it reported; `null` when it cannot be priced. */
function spentOn(drawn: ImageResult, providerName: string, now: Date): number | null {
  if (!drawn.usage || (providerName !== "openai" && providerName !== "google")) return null;
  const price = priceFor(providerName, drawn.usage.model, now.toISOString().slice(0, 10));
  return price ? costMicros(price, drawn.usage.inputTokens, drawn.usage.outputTokens) / 1_000_000 : null;
}

/**
 * An answer that means the account has no money to draw with. OpenAI sends
 * these as HTTP 429 (`insufficient_quota`), the same status as "slow down",
 * so the words decide. Waiting will not fix it; the owner has to.
 */
export function isOutOfCredit(detail: string): boolean {
  return /quota|billing|insufficient|credit balance|payment/i.test(detail);
}

/** "Busy, try again shortly": a 429 or 503 that is not about money, or the provider saying so in words. */
export function isBusy(status: number | undefined, detail: string): boolean {
  if (isOutOfCredit(detail)) return false;
  return status === 429 || status === 503 || /\b(busy|high demand|overloaded|rate limit|rate_limit|try again later)\b/i.test(detail);
}

/** What the factory says when the art store refuses: not this picture's fault, and Redo would not help. */
export function storeBlocked(said: string): string {
  return `The art store is refusing (${said}). Nothing is lost, but nothing can be made or approved until it is fixed: check the R2_* keys and the bucket's permissions. The factory has stopped so it does not pay for pictures it cannot keep.`;
}

const providerLabel = (name: string) => (name === "openai" ? "OpenAI" : name === "google" ? "Google" : name);

/** Draws the next picture in the queue, if the pace allows. One per call. */
export async function work(deps: FactoryDeps): Promise<WorkResult> {
  await recoverLost(deps);
  const queued = (await deps.store.entries()).filter((one) => one.status === "queued").sort((a, b) => a.seq - b.seq);
  if (queued.length === 0) return { kind: "idle" };

  const blocked = deps.art.problem();
  if (blocked) return { kind: "off", message: storeBlocked(blocked) };

  const provider = await deps.provider();
  if (!provider) return { kind: "off", message: "No picture maker is on. Add OPENAI_API_KEY_ImageGen (or GOOGLE_API_KEY_ImageGen) to the environment and redeploy, or pick Practice to rehearse for free." };

  const now = nowOf(deps);
  const settings = await deps.store.settings();
  const { byId, groups } = await deps.catalogue();

  for (const candidate of queued) {
    const image = byId.get(candidate.imageId);
    if (!image) {
      // A picture the catalogue no longer lists: nothing to draw.
      await deps.store.remove(candidate.imageId);
      continue;
    }
    if (!(await deps.store.lock(candidate.imageId, makingLeaseMs))) continue;
    try {
      // Re-read under the lock: another tab may have taken it.
      const entry = await deps.store.entry(candidate.imageId);
      if (!entry || entry.status !== "queued") continue;

      const started = await deps.store.countStart(now.toISOString().slice(0, 16));
      if (started > settings.perMinute) return { kind: "wait", ms: 60_000 - (now.getTime() % 60_000) + 250 };

      const making: FactoryEntry = { ...entry, status: "making", startedAt: now.toISOString(), attempts: entry.attempts + 1, provider: provider.name, ...(provider.model ? { model: provider.model } : {}) };
      delete making.error;
      await deps.store.save(making);

      const group = groups.find((one) => one.id === image.group);
      const words = factoryPrompt(styleFor(group ?? image.group, await deps.store.styles()), image, entry.prompt);
      const seeThrough = image.seeThrough ?? wantsSeeThrough(words, image.outputs);
      const drawn = await provider.generate({ prompt: words, aspect: image.aspect, label: image.description, ...(seeThrough ? { background: "transparent" as const } : {}) });
      const spent = spentOn(drawn, provider.name, now);
      if (spent !== null) making.spentUsd = (making.spentUsd ?? 0) + spent;

      if (!drawn.ok && (drawn.status === 402 || (drawn.code === "art-failed" && isOutOfCredit(drawn.detail)))) {
        // "Stop at zero", or the account is empty: the picture goes back untouched and the page stops.
        await deps.store.save({ ...entry, ...(making.spentUsd !== undefined ? { spentUsd: making.spentUsd } : {}) });
        return {
          kind: "off",
          message:
            drawn.status === 402
              ? drawn.detail
              : `${providerLabel(provider.name)} says the account has no credit to draw with: “${drawn.detail}” Add credit (it can take a few minutes to arrive), then press Start making again. The picture is still in the queue.`,
        };
      }
      if (!drawn.ok) {
        const busy = drawn.code === "art-failed" && isBusy(drawn.status, drawn.detail);
        // Busy is the provider's pace, not this picture's fault: back in the queue without using a try.
        const again = drawn.code === "art-failed" && (busy || making.attempts < maxAttempts);
        const next: FactoryEntry = {
          ...making,
          status: again ? "queued" : "failed",
          finishedAt: nowOf(deps).toISOString(),
          error:
            drawn.code === "art-refused"
              ? `The picture maker would not draw this (${drawn.detail}). Edit the words and Redo.`
              : `The picture maker did not answer properly (${drawn.detail}).${again ? " Queued to try again." : ""}`,
          ...(busy ? { attempts: making.attempts - 1 } : {}),
        };
        await deps.store.save(next);
        if (busy) return { kind: "wait", ms: 20_000, reason: drawn.detail };
        return { kind: "failed", imageId: image.id, entry: next };
      }

      const preview = await deps.convert(drawn.bytes);
      let stored: { url: string };
      try {
        stored = await deps.art.put(`art-factory/review/${safeName(image.id)}-${making.attempts}-${now.getTime()}.webp`, preview.bytes, preview.contentType);
      } catch (error) {
        // Paid for but cannot be kept: stop rather than draw the next one into the same wall (DnD-Max, 2026-10-16:
        // R2 refused every save with 411). The picture goes back in the queue, its try not used up; what it cost stays on it.
        const said = error instanceof Error ? error.message : String(error);
        console.error("[art-factory] could not save a picture", image.id, said);
        await deps.store.save({ ...making, status: "queued", attempts: entry.attempts, error: `Drawn, but the art store would not keep it (${said}).` });
        return { kind: "off", message: `The picture was drawn but the art store would not save it (${said}). The factory has stopped so it does not pay for more pictures it cannot keep. The picture is back in the queue.` };
      }
      const review: FactoryEntry = { ...making, status: "review", finishedAt: nowOf(deps).toISOString(), reviewUrl: stored.url };
      await deps.store.save(review);
      // Can the store hand it back? If not, every picture after this one is money spent on a file nobody can approve.
      if (deps.art.kind === "r2" && !(await deps.art.read(stored.url))) {
        const why = deps.art.problem();
        if (why) return { kind: "off", message: storeBlocked(why) };
      }
      return { kind: "made", imageId: image.id, entry: review };
    } finally {
      await deps.store.unlock(candidate.imageId);
    }
  }
  return { kind: "idle" };
}

export type ReviewResult = { ok: true; entry: FactoryEntry } | { ok: false; code: "art-job-unknown" | "art-not-in-review"; message: string };

const notInReview = (): ReviewResult => ({ ok: false, code: "art-not-in-review", message: "That picture is not waiting for review any more (another tab may have dealt with it). The list has been refreshed." });
const unknownJob = (): ReviewResult => ({ ok: false, code: "art-job-unknown", message: "The catalogue no longer lists that picture." });

/** Writes every size of an approved picture to its own path, records where it lives, then tells the project. */
export async function approve(deps: FactoryDeps, imageId: string): Promise<ReviewResult> {
  const image = (await deps.catalogue()).byId.get(imageId);
  if (!image) return unknownJob();
  const entry = await deps.store.entry(imageId);
  if (!entry || entry.status !== "review" || !entry.reviewUrl) return notInReview();
  const source = await deps.art.read(entry.reviewUrl);
  if (!source) {
    const why = deps.art.problem();
    return { ok: false, code: "art-not-in-review", message: why ? storeBlocked(why) : "The picture waiting for review could not be read back from the art store. Try Approve again in a minute; if it still fails, Redo it." };
  }

  const at = nowOf(deps).toISOString();
  const files: Record<string, string> = {};
  for (const output of image.outputs) {
    const cut = await deps.convert(source, { width: output.width, height: output.height, fit: output.fit });
    const written = await deps.art.put(`art/${output.path}`, cut.bytes, cut.contentType);
    files[output.path] = written.url;
    await deps.store.setApproved(output.path, { url: written.url, imageId, at });
  }

  // Recorded first, the review copy deleted last: interrupted in between, the picture is approved with a stray file, never "in review" pointing at nothing.
  const approved: FactoryEntry = { ...entry, status: "approved", finishedAt: at, files };
  delete approved.reviewUrl;
  delete approved.error;
  await deps.store.save(approved);
  await deps.art.remove(entry.reviewUrl);

  if (deps.onApprove) {
    try {
      await deps.onApprove({ image, files, at });
    } catch (error) {
      console.error("[art-factory] onApprove failed (the picture is still approved)", imageId, error);
    }
  }
  return { ok: true, entry: approved };
}

/** Back in the queue, with the same words or new ones; the picture under review is thrown away. Works on an approved picture too, to replace it. */
export async function redo(deps: FactoryDeps, imageId: string, prompt?: string | null): Promise<ReviewResult> {
  if (!(await deps.catalogue()).byId.get(imageId)) return unknownJob();
  const entry = await deps.store.entry(imageId);
  if (!entry || entry.status === "queued" || entry.status === "making") return notInReview();
  if (entry.reviewUrl) await deps.art.remove(entry.reviewUrl);
  const edited = typeof prompt === "string" ? prompt.trim().slice(0, 6000) : "";
  const next: FactoryEntry = {
    imageId,
    status: "queued",
    seq: await deps.store.nextSeq(),
    attempts: 0,
    queuedAt: nowOf(deps).toISOString(),
    // `null` goes back to the catalogue's own words; a string of 3+ characters replaces them; absent keeps any earlier edit.
    ...(prompt === null ? {} : edited.length >= 3 ? { prompt: edited } : entry.prompt ? { prompt: entry.prompt } : {}),
    ...(entry.files ? { files: entry.files } : {}),
    // What it has cost so far stays with the picture, so the factory's total counts redos too.
    ...(entry.spentUsd !== undefined ? { spentUsd: entry.spentUsd } : {}),
  };
  await deps.store.save(next);
  return { ok: true, entry: next };
}

export async function reject(deps: FactoryDeps, imageId: string): Promise<ReviewResult> {
  if (!(await deps.catalogue()).byId.get(imageId)) return unknownJob();
  const entry = await deps.store.entry(imageId);
  if (!entry || (entry.status !== "review" && entry.status !== "failed")) return notInReview();
  if (entry.reviewUrl) await deps.art.remove(entry.reviewUrl);
  const rejected: FactoryEntry = { ...entry, status: "rejected", finishedAt: nowOf(deps).toISOString() };
  delete rejected.reviewUrl;
  await deps.store.save(rejected);
  return { ok: true, entry: rejected };
}

/** Where an approved file is served from, or `null`. */
export async function approvedUrl(store: Pick<FactoryStore, "approvedFile">, path: string): Promise<string | null> {
  return (await store.approvedFile(path.replace(/^\/+/, "").replace(/^public\//, "")))?.url ?? null;
}
