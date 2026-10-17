import { factoryPrompt, styleFor, wantsSeeThrough } from "../core/prompts";
import { isSound, kindNames, kindOf, type ArtCatalogue, type ContentKind, type FactoryImage, type IndexedCatalogue } from "../core/types";
import type { ArtStore } from "./art-store";
import type { FactoryEntry, FactoryStore, PreviousVersion } from "./factory-store";
import type { ImageProvider } from "./image-provider";
import { contentTypeFor, extensionFor, imageMaker, type Maker, type MakerUsage } from "./maker";
import { costMicros, priceFor, providerName } from "./usage/price-table";
import type { ImageConverter } from "./webp";

/**
 * Content Factory MAX's work (ported from DnD-Max's Art Factory, Issue 421;
 * media-neutral since 2026-10-17): a queue of single items (pictures, voice
 * lines, sound effects, music), made one (or a few) at a time, each landing in
 * a review tray to be approved, redone or rejected.
 *
 * ## Why the page drives the queue
 *
 * A serverless function lives for a request, not an evening. So nothing runs
 * in the background: the factory page asks for **one item per request**
 * while it is open (`work`), and the queue itself is in Redis. Close the tab
 * and the queue waits; open it on another machine and it carries on. An item
 * that was being made when its function died is noticed by its lease running
 * out and goes back in the queue.
 *
 * ## Makers
 *
 * Each item is made by a {@link Maker} for its kind. Pictures come from the
 * site's picture maker (the switcher); sounds from the makers the project
 * plugs in (or Practice). An item whose kind has no maker waits in the queue.
 *
 * ## Pace and money
 *
 * At most `perMinute` items start in any minute across every open tab, and a
 * "busy" answer puts the item back without using up a try. A run (one press
 * of Start making) stops at its spending limit; a wallet on "stop at zero"
 * stops the maker when the estimate runs out.
 *
 * ## Approval is where the files are written
 *
 * The tray holds one copy (a WebP, at most 1536px, for a picture). Approving:
 * 1. keeps the version that is live now, if any, so it can be **put back**;
 * 2. writes **every** size (a picture) or the file (a sound) to its path;
 * 3. only then records each path as approved, so `/api/art/made/<path>` serves
 *    it with no deploy;
 * 4. runs the catalogue's `onApprove` hook. A hook that fails is marked on the
 *    item with a Retry, and never undoes the approval.
 * Interrupted anywhere, Approve again carries on from where it stopped.
 */
export interface FactoryDeps {
  store: FactoryStore;
  art: ArtStore;
  catalogue: () => Promise<IndexedCatalogue>;
  /** The site's picture maker, already metered as `art-factory`; `null` when none is on. */
  provider: () => Promise<ImageProvider | null>;
  /** Makers for the other kinds (voices, effects, music), already metered; `null` for a kind nothing makes. A maker here for pictures wins over `provider`. */
  makers?: (kind: ContentKind) => Promise<Maker | null>;
  convert: ImageConverter;
  onApprove?: ArtCatalogue["onApprove"];
  now?: () => Date;
}

/** How long an item may be "being made" before it is assumed lost and queued again. */
// Longer than any one draw can live: a route runs at most 300 s (OpenAI alone may take 180 s twice, with the see-through
// retry), so a slow picture is never taken for lost and drawn, and paid for, a second time by another lane (BVD, Henry, 2026-10-16).
export const makingLeaseMs = 7 * 60 * 1000;
/** The longest a factory route is allowed to run (`maxDuration` on the routes). The lease must outlast it. */
export const longestDrawMs = 300 * 1000;
/** Tries before an item that keeps failing is left for a person to look at. */
export const maxAttempts = 3;
/** How long a replaced version is kept for Put back. */
export const keepPreviousDays = 30;
/** At most this many earlier versions per item. */
export const keepPreviousCount = 10;

const nowOf = (deps: Pick<FactoryDeps, "now">) => deps.now?.() ?? new Date();

