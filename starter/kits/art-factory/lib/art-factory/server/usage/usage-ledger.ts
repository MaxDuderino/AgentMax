import { parseJson, type Kv } from "../kv";
import { costMicros, priceFor, providerNames, usageProviders, type ModelPrice, type PriceOverrides, type UsageProvider } from "./price-table";
import { failureLabels, type BilledTo, type FailureKind, type UsageEvent, type UsageMeter } from "./usage-event";

/**
 * The AI usage ledger (ported from DnD-Max, Issue 401): counters by hour, day
 * and month, kept forever.
 *
 * > "monthly history and why not save it no reason to delete after whatever
 * > days." (Max, 2026-10-13)
 *
 * Everything is a **counter in a hash**, one field per
 * provider/model/who-pays/measure, so a busy day is one small hash and
 * nothing has to be pruned. Money is kept in **micro-dollars** so every
 * counter stays an integer.
 *
 * The **wallet** exists because no provider tells an app how much prepaid
 * credit is left. The admin types in the balance the provider's console
 * shows, and the ledger counts down from it with its own estimate.
 *
 * Reading never moves a counter.
 */
export function dayOf(now: Date): string {
  return now.toISOString().slice(0, 10);
}
const monthOf = (now: Date) => now.toISOString().slice(0, 7);
const hourOf = (now: Date) => now.toISOString().slice(0, 13);
function addDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return dayOf(date);
}

export interface Tally {
  answered: number;
  failed: number;
  failures: Partial<Record<FailureKind, number>>;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  /** Calls with tokens but no price row: counted, never guessed at. */
  unpriced: number;
}

export interface UsageLine extends Tally {
  provider: UsageProvider;
  model: string;
  billedTo: BilledTo;
}

export function emptyTally(): Tally {
  return { answered: 0, failed: 0, failures: {}, inputTokens: 0, outputTokens: 0, costMicros: 0, unpriced: 0 };
}

function addInto(target: Tally, measure: string, value: number): void {
  if (measure === "answered") target.answered += value;
  else if (measure === "failed") target.failed += value;
  else if (measure === "in") target.inputTokens += value;
  else if (measure === "out") target.outputTokens += value;
  else if (measure === "cost") target.costMicros += value;
  else if (measure === "unpriced") target.unpriced += value;
  else if (measure.startsWith("failed:")) {
    const kind = measure.slice("failed:".length) as FailureKind;
    target.failures[kind] = (target.failures[kind] ?? 0) + value;
  }
}

/** One period hash (`provider|model|billedTo|measure` fields) as lines. */
export function linesFrom(hash: Readonly<Record<string, string | number>>): UsageLine[] {
  const lines = new Map<string, UsageLine>();
  for (const [field, raw] of Object.entries(hash)) {
    const value = Number(raw);
    const parts = field.split("|");
    if (parts.length !== 4 || !Number.isFinite(value)) continue;
    const [provider, model, billedTo, measure] = parts as [UsageProvider, string, BilledTo, string];
    const id = `${provider}|${model}|${billedTo}`;
    const line = lines.get(id) ?? { provider, model, billedTo, ...emptyTally() };
    addInto(line, measure, value);
    lines.set(id, line);
  }
  return [...lines.values()].sort((a, b) => b.answered + b.failed - (a.answered + a.failed) || a.model.localeCompare(b.model));
}

export function sumLines(lines: readonly Tally[]): Tally {
  const total = emptyTally();
  for (const line of lines) {
    total.answered += line.answered;
    total.failed += line.failed;
    total.inputTokens += line.inputTokens;
    total.outputTokens += line.outputTokens;
    total.costMicros += line.costMicros;
    total.unpriced += line.unpriced;
    for (const [kind, count] of Object.entries(line.failures)) total.failures[kind as FailureKind] = (total.failures[kind as FailureKind] ?? 0) + (count ?? 0);
  }
  return total;
}

// ---------------------------------------------------------------- wallet

export interface WalletEntry {
  at: string;
  kind: "set" | "topup";
  amountUsd: number;
}

export interface WalletState {
  /** What the admin said the balance was, plus top-ups since. `null` = never set. */
  balanceUsd: number | null;
  /** The site's running spend for this provider when the balance was set. */
  spentMicrosAtSet: number;
  setAt: string | null;
  warnBelowUsd: number;
  /** Stop calling this provider once the estimate reaches zero. Off by default, because estimates drift. */
  stopAtZero: boolean;
  history: WalletEntry[];
}

export const defaultWallet: WalletState = { balanceUsd: null, spentMicrosAtSet: 0, setAt: null, warnBelowUsd: 2, stopAtZero: false, history: [] };

