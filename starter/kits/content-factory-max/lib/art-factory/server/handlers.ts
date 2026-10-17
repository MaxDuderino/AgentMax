import { makeArtPrompt } from "../core/make-art-prompt";
import { factoryPrompt, styleFor } from "../core/prompts";
import { artFilePrefix } from "./art-store";
import { softenWords } from "../core/soften";
import { isSound, kindOf } from "../core/types";
import { approve, approvedUrl, clearQueue, enqueue, putBack, redo, reject, retryHook, setText, textFor, unqueue, work } from "./factory-service";
import { geminiImageTokens, imageProviderLabels, openAiModels, openAiQualities, openAiTokenEstimate, type ImageAspect } from "./image-provider";
import { makeArt, usedToday } from "./make-art-service";
import { activeProvider, modelFor, providerStatuses, qualityFor, readDailyCap, readOpenAiModel, readOpenAiQuality, readProviderName, siteKeyFor } from "./providers";
import { costMicros, isCountedUnit, isUsageProvider, priceFor, pricesCheckedOn, type UsageProvider } from "./usage/price-table";
import { dayOf } from "./usage/usage-ledger";
import type { ArtFactory } from "./setup";

/**
 * Every door the kit opens, as plain `Request → Response` functions, so any
 * framework can mount them. The Next.js route files in the kit's `app/`
 * folder are one line each.
 *
 * Admin doors answer **404** to anybody else, like every admin route in
 * DnD-Max: a stranger cannot even tell they exist. **Keys never leave the
 * server**: only "set" or "not set" and which variable name it was found in.
 */
type Handler = (request: Request) => Promise<Response>;

export interface ArtFactoryHandlers {
  factoryGet: Handler;
  factoryPost: Handler;
  settingsGet: Handler;
  settingsPost: Handler;
  usageGet: Handler;
  usagePost: Handler;
  file: Handler;
  made: Handler;
  makeGet: Handler;
  makePost: Handler;
  /** Public: the alt text and captions for every file the catalogue makes, edits included. `artSrc(path, { withText: true })` reads it. */
  textGet: Handler;
  loginPost: Handler;
  sessionGet: Handler;
}

const noStore = { "cache-control": "no-store" };
const json = (value: unknown, status = 200, headers: Record<string, string> = noStore) => Response.json(value, { status, headers });
const notFound = () => json({ error: { code: "not-found", message: "Not found." } }, 404);
const bad = (code: string, message: string, status = 400) => json({ error: { code, message } }, status);
const readBody = async <T>(request: Request): Promise<T> => ((await request.json().catch(() => null)) ?? {}) as T;

/** The path after a route's prefix, from the URL itself, so no framework's params are needed. */
function tail(request: Request, marker: string): string {
  const path = new URL(request.url).pathname;
  const at = path.indexOf(marker);
  return at === -1 ? "" : decodeURIComponent(path.slice(at + marker.length));
}

const safeKey = (key: string) => !key.includes("..") && /^[a-z0-9][a-z0-9/_.-]{0,400}$/i.test(key);