/** The maker for one kind: the project's own if it gave one, else the site's picture maker for pictures. */
export async function makerFor(deps: Pick<FactoryDeps, "makers" | "provider">, kind: ContentKind): Promise<Maker | null> {
  const own = (await deps.makers?.(kind)) ?? null;
  if (own && own.kinds.includes(kind)) return own;
  if (kind !== "image") return null;
  const provider = await deps.provider();
  return provider ? imageMaker(provider) : null;
}

export type EnqueueResult = { added: number; skipped: number; unknown: number };

/** What an entry keeps when it goes back in the queue: its words, its cost, and the version that is live. */
function carried(entry: FactoryEntry | null): Partial<FactoryEntry> {
  if (!entry) return {};
  return {
    ...(entry.prompt ? { prompt: entry.prompt } : {}),
    ...(entry.spentUsd !== undefined ? { spentUsd: entry.spentUsd } : {}),
    ...(entry.files ? { files: entry.files } : {}),
    ...(entry.approvedAt ? { approvedAt: entry.approvedAt } : {}),
    ...(entry.previous?.length ? { previous: entry.previous } : {}),
    ...(entry.hookError ? { hookError: entry.hookError } : {}),
  };
}

/** Puts items in the queue. Anything approved, waiting, being made or in review is left alone. */
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
    await deps.store.save({ ...carried(existing), imageId: id, status: "queued", seq: await deps.store.nextSeq(), attempts: 0, queuedAt: nowOf(deps).toISOString() });
    result.added += 1;
  }
  return result;
}

/** Takes a queued item back out. */
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

/** Lost items (their function died mid-make) back into the queue. */
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