export function remainingUsd(wallet: WalletState, spentMicros: number): number | null {
  return wallet.balanceUsd === null ? null : wallet.balanceUsd - (spentMicros - wallet.spentMicrosAtSet) / 1_000_000;
}

export interface ProviderProblem {
  at: string;
  kind: FailureKind;
  model: string;
  detail: string;
}

/** Failures that will not fix themselves: the ones worth a red banner. */
const standingKinds: ReadonlySet<FailureKind> = new Set(["no-credit", "bad-key", "model-missing"]);

export interface ProviderSummary {
  provider: UsageProvider;
  name: string;
  wallet: WalletState;
  remainingUsd: number | null;
  spentMicros: number;
  problem: ProviderProblem | null;
  lastOkAt: string | null;
}

export interface UsageSnapshot {
  now: string;
  firstDay: string | null;
  today: UsageLine[];
  lastHour: UsageLine[];
  /** Newest first, up to 31 days. */
  days: { day: string; lines: UsageLine[] }[];
  /** Newest first, every month since the ledger began. */
  months: { month: string; lines: UsageLine[] }[];
  tagsToday: { tag: string; site: Tally; ownKey: Tally }[];
  providers: ProviderSummary[];
  warnings: string[];
  priceOverrides: PriceOverrides;
}

export class UsageLedger implements UsageMeter {
  readonly #kv: Kv;
  readonly #prefix: string;
  readonly #clock: () => Date;
  #overrides: { value: PriceOverrides; at: number } | null = null;
  #skip = new Map<UsageProvider, { value: boolean; at: number }>();

  constructor(kv: Kv, prefix: string, clock: () => Date = () => new Date()) {
    this.#kv = kv;
    this.#prefix = prefix;
    this.#clock = clock;
  }