export function createHandlers(factory: ArtFactory): ArtFactoryHandlers {
  const options = { practice: factory.config.practice, ...(factory.config.keyNames ? { keyNames: factory.config.keyNames } : {}) };

  /** About what one picture costs on the switched-on maker, plus the credit left on its wallet. */
  async function costPerPicture() {
    const settings = await factory.settings.read();
    const active = activeProvider(factory.env, settings.provider, options);
    const name = active?.name ?? "openai";
    const model = modelFor(name, factory.env, settings);
    const quality = qualityFor(settings);
    const day = dayOf(new Date());
    const overrides = await factory.usage.priceOverrides();
    const price = name === "practice" ? { inputPerMillion: 0, outputPerMillion: 0 } : priceFor(name, model, day, overrides);
    const tokens = (aspect: ImageAspect) => (name === "openai" ? openAiTokenEstimate(model, quality, aspect) : name === "google" ? geminiImageTokens : 0);
    const usd = (aspect: ImageAspect) => (price ? costMicros(price, 300, tokens(aspect)) / 1_000_000 : null);
    const credit = name === "practice" ? null : await factory.usage.creditLeft(name).catch(() => null);
    return {
      provider: imageProviderLabels[name],
      providerName: name,
      model,
      quality: name === "openai" ? quality : null,
      usd: usd("1:1"),
      usdOther: usd("3:2"),
      seeThrough: name === "openai",
      credit: credit ? { balanceUsd: credit.wallet.balanceUsd, remainingUsd: credit.remainingUsd, stopAtZero: credit.wallet.stopAtZero, setAt: credit.wallet.setAt } : null,
    };
  }

  function openAiMenu() {
    const day = dayOf(new Date());
    return openAiModels.map((one) => {
      const price = priceFor("openai", one.id, day);
      return { ...one, usd: Object.fromEntries(openAiQualities.map((quality) => [quality, price ? costMicros(price, 300, openAiTokenEstimate(one.id, quality, "1:1")) / 1_000_000 : null])) };
    });
  }

  async function settingsView() {
    const settings = await factory.settings.read();
    const providers = providerStatuses(factory.env, settings, options);
    const active = activeProvider(factory.env, settings.provider, options);
    return {
      dailyCap: settings.dailyCap,
      provider: settings.provider ?? null,
      activeProvider: active?.name ?? null,
      keyFrom: active?.from ?? null,
      providers,
      openaiModel: modelFor("openai", factory.env, settings),
      openaiQuality: qualityFor(settings),
      openaiModels: openAiMenu(),
    };
  }

  async function services() {
    const measured = async <T>(fn: () => Promise<T>) => fn().catch(() => null);
    const keys = factory.kv.kind === "redis" ? await measured(async () => (await factory.kv.size?.()) ?? null) : null;
    const stored = factory.art.measure ? await measured(() => factory.art.measure!("art/")) : null;
    const review = factory.art.measure ? await measured(() => factory.art.measure!("art-factory/review/")) : null;
    const made = factory.art.measure ? await measured(() => factory.art.measure!("made/")) : null;
    const size = (bytes: number) => (bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : bytes < 1024 ** 3 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${(bytes / 1024 ** 3).toFixed(2)} GB`);
    return [
      {
        id: "redis",
        name: "Upstash Redis",
        usedFor: "The queue, the review tray, approvals, settings and these counters",
        measured: factory.kv.kind === "memory" ? "Not connected: this server is keeping everything in memory, so a restart forgets it." : keys === null ? "Could not ask Redis just now." : `${keys.toLocaleString("en-US")} saved records (keys)`,
        canRunOut: "The plan's daily command count and storage size",
        dashboard: "https://console.upstash.com/",
      },
      {
        id: "r2",
        name: "Cloudflare R2",
        usedFor: "Every picture: approved art, the review tray, Make art pictures",
        measured:
          factory.art.kind === "memory"
            ? "Not connected: pictures are kept in this server's memory only. Set the four R2_* variables."
            : stored === null
              ? "Could not list the bucket just now."
              : `${stored.files} approved files (${size(stored.bytes)})${review ? `, ${review.files} waiting for review` : ""}${made ? `, ${made.files} made with Make art (${size(made.bytes)})` : ""}`,
        canRunOut: "Storage over the free 10 GB, and operations past the monthly free tier",
        dashboard: "https://dash.cloudflare.com/?to=/:account/r2",
      },
      { id: "vercel", name: "Vercel hosting", usedFor: "The site itself, and the factory's requests", measured: null, canRunOut: "Function time and bandwidth on the plan", dashboard: "https://vercel.com/dashboard/usage" },
    ];
  }

  /**
   * Cost truth (BVD, DuderMax/Randy/Jerry/Mattimax): what each approved item really
   * cost, redos and refusals included, next to the list price of one draw, and the
   * redo rate per group. DnD-Max: about 9.5¢ an approved picture against 3.5¢ list.
   */
  async function costTruth() {
    const [{ groups }, entries, cost] = await Promise.all([factory.catalogue(), factory.store.entries(), costPerPicture()]);
    const byId = new Map(entries.map((one) => [one.imageId, one]));
    const rows = groups.map((group) => {
      const ids = group.jobs.flatMap((job) => job.images.map((one) => one.id));
      let approved = 0;
      let draws = 0;
      let redos = 0;
      let spentUsd = 0;
      let refused = 0;
      for (const id of ids) {
        const entry = byId.get(id);
        if (!entry) continue;
        if (entry.status === "approved") approved += 1;
        draws += entry.draws ?? 0;
        redos += entry.redos ?? 0;
        spentUsd += entry.spentUsd ?? 0;
        if (entry.refused) refused += 1;
      }
      return { id: group.id, title: group.title, items: ids.length, approved, draws, redos, refused, spentUsd, perApprovedUsd: approved ? spentUsd / approved : null, redoRate: approved ? redos / approved : null };
    });
    const total = rows.reduce((sum, row) => ({ approved: sum.approved + row.approved, draws: sum.draws + row.draws, redos: sum.redos + row.redos, spentUsd: sum.spentUsd + row.spentUsd }), { approved: 0, draws: 0, redos: 0, spentUsd: 0 });
    return {
      listUsd: cost.usd,
      listModel: cost.model,
      groups: rows.filter((row) => row.draws > 0 || row.approved > 0),
      total: { ...total, perApprovedUsd: total.approved ? total.spentUsd / total.approved : null, redoRate: total.approved ? total.redos / total.approved : null },
    };
  }

  async function usageView() {
    const snapshot = await factory.usage.snapshot();
    const day = dayOf(new Date());
    const models = new Map<string, { provider: UsageProvider; model: string }>();
    for (const month of snapshot.months) for (const line of month.lines) {
      const model = line.model.split(" · ")[0]!;
      models.set(`${line.provider}|${model}`, { provider: line.provider, model });
    }
    const prices = [...models.values()].map(({ provider, model }) => ({ provider, model, price: priceFor(provider, model, day, snapshot.priceOverrides), overridden: Boolean(snapshot.priceOverrides[model]) }));
    return { ...snapshot, services: await services(), prices, pricesCheckedOn, appName: factory.config.appName, factory: await costTruth() };
  }

  const money = (value: unknown, allowZero = true): number | null => {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100_000 || (!allowZero && parsed === 0)) return null;
    return Math.round(parsed * 1_000_000) / 1_000_000;
  };

  return {
    async factoryGet(request) {
      if (!(await factory.isAdmin(request))) return notFound();
      const { groups, byId } = await factory.catalogue();
      const url = new URL(request.url);
      const promptFor = url.searchParams.get("prompt");
      if (promptFor) {
        const image = byId.get(promptFor);
        if (!image) return bad("art-job-unknown", "The catalogue no longer has that picture.", 404);
        const entry = await factory.store.entry(promptFor);
        const group = groups.find((one) => one.id === image.group);
        return json({ id: image.id, own: entry?.prompt ?? image.prompt, edited: Boolean(entry?.prompt), sent: factoryPrompt(styleFor(group ?? image.group, await factory.store.styles()), image, entry?.prompt) });
      }
      if (url.searchParams.get("export") === "fixes") {
        // Prompt fixes made here, for the project's own prompts.json (Max: versioned, in the project's own list, never the template).
        const [entries, texts, styles, textBases, styleBases] = await Promise.all([factory.store.entries(), factory.store.texts(), factory.store.styles(), factory.store.textBases(), factory.store.styleBases()]);
        const assetOf = (id: string) => id.split("/").pop() ?? id;
        const exported = {
          kind: "content-factory-prompt-fixes",
          version: 1,
          project: factory.config.appName,
          exportedAt: new Date().toISOString(),
          note: "Merge into this project's assets/prompts.json with Asset Forge's merge_fixes.py. Each change becomes a new numbered version; the old words are kept.",
          fixes: entries
            .filter((one) => one.prompt && byId.has(one.imageId))
            // `original` is the catalogue's words when the edit was made, so a prompts.json change since then is a conflict, not overwritten.
            .map((one) => ({ id: one.imageId, assetId: assetOf(one.imageId), prompt: one.prompt!, original: one.promptBase ?? byId.get(one.imageId)!.prompt, status: one.status })),
          texts: Object.entries(texts)
            .filter(([id]) => byId.has(id))
            .map(([id, text]) => {
              const image = byId.get(id)!;
              const sound = isSound(kindOf(image));
              return { id, assetId: assetOf(id), field: sound ? "caption" : "alt", text, original: textBases[id] ?? (sound ? image.caption : image.alt) ?? "" };
            }),
          styles: groups.filter((group) => styles[group.id] !== undefined).map((group) => ({ family: group.title, text: styles[group.id]!, original: styleBases[group.id] ?? group.style ?? "" })),
        };
        const name = `${factory.config.prefix}-prompt-fixes-${exported.exportedAt.slice(0, 10)}.json`;
        return new Response(`${JSON.stringify(exported, null, 2)}\n`, { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, ...noStore } });
      }
      if (url.searchParams.get("only") === "entries") {
        const list = await factory.store.entries();
        return json({ entries: Object.fromEntries(list.map((one) => [one.imageId, one])) });
      }
      const [entries, styles, settings, approved, texts] = await Promise.all([factory.store.entries(), factory.store.styles(), factory.store.settings(), factory.store.approved(), factory.store.texts()]);
      const artSettings = await factory.settings.read();
      return json({
        appName: factory.config.appName,
        gate: factory.config.isAdmin ? "custom" : factory.gate.mode(),
        groups: groups.map((group) => ({
          id: group.id,
          title: group.title,
          intro: group.intro ?? null,
          style: styleFor(group, styles),
          styleEdited: styles[group.id] !== undefined,
          defaultStyle: group.style ?? "",
          jobs: group.jobs.map((job) => ({
            key: job.key,
            title: job.title,
            meta: job.meta,
            note: job.note,
            images: job.images.map((image) => ({
              id: image.id,
              kind: kindOf(image),
              number: image.number,
              description: image.description,
              target: image.target,
              outputs: image.outputs.map((one) => ({ path: one.path, width: one.width, height: one.height })),
              aspect: image.aspect,
              text: textFor(image, texts),
              textEdited: texts[image.id] !== undefined,
              ...(isSound(kindOf(image)) ? { format: image.format ?? "mp3", ...(image.seconds !== undefined ? { seconds: image.seconds } : {}), ...(image.loop ? { loop: true } : {}), ...(image.voice ? { voice: image.voice } : {}) } : {}),
            })),
          })),
        })),
        entries: Object.fromEntries(entries.map((one) => [one.imageId, one])),
        settings,
        approvedFiles: Object.keys(approved).length,
        activeProvider: activeProvider(factory.env, artSettings.provider, options)?.name ?? null,
        store: factory.art.kind,
        memory: factory.kv.kind,
        cost: await costPerPicture(),
        pictureMakers: providerStatuses(factory.env, artSettings, options).filter((one) => one.configured && one.name !== "practice").map((one) => one.name),
        // Which kinds have a maker switched on right now, so the page can say which sounds would wait.
        makers: Object.fromEntries(await Promise.all((["voice", "sfx", "music"] as const).map(async (kind) => [kind, (await factory.maker(kind, "check"))?.name ?? null] as const))),
      });
    },

    async factoryPost(request) {
      if (!(await factory.isAdmin(request))) return notFound();
      const body = await readBody<Record<string, unknown>>(request);
      const deps = factory.factoryDeps();
      const { groups } = await factory.catalogue();
      const allIds = () => groups.flatMap((group) => group.jobs.flatMap((job) => job.images.map((one) => one.id)));
      const known = async () => Object.fromEntries((await factory.store.entries()).map((one) => [one.imageId, one]));
      // New batches take only pictures never tried; failed and rejected ones come back only through their own Retry buttons.
      const open = async (ids: string[], limit?: number) => {
        const entries = await known();
        const waiting = ids.filter((id) => !entries[id]);
        return typeof limit === "number" ? waiting.slice(0, limit) : waiting;
      };
      const inState = async (status: "failed" | "rejected") => {
        const entries = await known();
        return allIds().filter((id) => entries[id]?.status === status);
      };
      const limit = typeof body.limit === "number" && Number.isInteger(body.limit) && body.limit > 0 ? Math.min(body.limit, 1000) : undefined;

      switch (body.action) {
        case "queue": {
          let ids: string[] = [];
          if (body.retry === "failed" || body.retry === "rejected") ids = await inState(body.retry);
          else if (Array.isArray(body.ids)) ids = body.ids.filter((one): one is string => typeof one === "string").slice(0, 1000);
          else if (typeof body.job === "string") ids = await open(groups.flatMap((group) => group.jobs).find((job) => job.key === body.job)?.images.map((one) => one.id) ?? []);
          else if (typeof body.group === "string") ids = await open(groups.find((group) => group.id === body.group)?.jobs.flatMap((job) => job.images.map((one) => one.id)) ?? [], limit);
          else if (limit) ids = await open(allIds(), limit);
          if (ids.length === 0) {
            return bad(
              "nothing-to-queue",
              body.retry === "failed" ? "No failed pictures to retry." : body.retry === "rejected" ? "No rejected pictures to redraw." : "Nothing new to queue there: everything has been made, is waiting, or is in review. Failed and rejected ones have their own Retry buttons.",
            );
          }
          return json(await enqueue(deps, ids));
        }
        case "work": {
          // A run is one press of Start making; its id lets the server keep the run's spending limit across every lane.
          const runId = typeof body.runId === "string" && /^[a-z0-9-]{6,64}$/i.test(body.runId) ? body.runId : undefined;
          return json(await work(deps, runId ? { runId } : {}));
        }
        case "soften": {
          // The refusal helper: the item's words with the filter-tripping ones swapped. Shown, never sent, until the admin confirms with Redo.
          if (typeof body.id !== "string") return bad("invalid", "Which item?");
          const image = (await factory.catalogue()).byId.get(body.id);
          if (!image) return bad("art-job-unknown", "The catalogue no longer lists that item.", 404);
          const words = (await factory.store.entry(body.id))?.prompt ?? image.prompt;
          return json({ id: body.id, before: words, ...softenWords(words) });
        }
        case "approve":
        case "reject":
        case "redo":
        case "put-back":
        case "retry-hook": {
          if (typeof body.id !== "string") return bad("invalid", "Which item?");
          if (body.action === "redo" && body.provider !== undefined) {
            const asked = readProviderName(body.provider);
            if (!asked || asked === "practice") return bad("invalid", "Try the other provider: OpenAI or Google.");
            if (!siteKeyFor(asked, factory.env, factory.config.keyNames)) return bad("not-configured", `${asked === "openai" ? "OpenAI" : "Google"} is not set up: its key is not in the environment variables.`);
          }
          const result =
            body.action === "approve"
              ? await approve(deps, body.id)
              : body.action === "reject"
                ? await reject(deps, body.id)
                : body.action === "put-back"
                  ? await putBack(deps, body.id)
                  : body.action === "retry-hook"
                    ? await retryHook(deps, body.id)
                    : await redo(deps, body.id, body.prompt === null ? null : typeof body.prompt === "string" ? body.prompt : undefined, typeof body.provider === "string" ? { provider: body.provider } : {});
          if (!result.ok) return bad(result.code, result.message, result.code === "art-job-unknown" ? 404 : result.code === "store-failed" ? 502 : 409);
          return json(result.warning ? { ...result.entry, warning: result.warning } : result.entry);
        }
        case "text": {
          if (typeof body.id !== "string") return bad("invalid", "Which item?");
          if (body.text !== null && typeof body.text !== "string") return bad("invalid", "The alt text or caption is some words, or nothing to go back to the catalogue's.");
          const result = await setText(deps, body.id, body.text);
          if (!result.ok) return bad(result.code, result.message, 404);
          return json({ id: body.id, text: result.text });
        }
        case "unqueue":
          if (typeof body.id !== "string") return bad("invalid", "Which picture?");
          return json({ removed: await unqueue(deps, body.id) });
        case "clear-queue":
          return json({ removed: await clearQueue(deps) });
        case "style": {
          if (typeof body.group !== "string" || !groups.some((group) => group.id === body.group)) return bad("invalid", "Which group?");
          const text = body.text === null ? null : typeof body.text === "string" ? body.text.trim().slice(0, 2000) : undefined;
          if (text === undefined) return bad("invalid", "The style is some words, or nothing to go back to the default.");
          const group = groups.find((one) => one.id === body.group)!;
          await factory.store.setStyle(body.group, text === "" ? null : text, group.style ?? "");
          return json({ group: body.group, style: styleFor(group, await factory.store.styles()) });
        }
        case "settings": {
          const current = await factory.store.settings();
          const perMinute = body.perMinute === undefined ? current.perMinute : Number(body.perMinute);
          const concurrency = body.concurrency === undefined ? current.concurrency : Number(body.concurrency);
          if (!Number.isInteger(perMinute) || perMinute < 1 || perMinute > 60 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) return bad("invalid", "Pace is 1 to 60 pictures a minute, and 1 to 4 at once.");
          let runLimitUsd = current.runLimitUsd;
          if (body.runLimitUsd !== undefined) {
            const limit = body.runLimitUsd === null || body.runLimitUsd === "" ? null : money(body.runLimitUsd, false);
            if (limit === null && body.runLimitUsd !== null && body.runLimitUsd !== "") return bad("invalid", "The run limit is an amount in dollars, like 5, or empty for no limit.");
            runLimitUsd = limit;
          }
          return json(await factory.store.saveSettings({ perMinute, concurrency, runLimitUsd }));
        }
        default:
          return bad("invalid", "Unknown action.");
      }
    },

    async settingsGet(request) {
      if (!(await factory.isAdmin(request))) return notFound();
      return json(await settingsView());
    },

    async settingsPost(request) {
      if (!(await factory.isAdmin(request))) return notFound();
      const body = await readBody<{ dailyCap?: unknown; provider?: unknown; openaiModel?: unknown; openaiQuality?: unknown }>(request);
      const current = await factory.settings.read();
      const dailyCap = body.dailyCap === undefined ? current.dailyCap : readDailyCap(body.dailyCap);
      if (dailyCap === undefined) return bad("invalid", "The limit is a whole number from 0 to 10,000, or no limit.");
      let provider = current.provider;
      if (body.provider !== undefined) {
        const asked = readProviderName(body.provider);
        if (!asked || (asked === "practice" && !factory.config.practice)) return bad("invalid", "Pick OpenAI, Google or Practice.");
        if (asked !== "practice" && !siteKeyFor(asked, factory.env, factory.config.keyNames)) return bad("not-configured", `${asked === "openai" ? "OpenAI" : "Google"} is not set up: its key is not in the environment variables.`);
        provider = asked;
      }
      const openaiModel = body.openaiModel === undefined ? current.openaiModel : readOpenAiModel(body.openaiModel);
      if (body.openaiModel !== undefined && !openaiModel) return bad("invalid", "Pick one of the OpenAI models listed.");
      const openaiQuality = body.openaiQuality === undefined ? current.openaiQuality : readOpenAiQuality(body.openaiQuality);
      if (body.openaiQuality !== undefined && !openaiQuality) return bad("invalid", "Quality is low, medium or high.");
      await factory.settings.write({ dailyCap, ...(provider ? { provider } : {}), ...(openaiModel ? { openaiModel } : {}), ...(openaiQuality ? { openaiQuality } : {}) });
      return json(await settingsView());
    },

    async usageGet(request) {
      if (!(await factory.isAdmin(request))) return notFound();
      return json(await usageView());
    },

    async usagePost(request) {
      if (!(await factory.isAdmin(request))) return notFound();
      const body = await readBody<Record<string, unknown>>(request);
      const provider = body.provider;
      if ((body.action === "set-balance" || body.action === "top-up" || body.action === "wallet-settings") && !isUsageProvider(provider)) return bad("invalid", "Pick a provider.");
      switch (body.action) {
        case "set-balance": {
          const amount = money(body.amountUsd);
          if (amount === null) return bad("invalid", "Enter the balance in dollars, like 12.50.");
          await factory.usage.setBalance(provider as UsageProvider, amount);
          break;
        }
        case "top-up": {
          const amount = money(body.amountUsd, false);
          if (amount === null) return bad("invalid", "Enter how much you added, in dollars, like 20.");
          await factory.usage.topUp(provider as UsageProvider, amount);
          break;
        }
        case "wallet-settings": {
          const warn = body.warnBelowUsd === undefined ? undefined : money(body.warnBelowUsd);
          if (warn === null) return bad("invalid", "Enter the warning amount in dollars.");
          await factory.usage.setWalletSettings(provider as UsageProvider, { ...(warn !== undefined ? { warnBelowUsd: warn } : {}), ...(typeof body.stopAtZero === "boolean" ? { stopAtZero: body.stopAtZero } : {}) });
          break;
        }
        case "set-price": {
          const model = typeof body.model === "string" ? body.model.trim() : "";
          const input = body.inputPerMillion === undefined && body.unit !== undefined ? 0 : money(body.inputPerMillion);
          const output = body.outputPerMillion === undefined && body.unit !== undefined ? 0 : money(body.outputPerMillion);
          if (!model || input === null || output === null) return bad("invalid", "Enter a model and both prices per million tokens.");
          // A model billed by characters, seconds or pictures: its price for one of them.
          if (body.unit !== undefined) {
            const perUnit = money(body.perUnit);
            if (!isCountedUnit(body.unit) || perUnit === null) return bad("invalid", "A price by the unit needs the unit (characters, seconds or pictures) and dollars for one.");
            await factory.usage.setPrice(model, { inputPerMillion: input, outputPerMillion: output, unit: body.unit, perUnit });
          } else await factory.usage.setPrice(model, { inputPerMillion: input, outputPerMillion: output });
          break;
        }
        case "clear-price": {
          const model = typeof body.model === "string" ? body.model.trim() : "";
          if (!model) return bad("invalid", "Which model?");
          await factory.usage.setPrice(model, null);
          break;
        }
        default:
          return bad("invalid", "Unknown action.");
      }
      return json(await usageView());
    },

    /** Every stored picture, through the app. Approved art is cached at the edge for a day; the review tray only privately. */
    async file(request) {
      const key = tail(request, artFilePrefix);
      const allowed = key.startsWith("art/") || key.startsWith("made/") || key.startsWith("art-factory/review/") || key.startsWith("art-factory/previous/");
      if (!allowed || !safeKey(key)) return notFound();
      try {
        const found = await factory.art.open(key);
        if (!found) return notFound();
        return new Response(found.body, {
          headers: {
            "content-type": found.contentType,
            "cache-control": key.startsWith("art-factory/") ? "private, max-age=300" : "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
          },
        });
      } catch (error) {
        console.error("[art-factory] file read failed", key, error);
        return json({ error: { code: "storage-unavailable", message: "That picture could not be read from the art store." } }, 502);
      }
    },

    /** Approved art at an address that never changes: `/api/art/made/<path>`. Not approved yet: the public folder's copy, if any. */
    async made(request) {
      const path = tail(request, "/api/art/made/");
      if (!safeKey(path)) return notFound();
      const url = await approvedUrl(factory.store, path);
      const short = { "cache-control": "public, max-age=300" };
      // Short-lived: a redone picture is written to the same address, and browsers should see it within minutes.
      if (url) return new Response(null, { status: 307, headers: { location: new URL(url, request.url).toString(), ...short } });
      if (factory.config.fallbackToPublic) return new Response(null, { status: 307, headers: { location: new URL(`/${path}`, request.url).toString(), ...short } });
      return notFound();
    },

    async makeGet(request) {
      const admin = await factory.isAdmin(request);
      const who = (await factory.whoIs(request)) ?? (admin ? "admin" : null);
      const settings = await factory.settings.read();
      const on = activeProvider(factory.env, settings.provider, options) !== null;
      const used = who ? await usedToday(factory.makeArtDeps(), who) : 0;
      const cap = admin ? null : settings.dailyCap;
      return json({
        allowed: who !== null,
        on,
        admin,
        cap,
        remaining: cap === null ? null : Math.max(0, cap - used),
        kinds: Object.fromEntries(Object.entries(factory.kinds).map(([id, kind]) => [id, { label: kind.label, aspect: kind.aspect, style: kind.style }])),
      });
    },

    async makePost(request) {
      const admin = await factory.isAdmin(request);
      const body = await readBody<{ prompt?: unknown; kind?: unknown; subject?: unknown }>(request);
      const prompt = body.prompt ?? (body.subject && typeof body.subject === "object" ? makeArtPrompt(body.subject as Parameters<typeof makeArtPrompt>[0], factory.kinds) : undefined);
      const result = await makeArt(factory.makeArtDeps(), { who: await factory.whoIs(request), admin, prompt, kind: body.kind });
      if (!result.ok) {
        const status = result.code === "not-allowed" ? 403 : result.code === "art-cap-reached" ? 429 : result.code === "art-provider-off" ? 503 : result.code === "art-failed" || result.code === "store-failed" ? 502 : 400;
        return bad(result.code, result.message, status);
      }
      return json(result);
    },

    async textGet() {
      const [{ groups }, texts] = await Promise.all([factory.catalogue(), factory.store.texts()]);
      const files: Record<string, { alt: string } | { caption: string }> = {};
      for (const group of groups) for (const job of group.jobs) for (const image of job.images) {
        const text = textFor(image, texts);
        if (!text) continue;
        const sound = isSound(kindOf(image));
        for (const path of sound ? [image.target] : image.outputs.map((one) => one.path)) files[path] = sound ? { caption: text } : { alt: text };
      }
      // Short-lived: an alt text edited in review should reach the app within minutes.
      return json({ files }, 200, { "cache-control": "public, max-age=300" });
    },

    async loginPost(request) {
      const body = (await request.clone().json().catch(() => null)) as { action?: string } | null;
      if (body?.action === "logout") return factory.gate.logout();
      return factory.gate.login(request);
    },

    async sessionGet(request) {
      return json({ admin: await factory.isAdmin(request), gate: factory.config.isAdmin ? "custom" : factory.gate.mode(), appName: factory.config.appName });
    },
  };
}