/** Dollars one call cost, from what it reported (tokens, characters, seconds); `null` when it cannot be priced. */
export function spentOn(usage: MakerUsage | undefined, providerName: string, now: Date): number | null {
  if (!usage || providerName === "practice") return null;
  const price = priceFor(providerName, usage.model, now.toISOString().slice(0, 10));
  if (!price) return null;
  const counted = usage.unit && usage.quantity ? { unit: usage.unit, quantity: usage.quantity } : undefined;
  return costMicros(price, usage.inputTokens ?? 0, usage.outputTokens ?? 0, counted) / 1_000_000;
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

const money = (usd: number) => `$${usd.toFixed(2)}`;

/** Why nothing could be made: no maker for the kinds still waiting. */
export function noMakerMessage(kinds: readonly ContentKind[]): string {
  if (kinds.includes("image") && kinds.length === 1) return "No picture maker is on. Add OPENAI_API_KEY_ImageGen (or GOOGLE_API_KEY_ImageGen) to the environment and redeploy, or pick Practice to rehearse for free.";
  const names = kinds.map((kind) => kindNames[kind].many).join(" and ");
  return `Nothing is switched on to make the ${names} still waiting. ${kinds.includes("image") ? "Add a picture key or pick Practice. " : ""}Pick Practice on the switcher to rehearse sounds for free, or plug a maker into the config's \`makers\` (the Sound Stage brings real ones). They stay in the queue.`;
}

/** Whether one more try would take this run past its limit (judged on what each try has cost so far). */
export function runIsSpent(run: { spentUsd: number; tries: number }, limitUsd: number | null): boolean {
  if (limitUsd === null) return false;
  if (run.spentUsd >= limitUsd) return true;
  return run.tries > 0 && run.spentUsd + run.spentUsd / run.tries > limitUsd;
}

/** Makes the next item in the queue, if the pace and the run's limit allow. One per call. */
export async function work(deps: FactoryDeps, options: { runId?: string } = {}): Promise<WorkResult> {
  await recoverLost(deps);
  await tidyPrevious(deps);
  const queued = (await deps.store.entries()).filter((one) => one.status === "queued").sort((a, b) => a.seq - b.seq);
  if (queued.length === 0) return { kind: "idle" };

  const blocked = deps.art.problem();
  if (blocked) return { kind: "off", message: storeBlocked(blocked) };

  const now = nowOf(deps);
  const settings = await deps.store.settings();
  if (options.runId) {
    const run = await deps.store.run(options.runId);
    if (runIsSpent(run, settings.runLimitUsd)) {
      return {
        kind: "off",
        message: `This run has spent about ${money(run.spentUsd)} of its ${money(settings.runLimitUsd ?? 0)} limit, so it stopped before the next one. Press Start making for a fresh run, or raise the limit beside the pace. The rest are still in the queue.`,
      };
    }
  }
  const { byId, groups } = await deps.catalogue();
  const makers = new Map<ContentKind, Maker | null>();
  const missing = new Set<ContentKind>();

  for (const candidate of queued) {
    const image = byId.get(candidate.imageId);
    if (!image) {
      // An item the catalogue no longer lists: nothing to make.
      await deps.store.remove(candidate.imageId);
      continue;
    }
    const kind = kindOf(image);
    if (!makers.has(kind)) makers.set(kind, await makerFor(deps, kind));
    const maker = makers.get(kind) ?? null;
    if (!maker) {
      // Nothing makes this kind yet: it waits, and the next kind in the line gets its turn.
      missing.add(kind);
      continue;
    }
    if (!(await deps.store.lock(candidate.imageId, makingLeaseMs))) continue;
    try {
      // Re-read under the lock: another tab may have taken it.
      const entry = await deps.store.entry(candidate.imageId);
      if (!entry || entry.status !== "queued") continue;

      const started = await deps.store.countStart(now.toISOString().slice(0, 16));
      if (started > settings.perMinute) return { kind: "wait", ms: 60_000 - (now.getTime() % 60_000) + 250 };

      const making: FactoryEntry = { ...entry, status: "making", startedAt: now.toISOString(), attempts: entry.attempts + 1, provider: maker.name, ...(maker.model ? { model: maker.model } : {}) };
      delete making.error;
      await deps.store.save(making);

      const drawn = await maker.make(await requestFor(deps, image, entry, groups));
      const spent = spentOn(drawn.usage, maker.name, now);
      if (spent !== null) making.spentUsd = (making.spentUsd ?? 0) + spent;
      if (options.runId) await deps.store.addToRun(options.runId, spent ?? 0);

      if (!drawn.ok && (drawn.status === 402 || (drawn.code === "art-failed" && isOutOfCredit(drawn.detail)))) {
        // "Stop at zero", or the account is empty: the item goes back untouched and the page stops.
        await deps.store.save({ ...entry, ...(making.spentUsd !== undefined ? { spentUsd: making.spentUsd } : {}) });
        return {
          kind: "off",
          message:
            drawn.status === 402
              ? drawn.detail
              : `${providerName(maker.name)} says the account has no credit to draw with: “${drawn.detail}” Add credit (it can take a few minutes to arrive), then press Start making again. The ${kindNames[kind].one} is still in the queue.`,
        };
      }
      if (!drawn.ok) {
        const busy = drawn.code === "art-failed" && isBusy(drawn.status, drawn.detail);
        // Busy is the provider's pace, not this item's fault: back in the queue without using a try.
        const again = drawn.code === "art-failed" && (busy || making.attempts < maxAttempts);
        const next: FactoryEntry = {
          ...making,
          status: again ? "queued" : "failed",
          finishedAt: nowOf(deps).toISOString(),
          error:
            drawn.code === "art-refused"
              ? `The ${kind === "image" ? "picture maker would not draw" : "maker would not make"} this (${drawn.detail}). Edit the words and Redo.`
              : `The ${kind === "image" ? "picture maker" : "maker"} did not answer properly (${drawn.detail}).${again ? " Queued to try again." : ""}`,
          ...(busy ? { attempts: making.attempts - 1 } : {}),
        };
        await deps.store.save(next);
        if (busy) return { kind: "wait", ms: 20_000, reason: drawn.detail };
        return { kind: "failed", imageId: image.id, entry: next };
      }

      // A picture is cut to one small WebP for the tray; a sound goes in as it came.
      const preview = isSound(kind) ? { bytes: drawn.bytes, contentType: drawn.contentType } : await deps.convert(drawn.bytes);
      let stored: { url: string };
      try {
        stored = await deps.art.put(`art-factory/review/${safeName(image.id)}-${making.attempts}-${now.getTime()}.${extensionFor(preview.contentType, isSound(kind) ? (image.format ?? "mp3") : "webp")}`, preview.bytes, preview.contentType);
      } catch (error) {
        // Paid for but cannot be kept: stop rather than make the next one into the same wall (DnD-Max, 2026-10-16:
        // R2 refused every save with 411). The item goes back in the queue, its try not used up; what it cost stays on it.
        const said = error instanceof Error ? error.message : String(error);
        console.error("[content-factory] could not save an item", image.id, said);
        await deps.store.save({ ...making, status: "queued", attempts: entry.attempts, error: `Made, but the art store would not keep it (${said}).` });
        return { kind: "off", message: `The ${kindNames[kind].one} was made but the art store would not save it (${said}). The factory has stopped so it does not pay for more it cannot keep. It is back in the queue.` };
      }
      const review: FactoryEntry = { ...making, status: "review", finishedAt: nowOf(deps).toISOString(), reviewUrl: stored.url, reviewType: preview.contentType };
      await deps.store.save(review);
      // Can the store hand it back? If not, every item after this one is money spent on a file nobody can approve.
      if (deps.art.kind === "r2" && !(await deps.art.read(stored.url))) {
        const why = deps.art.problem();
        if (why) return { kind: "off", message: storeBlocked(why) };
      }
      return { kind: "made", imageId: image.id, entry: review };
    } finally {
      await deps.store.unlock(candidate.imageId);
    }
  }
  if (missing.size > 0) return { kind: "off", message: noMakerMessage([...missing]) };
  return { kind: "idle" };
}

/** What a maker is asked for one item: the words with the group's style in front, and the item's own settings. */
async function requestFor(deps: FactoryDeps, image: FactoryImage, entry: FactoryEntry, groups: IndexedCatalogue["groups"]) {
  const kind = kindOf(image);
  const group = groups.find((one) => one.id === image.group);
  const style = styleFor(group ?? image.group, await deps.store.styles());
  if (kind === "image") {
    const words = factoryPrompt(style, image, entry.prompt);
    const seeThrough = image.seeThrough ?? wantsSeeThrough(words, image.outputs);
    return { kind, prompt: words, ...(style ? { style } : {}), aspect: image.aspect, label: image.description, ...(seeThrough ? { background: "transparent" as const } : {}) };
  }
  // A voice reads its line, so the style goes alongside as direction; effects and music take the style in front, like a picture.
  const prompt = kind === "voice" ? (entry.prompt ?? image.prompt).trim() : factoryPrompt(style, image, entry.prompt);
  return {
    kind,
    prompt,
    ...(style ? { style } : {}),
    label: image.description,
    format: image.format ?? ("mp3" as const),
    ...(image.seconds !== undefined ? { seconds: image.seconds } : {}),
    ...(image.loop !== undefined ? { loop: image.loop } : {}),
    ...(image.voice ? { voice: image.voice } : {}),
  };
}

export type ReviewResult = { ok: true; entry: FactoryEntry; warning?: string } | { ok: false; code: "art-job-unknown" | "art-not-in-review" | "store-failed"; message: string };

const writeFailed = (error: unknown): ReviewResult => {
  const said = error instanceof Error ? error.message : String(error);
  console.error("[content-factory] could not write an approved file", said);
  return { ok: false, code: "store-failed", message: `The art store would not take every file (${said}). Nothing new is live yet. Press Approve again: it carries on from where it stopped.` };
};

const notInReview = (): ReviewResult => ({ ok: false, code: "art-not-in-review", message: "That item is not waiting for review any more (another tab may have dealt with it). The list has been refreshed." });
const unknownJob = (): ReviewResult => ({ ok: false, code: "art-job-unknown", message: "The catalogue no longer lists that item." });

/** The alt text (picture) or caption (sound) as it stands: an edit from review, else the catalogue's own. */
export function textFor(image: FactoryImage, edits: Readonly<Record<string, string>>): string {
  return (edits[image.id] ?? (isSound(kindOf(image)) ? image.caption : image.alt) ?? "").trim();
}

/** Copies the files that are live now to `art-factory/previous/…`, so they can be put back. `null` when there was nothing to keep. */
async function keepLive(deps: FactoryDeps, imageId: string, files: Readonly<Record<string, string>>, approvedAt: string): Promise<PreviousVersion | null> {
  const keptAt = nowOf(deps).toISOString();
  // Its own folder every time, even two keeps in the same millisecond, so one version can never overwrite another.
  const folder = `${keptAt.replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
  const kept: Record<string, string> = {};
  for (const [path, url] of Object.entries(files)) {
    const bytes = await deps.art.read(url);
    if (!bytes) continue;
    kept[path] = (await deps.art.put(`art-factory/previous/${safeName(imageId)}/${folder}/${path}`, bytes, contentTypeFor(path))).url;
  }
  return Object.keys(kept).length ? { at: approvedAt, keptAt, files: kept } : null;
}

/** Runs the project's on-approve hook. Returns why it failed, or `null`. */
async function runHook(deps: FactoryDeps, image: FactoryImage, files: Record<string, string>, at: string, extra: { putBack?: boolean } = {}): Promise<string | null> {
  if (!deps.onApprove) return null;
  try {
    const text = textFor(image, await deps.store.texts());
    await deps.onApprove({ image, files, at, ...(text ? { text } : {}), ...(extra.putBack ? { putBack: true } : {}) });
    return null;
  } catch (error) {
    console.error("[content-factory] onApprove failed (the item is still approved)", image.id, error);
    return error instanceof Error ? error.message : String(error);
  }
}

const hookWarning = (message: string) => `Approved and live, but the project's on-approve step failed (${message}), so the app may not know yet. Press Retry on that item to tell it again.`;

/** Approves an item: keeps what was live, writes every file, records them, then tells the project. Safe to run again after an interruption. */
export async function approve(deps: FactoryDeps, imageId: string): Promise<ReviewResult> {
  const image = (await deps.catalogue()).byId.get(imageId);
  if (!image) return unknownJob();
  let entry = await deps.store.entry(imageId);
  if (!entry || entry.status !== "review" || !entry.reviewUrl) return notInReview();
  const reviewUrl = entry.reviewUrl;
  const source = await deps.art.read(reviewUrl);
  if (!source) {
    const why = deps.art.problem();
    return { ok: false, code: "art-not-in-review", message: why ? storeBlocked(why) : "The item waiting for review could not be read back from the art store. Try Approve again in a minute; if it still fails, Redo it." };
  }

  // 1. Keep the version that is live now, once: a retry after an interruption finds `approving` and does not keep the new files by mistake.
  if (!entry.approving) {
    const at = nowOf(deps).toISOString();
    let previous: PreviousVersion | null = null;
    try {
      previous = entry.files && Object.keys(entry.files).length ? await keepLive(deps, imageId, entry.files, entry.approvedAt ?? entry.finishedAt ?? at) : null;
    } catch (error) {
      return writeFailed(error);
    }
    entry = { ...entry, approving: { at, ...(previous ? { previous } : {}) } };
    await deps.store.save(entry);
  }
  const at = entry.approving!.at;

  // 2. Write every file before recording any, so the app never serves half a set.
  const files: Record<string, string> = {};
  try {
    if (isSound(kindOf(image))) {
      files[image.target] = (await deps.art.put(`art/${image.target}`, source, entry.reviewType ?? contentTypeFor(image.target))).url;
    } else {
      for (const output of image.outputs) {
        const cut = await deps.convert(source, { width: output.width, height: output.height, fit: output.fit });
        files[output.path] = (await deps.art.put(`art/${output.path}`, cut.bytes, cut.contentType)).url;
      }
    }
  } catch (error) {
    return writeFailed(error);
  }

  // 3. Record them.
  for (const [path, url] of Object.entries(files)) await deps.store.setApproved(path, { url, imageId, at });

  // 4. The entry says approved, the review copy goes last: interrupted in between, the item is approved with a stray file, never "in review" pointing at nothing.
  const kept = entry.approving!.previous;
  const approved: FactoryEntry = { ...entry, status: "approved", finishedAt: at, approvedAt: at, files, previous: [...(kept ? [kept] : []), ...(entry.previous ?? [])].slice(0, keepPreviousCount) };
  for (const key of ["reviewUrl", "reviewType", "error", "approving", "hookError"] as const) delete approved[key];
  if (!approved.previous?.length) delete approved.previous;
  await deps.store.save(approved);
  await deps.art.remove(reviewUrl);

  // 5. Tell the project. A failure is kept on the item, with a Retry.
  const failed = await runHook(deps, image, files, at);
  if (failed) {
    const marked: FactoryEntry = { ...approved, hookError: { at: nowOf(deps).toISOString(), message: failed.slice(0, 300) } };
    await deps.store.save(marked);
    return { ok: true, entry: marked, warning: hookWarning(failed) };
  }
  await tidyPrevious(deps);
  return { ok: true, entry: approved };
}

/** Runs the on-approve hook again for an approved item whose hook failed. */
export async function retryHook(deps: FactoryDeps, imageId: string): Promise<ReviewResult> {
  const image = (await deps.catalogue()).byId.get(imageId);
  if (!image) return unknownJob();
  const entry = await deps.store.entry(imageId);
  if (!entry || entry.status !== "approved" || !entry.files) return { ok: false, code: "art-not-in-review", message: "Only an approved item can be handed to the app again." };
  const failed = await runHook(deps, image, entry.files, entry.approvedAt ?? entry.finishedAt ?? nowOf(deps).toISOString());
  const next: FactoryEntry = { ...entry };
  if (failed) next.hookError = { at: nowOf(deps).toISOString(), message: failed.slice(0, 300) };
  else delete next.hookError;
  await deps.store.save(next);
  return failed ? { ok: true, entry: next, warning: hookWarning(failed) } : { ok: true, entry: next };
}

/**
 * Puts back the version that was live before the last approve. The one live
 * now becomes the newest earlier version, so Put back can itself be undone.
 * Safe to run again after an interruption.
 */
export async function putBack(deps: FactoryDeps, imageId: string): Promise<ReviewResult> {
  const image = (await deps.catalogue()).byId.get(imageId);
  if (!image) return unknownJob();
  let entry = await deps.store.entry(imageId);
  const version = entry?.previous?.[0];
  if (!entry || entry.status !== "approved" || !version) return { ok: false, code: "art-not-in-review", message: "There is no earlier version of that item to put back." };

  // Read the earlier version first: if it is gone, nothing is touched.
  const bytes: Record<string, ArrayBuffer> = {};
  for (const [path, url] of Object.entries(version.files)) {
    const read = await deps.art.read(url);
    if (!read) return { ok: false, code: "art-not-in-review", message: `The earlier version could not be read from the art store (${path}). Nothing was changed.` };
    bytes[path] = read;
  }
  if (!entry.puttingBack) {
    let current: PreviousVersion | null = null;
    try {
      current = entry.files ? await keepLive(deps, imageId, entry.files, entry.approvedAt ?? entry.finishedAt ?? nowOf(deps).toISOString()) : null;
    } catch (error) {
      return writeFailed(error);
    }
    entry = { ...entry, puttingBack: { current } };
    await deps.store.save(entry);
  }
  const at = nowOf(deps).toISOString();
  const files: Record<string, string> = { ...(entry.files ?? {}) };
  try {
    for (const [path, data] of Object.entries(bytes)) files[path] = (await deps.art.put(`art/${path}`, data, contentTypeFor(path))).url;
  } catch (error) {
    return writeFailed(error);
  }
  for (const path of Object.keys(bytes)) await deps.store.setApproved(path, { url: files[path]!, imageId, at });

  const current = entry.puttingBack!.current;
  const next: FactoryEntry = { ...entry, files, approvedAt: version.at, finishedAt: at, previous: [...(current ? [current] : []), ...(entry.previous ?? []).slice(1)].slice(0, keepPreviousCount) };
  delete next.puttingBack;
  delete next.hookError;
  if (!next.previous?.length) delete next.previous;
  await deps.store.save(next);
  // The kept copies of the version now live again are not needed: it is at its own path.
  const nowKept = new Set(Object.values(current?.files ?? {}));
  for (const url of Object.values(version.files)) if (!nowKept.has(url)) await deps.art.remove(url);

  const failed = await runHook(deps, image, files, at, { putBack: true });
  if (failed) {
    const marked: FactoryEntry = { ...next, hookError: { at, message: failed.slice(0, 300) } };
    await deps.store.save(marked);
    return { ok: true, entry: marked, warning: hookWarning(failed) };
  }
  return { ok: true, entry: next };
}

/** Removes earlier versions kept longer than {@link keepPreviousDays}. Returns how many versions went. */
export async function cleanPrevious(deps: FactoryDeps): Promise<number> {
  const cutoff = nowOf(deps).getTime() - keepPreviousDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const entry of await deps.store.entries()) {
    if (!entry.previous?.length) continue;
    const keep = entry.previous.filter((one) => Date.parse(one.keptAt) >= cutoff);
    if (keep.length === entry.previous.length) continue;
    // Re-read before writing: the tidy must never overwrite a decision made a moment ago in another tab.
    const fresh = await deps.store.entry(entry.imageId);
    if (!fresh?.previous) continue;
    const stay = fresh.previous.filter((one) => Date.parse(one.keptAt) >= cutoff);
    for (const old of fresh.previous.filter((one) => Date.parse(one.keptAt) < cutoff)) for (const url of Object.values(old.files)) await deps.art.remove(url);
    removed += fresh.previous.length - stay.length;
    const next: FactoryEntry = { ...fresh, previous: stay };
    if (!stay.length) delete next.previous;
    await deps.store.save(next);
  }
  return removed;
}

/** The 30-day tidy, at most every six hours (a lock that is left to run out). */
async function tidyPrevious(deps: FactoryDeps): Promise<void> {
  try {
    if (await deps.store.lock("~tidy-previous", 6 * 60 * 60 * 1000)) await cleanPrevious(deps);
  } catch (error) {
    console.warn("[content-factory] could not tidy earlier versions", error);
  }
}

/** Back in the queue, with the same words or new ones; the item under review is thrown away. Works on an approved item too, to replace it (what is live stays live until the new one is approved). */
export async function redo(deps: FactoryDeps, imageId: string, prompt?: string | null): Promise<ReviewResult> {
  if (!(await deps.catalogue()).byId.get(imageId)) return unknownJob();
  const entry = await deps.store.entry(imageId);
  if (!entry || entry.status === "queued" || entry.status === "making") return notInReview();
  if (entry.reviewUrl) await deps.art.remove(entry.reviewUrl);
  const edited = typeof prompt === "string" ? prompt.trim().slice(0, 6000) : "";
  const kept = carried(entry);
  delete kept.prompt;
  const next: FactoryEntry = {
    ...kept,
    imageId,
    status: "queued",
    seq: await deps.store.nextSeq(),
    attempts: 0,
    queuedAt: nowOf(deps).toISOString(),
    // `null` goes back to the catalogue's own words; a string of 3+ characters replaces them; absent keeps any earlier edit.
    ...(prompt === null ? {} : edited.length >= 3 ? { prompt: edited } : entry.prompt ? { prompt: entry.prompt } : {}),
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
  delete rejected.reviewType;
  delete rejected.approving;
  await deps.store.save(rejected);
  return { ok: true, entry: rejected };
}

/** Saves an alt text (picture) or caption (sound) from review; `null` or empty goes back to the catalogue's own. */
export async function setText(deps: FactoryDeps, imageId: string, text: string | null): Promise<{ ok: true; text: string } | { ok: false; code: "art-job-unknown"; message: string }> {
  const image = (await deps.catalogue()).byId.get(imageId);
  if (!image) return { ok: false, code: "art-job-unknown", message: "The catalogue no longer lists that item." };
  const clean = text === null ? "" : text.replace(/\s+/g, " ").trim().slice(0, 500);
  await deps.store.setText(imageId, clean ? clean : null);
  return { ok: true, text: textFor(image, await deps.store.texts()) };
}

/** Where an approved file is served from, or `null`. */
export async function approvedUrl(store: Pick<FactoryStore, "approvedFile">, path: string): Promise<string | null> {
  return (await store.approvedFile(path.replace(/^\/+/, "").replace(/^public\//, "")))?.url ?? null;
}