  #key(rest: string) {
    return `${this.#prefix}:usage:${rest}`;
  }

  async #priceOverrides(): Promise<PriceOverrides> {
    const now = Date.now();
    if (this.#overrides && now - this.#overrides.at < 60_000) return this.#overrides.value;
    const value = parseJson<PriceOverrides>(await this.#kv.get(this.#key("prices"))) ?? {};
    this.#overrides = { value, at: now };
    return value;
  }

  /** Never throws: a broken counter must not cost a picture or a line. */
  async record(event: UsageEvent): Promise<void> {
    try {
      await this.#record(event);
    } catch (error) {
      console.warn("[art-factory] could not record an AI call", error);
    }
  }

  async #record(event: UsageEvent): Promise<void> {
    const now = this.#clock();
    const day = dayOf(now);
    const price = priceFor(event.provider, event.resolvedModel ?? event.model, day, await this.#priceOverrides());
    const tokens = event.inputTokens + event.outputTokens;
    const cost = price ? costMicros(price, event.inputTokens, event.outputTokens) : 0;

    // A purpose rides on the model's name (`gpt-image-1.5 · art-factory`), so the table shows it as its own line.
    const shown = event.purpose ? `${event.model} · ${event.purpose.replace(/\|/g, "")}` : event.model;
    const base = `${event.provider}|${shown.replace(/\|/g, "")}|${event.billedTo}`;
    const measures: [string, number][] = [[event.ok ? "answered" : "failed", 1]];
    if (!event.ok) measures.push([`failed:${event.failure ?? "other"}`, 1]);
    if (event.inputTokens) measures.push(["in", event.inputTokens]);
    if (event.outputTokens) measures.push(["out", event.outputTokens]);
    if (cost) measures.push(["cost", cost]);
    if (!price && tokens > 0) measures.push(["unpriced", 1]);

    const ops: { key: string; field: string; by: number }[] = [];
    for (const [measure, by] of measures) {
      for (const key of [this.#key(`day:${day}`), this.#key(`month:${monthOf(now)}`), this.#key(`hour:${hourOf(now)}`)]) ops.push({ key, field: `${base}|${measure}`, by });
    }
    if (event.tag) {
      const tag = event.tag.replace(/\|/g, "").slice(0, 80);
      ops.push({ key: this.#key(`tags:${day}`), field: tag, by: 1 });
      for (const [measure, by] of measures) if (!measure.startsWith("failed:")) ops.push({ key: this.#key(`tag:${day}`), field: `${tag}|${event.billedTo}|${measure}`, by });
    }
    if (event.billedTo === "site" && cost) ops.push({ key: this.#key("spent"), field: event.provider, by: cost });

    const writes: Promise<unknown>[] = [
      this.#kv.hincrMany(ops, [
        { key: this.#key(`hour:${hourOf(now)}`), seconds: 60 * 60 * 72 },
        { key: this.#key(`tag:${day}`), seconds: 60 * 60 * 24 * 40 },
        { key: this.#key(`tags:${day}`), seconds: 60 * 60 * 24 * 40 },
      ]),
      this.#kv.set(this.#key("first-day"), day, { nx: true }),
    ];
    if (event.billedTo === "site") {
      if (event.ok) writes.push(this.#kv.set(this.#key(`last-ok:${event.provider}`), now.toISOString()));
      else if (event.failure && standingKinds.has(event.failure)) {
        const problem: ProviderProblem = { at: now.toISOString(), kind: event.failure, model: event.model, detail: (event.detail ?? "").slice(0, 300) };
        writes.push(this.#kv.set(this.#key(`problem:${event.provider}`), JSON.stringify(problem)));
      }
    }
    await Promise.all(writes);
  }

  /** "Stop at zero" is on and the estimate is empty. Cached 30 seconds. */
  async shouldSkip(provider: UsageProvider): Promise<boolean> {
    const cached = this.#skip.get(provider);
    if (cached && Date.now() - cached.at < 30_000) return cached.value;
    let value = false;
    try {
      const { wallet, remainingUsd: left } = await this.creditLeft(provider);
      value = wallet.stopAtZero && left !== null && left <= 0;
    } catch {
      value = false;
    }
    this.#skip.set(provider, { value, at: Date.now() });
    return value;
  }

  async creditLeft(provider: UsageProvider): Promise<{ wallet: WalletState; remainingUsd: number | null }> {
    const [wallet, spent] = await Promise.all([this.wallet(provider), this.#spent()]);
    return { wallet, remainingUsd: remainingUsd(wallet, spent[provider] ?? 0) };
  }

  async wallet(provider: UsageProvider): Promise<WalletState> {
    return { ...defaultWallet, ...(parseJson<WalletState>(await this.#kv.get(this.#key(`wallet:${provider}`))) ?? {}) };
  }

  async #spent(): Promise<Record<string, number>> {
    const hash = await this.#kv.hgetall(this.#key("spent"));
    return Object.fromEntries(Object.entries(hash).map(([field, value]) => [field, Number(value)]));
  }

  async #saveWallet(provider: UsageProvider, wallet: WalletState) {
    await this.#kv.set(this.#key(`wallet:${provider}`), JSON.stringify(wallet));
    this.#skip.delete(provider);
    return wallet;
  }

  /** "My console says $X right now." Restarts the countdown from here. */
  async setBalance(provider: UsageProvider, amountUsd: number): Promise<WalletState> {
    const [wallet, spent] = await Promise.all([this.wallet(provider), this.#spent()]);
    const at = this.#clock().toISOString();
    return this.#saveWallet(provider, { ...wallet, balanceUsd: amountUsd, spentMicrosAtSet: spent[provider] ?? 0, setAt: at, history: [{ at, kind: "set" as const, amountUsd }, ...wallet.history].slice(0, 100) });
  }

  /** "I just added $X." With no balance yet, it becomes the balance. */
  async topUp(provider: UsageProvider, amountUsd: number): Promise<WalletState> {
    const wallet = await this.wallet(provider);
    if (wallet.balanceUsd === null) return this.setBalance(provider, amountUsd);
    const at = this.#clock().toISOString();
    return this.#saveWallet(provider, { ...wallet, balanceUsd: wallet.balanceUsd + amountUsd, history: [{ at, kind: "topup" as const, amountUsd }, ...wallet.history].slice(0, 100) });
  }

  async setWalletSettings(provider: UsageProvider, settings: { warnBelowUsd?: number; stopAtZero?: boolean }): Promise<WalletState> {
    const wallet = await this.wallet(provider);
    return this.#saveWallet(provider, {
      ...wallet,
      ...(settings.warnBelowUsd !== undefined ? { warnBelowUsd: settings.warnBelowUsd } : {}),
      ...(settings.stopAtZero !== undefined ? { stopAtZero: settings.stopAtZero } : {}),
    });
  }

  /** Set (or with `null`, clear) the admin's own price for one model. */
  async setPrice(model: string, price: ModelPrice | null): Promise<PriceOverrides> {
    const current = { ...(parseJson<Record<string, ModelPrice>>(await this.#kv.get(this.#key("prices"))) ?? {}) };
    if (price) current[model] = price;
    else delete current[model];
    await this.#kv.set(this.#key("prices"), JSON.stringify(current));
    this.#overrides = null;
    return current;
  }

  async priceOverrides(): Promise<PriceOverrides> {
    return parseJson<PriceOverrides>(await this.#kv.get(this.#key("prices"))) ?? {};
  }

  async snapshot(): Promise<UsageSnapshot> {
    const now = this.#clock();
    const today = dayOf(now);
    const firstDay = await this.#kv.get(this.#key("first-day"));
    const start = firstDay ?? today;

    const dayList: string[] = [];
    for (let back = 0; back < 31; back += 1) {
      const day = addDays(today, -back);
      if (day < start) break;
      dayList.push(day);
    }
    const monthList: string[] = [];
    const cursor = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    while (monthOf(cursor) >= start.slice(0, 7) && monthList.length < 600) {
      monthList.push(monthOf(cursor));
      cursor.setUTCMonth(cursor.getUTCMonth() - 1);
    }

    const [dayHashes, monthHashes, hourHashes, [tagsHash, tagHash, spentHash]] = await Promise.all([
      this.#kv.hgetallMany(dayList.map((day) => this.#key(`day:${day}`))),
      this.#kv.hgetallMany(monthList.map((month) => this.#key(`month:${month}`))),
      this.#kv.hgetallMany([this.#key(`hour:${hourOf(now)}`), this.#key(`hour:${hourOf(new Date(now.getTime() - 3_600_000))}`)]),
      this.#kv.hgetallMany([this.#key(`tags:${today}`), this.#key(`tag:${today}`), this.#key("spent")]),
    ]);

    const topTags = Object.entries(tagsHash ?? {})
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 25)
      .map(([tag]) => tag);
    const tagsToday = topTags.map((tag) => {
      const site = emptyTally();
      const ownKey = emptyTally();
      for (const [field, raw] of Object.entries(tagHash ?? {})) {
        const [name, billedTo, measure] = field.split("|");
        if (name === tag && measure) addInto(billedTo === "own-key" ? ownKey : site, measure, Number(raw));
      }
      return { tag, site, ownKey };
    });

    const providers: ProviderSummary[] = await Promise.all(
      usageProviders.map(async (provider) => {
        const [wallet, problem, lastOkAt] = await Promise.all([
          this.wallet(provider),
          this.#kv.get(this.#key(`problem:${provider}`)).then((raw) => parseJson<ProviderProblem>(raw)),
          this.#kv.get(this.#key(`last-ok:${provider}`)),
        ]);
        const spentMicros = Number(spentHash?.[provider] ?? 0);
        const unresolved = problem && (!lastOkAt || problem.at > lastOkAt) ? problem : null;
        return { provider, name: providerNames[provider], wallet, remainingUsd: remainingUsd(wallet, spentMicros), spentMicros, problem: unresolved, lastOkAt };
      }),
    );

    const merged: Record<string, number> = {};
    for (const hash of hourHashes) for (const [field, value] of Object.entries(hash)) merged[field] = (merged[field] ?? 0) + Number(value);
    const todayLines = linesFrom(dayHashes[0] ?? {});
    const lastHour = linesFrom(merged);

    return {
      now: now.toISOString(),
      firstDay,
      today: todayLines,
      lastHour,
      days: dayList.map((day, index) => ({ day, lines: linesFrom(dayHashes[index] ?? {}) })),
      months: monthList.map((month, index) => ({ month, lines: linesFrom(monthHashes[index] ?? {}) })),
      tagsToday,
      providers,
      warnings: warningsFor(providers, lastHour, todayLines),
      priceOverrides: await this.priceOverrides(),
    };
  }
}

const money = (usd: number) => `$${usd.toFixed(2)}`;

/** The plain-English warning lines at the top of the usage panel. */
export function warningsFor(providers: readonly ProviderSummary[], lastHour: readonly UsageLine[], today: readonly UsageLine[]): string[] {
  const warnings: string[] = [];
  for (const summary of providers) {
    if (summary.problem) {
      warnings.push(`${summary.name} is ${failureLabels[summary.problem.kind]} (${summary.problem.model}) since ${summary.problem.at.slice(0, 16).replace("T", " ")} UTC. Nothing on it will work until that is fixed.`);
    }
    if (summary.remainingUsd !== null) {
      if (summary.remainingUsd <= 0) warnings.push(`${summary.name}'s estimated credit is used up${summary.wallet.stopAtZero ? ", so the app has stopped asking it" : ""}. Top up, then record it below.`);
      else if (summary.remainingUsd < summary.wallet.warnBelowUsd) warnings.push(`${summary.name} has about ${money(summary.remainingUsd)} of credit left.`);
    }
  }
  for (const provider of usageProviders) {
    const hour = sumLines(lastHour.filter((line) => line.provider === provider && line.billedTo === "site"));
    const day = sumLines(today.filter((line) => line.provider === provider && line.billedTo === "site"));
    if (warnings.some((line) => line.startsWith(providerNames[provider]))) continue;
    if (hour.failed >= 5 && hour.failed > hour.answered) warnings.push(`${providerNames[provider]} is failing: ${hour.failed} of ${hour.failed + hour.answered} calls in the last hour or so.`);
    else if (day.failed >= 10 && day.failed > day.answered) warnings.push(`${providerNames[provider]} has failed ${day.failed} of ${day.failed + day.answered} calls today.`);
  }
  return warnings;
}
