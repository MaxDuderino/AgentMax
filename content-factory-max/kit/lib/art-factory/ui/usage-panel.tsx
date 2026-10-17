"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { artApi, read } from "./api";

/**
 * AI usage & credits (ported from DnD-Max, Issue 401).
 *
 * > "i probably need some sort of AI API usage tracker or something so i can
 * > quickly see what has been used" (Max, 2026-10-13)
 *
 * No provider auto-renews prepaid credit, so the panel leads with **what is
 * left**, then what was used, by what, and whether it worked. Every dollar
 * the app works out itself is labelled "about".
 */
/** Any provider id: the four the kit knows, and any other maker a project plugs in. */
type Provider = string;

type Unit = "characters" | "seconds" | "images";

const unitWords: Record<Unit, { one: string; many: string }> = { characters: { one: "character", many: "characters" }, seconds: { one: "second", many: "seconds" }, images: { one: "picture", many: "pictures" } };

interface Tally {
  answered: number;
  failed: number;
  failures: Record<string, number>;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  unpriced: number;
  /** Characters, seconds and pictures, for calls billed by those (older reports have none). */
  units?: Partial<Record<Unit, number>>;
}

interface Line extends Tally {
  provider: Provider;
  model: string;
  billedTo: "site" | "own-key";
}

interface Summary {
  provider: Provider;
  name: string;
  wallet: { balanceUsd: number | null; setAt: string | null; warnBelowUsd: number; stopAtZero: boolean; history: { at: string; kind: "set" | "topup"; amountUsd: number }[] };
  remainingUsd: number | null;
  spentMicros: number;
  problem: { at: string; kind: string; model: string; detail: string } | null;
  lastOkAt: string | null;
}

interface Report {
  appName: string;
  firstDay: string | null;
  today: Line[];
  lastHour: Line[];
  days: { day: string; lines: Line[] }[];
  months: { month: string; lines: Line[] }[];
  tagsToday: { tag: string; site: Tally; ownKey: Tally }[];
  providers: Summary[];
  warnings: string[];
  services: { id: string; name: string; usedFor: string; measured: string | null; canRunOut: string; dashboard: string }[];
  prices: { provider: Provider; model: string; price: { inputPerMillion: number; outputPerMillion: number; unit?: Unit; perUnit?: number } | null; overridden: boolean }[];
  pricesCheckedOn: string;
}

const failureLabels: Record<string, string> = {
  "no-credit": "out of credit",
  busy: "busy",
  timeout: "timed out",
  "bad-key": "key refused",
  "model-missing": "model not found",
  "cut-off": "cut off",
  declined: "declined",
  empty: "empty",
  network: "no connection",
  other: "other",
};

const dollars = (usd: number) => (usd > 0 && usd < 0.01 ? "under $0.01" : `$${usd.toFixed(2)}`);
const about = (micros: number) => (micros === 0 ? "$0.00" : `about ${dollars(micros / 1_000_000)}`);
const count = (value: number) => value.toLocaleString("en-US");
/** "1,200 characters · 30 seconds", or "" when a line has no units. */
const unitsLine = (units: Tally["units"]) =>
  Object.entries(units ?? {})
    .filter(([, n]) => n)
    .map(([unit, n]) => `${count(Math.round(n! * 10) / 10)} ${n === 1 ? unitWords[unit as Unit].one : unitWords[unit as Unit].many}`)
    .join(" · ");
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never");

function sum(lines: readonly Tally[]): Tally {
  const total: Tally = { answered: 0, failed: 0, failures: {}, inputTokens: 0, outputTokens: 0, costMicros: 0, unpriced: 0, units: {} };
  for (const line of lines) {
    total.answered += line.answered;
    total.failed += line.failed;
    total.inputTokens += line.inputTokens;
    total.outputTokens += line.outputTokens;
    total.costMicros += line.costMicros;
    total.unpriced += line.unpriced;
    for (const [kind, n] of Object.entries(line.failures)) total.failures[kind] = (total.failures[kind] ?? 0) + n;
    for (const [unit, n] of Object.entries(line.units ?? {})) total.units![unit as Unit] = (total.units![unit as Unit] ?? 0) + (n ?? 0);
  }
  return total;
}

const siteOnly = (lines: readonly Line[], provider?: Provider) => lines.filter((line) => line.billedTo === "site" && (!provider || line.provider === provider));

export function UsagePanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [period, setPeriod] = useState("today");

  const load = useCallback(async () => {
    setLoading(true);
    setProblem(null);
    const next = await read<Report>(artApi.usage);
    if (next) setReport(next);
    else setProblem("Could not load usage.");
    setLoading(false);
  }, []);

  useEffect(() => {
    let live = true;
    void read<Report>(artApi.usage).then((next) => {
      if (!live) return;
      if (next) setReport(next);
      else setProblem("Could not load usage. Are you signed in as the admin?");
    });
    return () => {
      live = false;
    };
  }, []);

  async function send(body: Record<string, unknown>) {
    setProblem(null);
    const response = await fetch(artApi.usage, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as (Report & { error?: { message?: string } }) | null;
    if (!response?.ok || !payload) {
      setProblem(payload?.error?.message ?? "That did not save.");
      return false;
    }
    setReport(payload);
    return true;
  }

  const grouped: Line[] = useMemo(() => {
    if (!report) return [];
    const lines =
      period === "today"
        ? report.today
        : period === "hour"
          ? report.lastHour
          : period === "week"
            ? report.days.slice(0, 7).flatMap((day) => day.lines)
            : period === "30"
              ? report.days.flatMap((day) => day.lines)
              : (report.months.find((month) => month.month === period)?.lines ?? []);
    const map = new Map<string, Line>();
    for (const line of lines) {
      const id = `${line.provider}|${line.model}|${line.billedTo}`;
      const existing = map.get(id);
      map.set(id, existing ? { ...existing, ...sum([existing, line]) } : { ...line, failures: { ...line.failures } });
    }
    return [...map.values()].sort((a, b) => b.answered + b.failed - (a.answered + a.failed));
  }, [report, period]);

  if (!report) return <div className="af-muted">{problem ? <p role="alert" className="af-bad-text">{problem}</p> : "Loading usage…"}</div>;

  const thisMonth = report.months[0];
  const maxDayCost = Math.max(1, ...report.days.map((day) => sum(siteOnly(day.lines)).costMicros));
  // The two picture makers always; Claude and ElevenLabs once the project records calls to them or sets a balance.
  const shownProviders = report.providers.filter((one) => one.provider === "openai" || one.provider === "google" || one.wallet.balanceUsd !== null || one.spentMicros > 0 || one.problem || report.months.some((month) => month.lines.some((line) => line.provider === one.provider)));
  const total = sum(siteOnly(grouped));

  return (
    <div className="af-wrap">
      <div className="af-row">
        <button type="button" className="af-btn af-go" disabled={loading} onClick={() => void load()}>
          {loading ? "Checking…" : "Refresh"}
        </button>
        <span className="af-small af-muted">Counting since {report.firstDay ?? "today"} · kept forever · dollars marked &ldquo;about&rdquo; are this app&rsquo;s estimate</span>
      </div>
      {problem ? (
        <p role="alert" className="af-bad-text">
          {problem}
        </p>
      ) : null}
      {report.warnings.length ? (
        <ul role="alert" className="af-list">
          {report.warnings.map((warning) => (
            <li key={warning} className="af-banner">
              {warning}
            </li>
          ))}
        </ul>
      ) : (
        <p className="af-muted">Nothing needs your attention.</p>
      )}

      <div className="af-grid">
        {shownProviders.map((summary) => (
          <WalletCard key={summary.provider} summary={summary} monthSiteMicros={thisMonth ? sum(siteOnly(thisMonth.lines, summary.provider)).costMicros : 0} send={send} />
        ))}
      </div>

      <section className="af-card" aria-labelledby="af-usage-period">
        <div className="af-spread">
          <h2 id="af-usage-period">What was used</h2>
          <label className="af-row af-muted">
            Show
            <select className="af-select" value={period} onChange={(event) => setPeriod(event.target.value)}>
              <option value="hour">the last hour or so</option>
              <option value="today">today (UTC)</option>
              <option value="week">the last 7 days</option>
              <option value="30">the last 30 days</option>
              {report.months.map((month) => (
                <option key={month.month} value={month.month}>
                  {month.month}
                </option>
              ))}
            </select>
          </label>
        </div>
        {grouped.length === 0 ? (
          <p className="af-muted">No AI calls in this period.</p>
        ) : (
          <div className="af-table-wrap">
            <table className="af-table" style={{ minWidth: "34rem" }}>
              <thead>
                <tr>
                  <th scope="col">Model · what for</th>
                  <th scope="col">Answered</th>
                  <th scope="col">Failed</th>
                  <th scope="col">Tokens in / out · other units</th>
                  <th scope="col">Cost</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((line) => (
                  <tr key={`${line.provider}|${line.model}|${line.billedTo}`}>
                    <td>
                      {line.model}
                      {line.billedTo === "own-key" ? <span className="af-small af-muted"> (someone&rsquo;s own key: their bill)</span> : null}
                    </td>
                    <td>{count(line.answered)}</td>
                    <td>
                      {count(line.failed)}
                      {line.failed > 0 ? (
                        <span className="af-small af-muted" style={{ display: "block" }}>
                          {Object.entries(line.failures)
                            .map(([kind, n]) => `${failureLabels[kind] ?? kind} ${n}`)
                            .join(" · ")}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {count(line.inputTokens)} / {count(line.outputTokens)}
                      {unitsLine(line.units) ? (
                        <span className="af-small af-muted" style={{ display: "block" }}>
                          {unitsLine(line.units)}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {about(line.costMicros)}
                      {line.unpriced > 0 ? (
                        <span className="af-small af-bad-text" style={{ display: "block" }}>
                          {line.unpriced} unpriced: set a price below
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700 }}>
                  <td>Site total</td>
                  <td>{count(total.answered)}</td>
                  <td>{count(total.failed)}</td>
                  <td>
                    {count(total.inputTokens)} / {count(total.outputTokens)}
                    {unitsLine(total.units) ? (
                      <span className="af-small af-muted" style={{ display: "block", fontWeight: 400 }}>
                        {unitsLine(total.units)}
                      </span>
                    ) : null}
                  </td>
                  <td>{about(total.costMicros)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="af-card" aria-labelledby="af-usage-days">
        <h2 id="af-usage-days">Day by day (last {report.days.length} {report.days.length === 1 ? "day" : "days"}, UTC)</h2>
        <ol className="af-list af-days">
          {report.days.map((day) => {
            const site = sum(siteOnly(day.lines));
            const all = sum(day.lines);
            return (
              <li key={day.day}>
                <span className="af-muted">{day.day.slice(5)}</span>
                <span className="af-bar" aria-hidden="true">
                  <span style={{ width: `${(site.costMicros / maxDayCost) * 100}%`, minWidth: site.costMicros ? 2 : 0 }} />
                </span>
                <span style={{ textAlign: "right" }}>
                  {about(site.costMicros)} · {count(all.answered + all.failed)}
                  {all.failed ? <span className="af-bad-text"> ({all.failed} failed)</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="af-card" aria-labelledby="af-usage-months">
        <h2 id="af-usage-months">Month by month</h2>
        <div className="af-table-wrap">
          <table className="af-table">
            <thead>
              <tr>
                <th scope="col">Month</th>
                {shownProviders.map((one) => (
                  <th key={one.provider} scope="col">
                    {one.name}
                  </th>
                ))}
                <th scope="col">Own keys</th>
              </tr>
            </thead>
            <tbody>
              {report.months.map((month) => (
                <tr key={month.month}>
                  <td>{month.month}</td>
                  {shownProviders.map((one) => {
                    const tally = sum(siteOnly(month.lines, one.provider));
                    return (
                      <td key={one.provider}>
                        {about(tally.costMicros)} · {count(tally.answered)} calls
                      </td>
                    );
                  })}
                  <td>{count(sum(month.lines.filter((line) => line.billedTo === "own-key")).answered)} calls</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {report.tagsToday.length ? (
        <section className="af-card" aria-labelledby="af-usage-tags">
          <h2 id="af-usage-tags">Today, by who or what</h2>
          <ul className="af-list">
            {report.tagsToday.map((tag) => (
              <li key={tag.tag} className="af-spread" style={{ borderTop: "1px solid var(--af-line)", paddingTop: 4 }}>
                <code>{tag.tag}</code>
                <span>
                  {count(tag.site.answered)} calls{tag.site.failed ? `, ${tag.site.failed} failed` : ""} · {about(tag.site.costMicros)}
                  {tag.ownKey.answered ? ` · ${tag.ownKey.answered} on their own key` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="af-card" aria-labelledby="af-usage-services">
        <h2 id="af-usage-services">Everything else that has a limit</h2>
        <ul className="af-list">
          {report.services.map((service) => (
            <li key={service.id} style={{ borderTop: "1px solid var(--af-line)", paddingTop: 8 }}>
              <p style={{ fontWeight: 650 }}>
                {service.name}{" "}
                <a href={service.dashboard} target="_blank" rel="noopener noreferrer" className="af-small">
                  open dashboard
                </a>
              </p>
              <p className="af-muted">{service.usedFor}</p>
              {service.measured ? <p>{service.measured}</p> : null}
              <p className="af-small af-muted">Can run out: {service.canRunOut}</p>
            </li>
          ))}
        </ul>
      </section>

      <PriceTable report={report} send={send} />
    </div>
  );
}

function WalletCard({ summary, monthSiteMicros, send }: { summary: Summary; monthSiteMicros: number; send: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [balance, setBalance] = useState("");
  const [added, setAdded] = useState("");
  const [warn, setWarn] = useState(String(summary.wallet.warnBelowUsd));
  const left = summary.remainingUsd;
  const low = left !== null && left < summary.wallet.warnBelowUsd;
  const id = summary.provider;

  return (
    <section className={`af-card ${summary.problem || low ? "af-warn" : ""}`} aria-label={`${summary.name} credit`}>
      <h3>{summary.name}</h3>
      <p className={`af-big-number ${low ? "af-bad-text" : ""}`}>{left === null ? "Balance not set" : `about ${dollars(Math.max(left, 0))} left`}</p>
      <p className="af-small af-muted">
        {summary.wallet.setAt ? `Counting down since you set it on ${when(summary.wallet.setAt)}.` : "Type in what your console shows to start the countdown."} This month: {about(monthSiteMicros)}. Last good answer: {when(summary.lastOkAt)}.
      </p>
      {summary.problem ? (
        <p className="af-bad-text">
          {failureLabels[summary.problem.kind] ?? summary.problem.kind} since {when(summary.problem.at)}: {summary.problem.detail}
        </p>
      ) : null}
      <form
        className="af-row"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await send({ action: "set-balance", provider: id, amountUsd: Number(balance) })) setBalance("");
        }}
      >
        <label htmlFor={`af-balance-${id}`} className="af-muted">
          Console says $
        </label>
        <input id={`af-balance-${id}`} className="af-input af-narrow" inputMode="decimal" value={balance} onChange={(event) => setBalance(event.target.value)} />
        <button type="submit" className="af-btn af-go" disabled={!balance}>
          Set balance
        </button>
      </form>
      <form
        className="af-row"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await send({ action: "top-up", provider: id, amountUsd: Number(added) })) setAdded("");
        }}
      >
        <label htmlFor={`af-topup-${id}`} className="af-muted">
          I just added $
        </label>
        <input id={`af-topup-${id}`} className="af-input af-narrow" inputMode="decimal" value={added} onChange={(event) => setAdded(event.target.value)} />
        <button type="submit" className="af-btn af-go" disabled={!added}>
          Add top-up
        </button>
      </form>
      <form
        className="af-row"
        onSubmit={async (event) => {
          event.preventDefault();
          await send({ action: "wallet-settings", provider: id, warnBelowUsd: Number(warn) });
        }}
      >
        <label htmlFor={`af-warn-${id}`} className="af-muted">
          Warn me below $
        </label>
        <input id={`af-warn-${id}`} className="af-input af-narrow" inputMode="decimal" value={warn} onChange={(event) => setWarn(event.target.value)} />
        <button type="submit" className="af-btn">
          Save
        </button>
      </form>
      <label className="af-row" style={{ alignItems: "flex-start" }}>
        <input type="checkbox" style={{ marginTop: 4 }} checked={summary.wallet.stopAtZero} onChange={(event) => void send({ action: "wallet-settings", provider: id, stopAtZero: event.target.checked })} />
        <span>
          Stop asking {summary.name} when the estimate reaches $0
          <span className="af-small af-muted" style={{ display: "block" }}>
            The factory pauses instead of failing every picture. Off by default, because the estimate can drift.
          </span>
        </span>
      </label>
      {summary.wallet.history.length ? (
        <details>
          <summary className="af-small af-muted">Balance history</summary>
          <ul className="af-small af-muted">
            {summary.wallet.history.map((entry) => (
              <li key={`${entry.at}-${entry.kind}`}>
                {when(entry.at)}: {entry.kind === "set" ? "set to" : "added"} {dollars(entry.amountUsd)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function PriceTable({ report, send }: { report: Report; send: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [model, setModel] = useState("");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [unit, setUnit] = useState<"tokens" | Unit>("tokens");
  const [perUnit, setPerUnit] = useState("");
  const byTokens = unit === "tokens";
  return (
    <section className="af-card" aria-labelledby="af-usage-prices">
      <h2 id="af-usage-prices">Prices used for the estimates</h2>
      <p className="af-small af-muted">
        Per million tokens, or per character, second or picture for makers billed that way (voices, sounds), checked {report.pricesCheckedOn}. Providers change prices without telling the app: if one is wrong, set it here and every call from now on uses yours.
      </p>
      {report.prices.length ? (
        <ul className="af-list">
          {report.prices.map((row) => (
            <li key={`${row.provider}|${row.model}`} className="af-spread" style={{ borderTop: "1px solid var(--af-line)", paddingTop: 4 }}>
              <span>{row.model}</span>
              <span className="af-muted">
                {row.price ? `$${row.price.inputPerMillion} in / $${row.price.outputPerMillion} out` : "no price"}
                {row.price?.unit ? ` · $${row.price.perUnit} a ${unitWords[row.price.unit].one}` : ""}
                {row.overridden ? (
                  <>
                    {" "}
                    (yours){" "}
                    <button type="button" className="af-btn" onClick={() => void send({ action: "clear-price", model: row.model })}>
                      reset
                    </button>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="af-row"
        onSubmit={async (event) => {
          event.preventDefault();
          const body = byTokens ? { action: "set-price", model, inputPerMillion: Number(input), outputPerMillion: Number(output) } : { action: "set-price", model, unit, perUnit: Number(perUnit) };
          if (await send(body)) {
            setModel("");
            setInput("");
            setOutput("");
            setPerUnit("");
          }
        }}
      >
        <input aria-label="Model id" placeholder="model id" className="af-input" value={model} onChange={(event) => setModel(event.target.value)} />
        <label className="af-row af-small">
          billed by
          <select aria-label="What the model is billed by" className="af-input" value={unit} onChange={(event) => setUnit(event.target.value as "tokens" | Unit)}>
            <option value="tokens">tokens</option>
            <option value="characters">characters</option>
            <option value="seconds">seconds</option>
            <option value="images">pictures</option>
          </select>
        </label>
        {byTokens ? (
          <>
            <input aria-label="Input price per million tokens" placeholder="$ in" className="af-input af-narrow" value={input} onChange={(event) => setInput(event.target.value)} />
            <input aria-label="Output price per million tokens" placeholder="$ out" className="af-input af-narrow" value={output} onChange={(event) => setOutput(event.target.value)} />
          </>
        ) : (
          <input aria-label={`Dollars for one ${unitWords[unit].one}`} placeholder={`$ a ${unitWords[unit].one}`} className="af-input af-narrow" value={perUnit} onChange={(event) => setPerUnit(event.target.value)} />
        )}
        <button type="submit" className="af-btn af-go" disabled={!model || (byTokens ? !input || !output : !perUnit)}>
          Set price
        </button>
      </form>
    </section>
  );
}
