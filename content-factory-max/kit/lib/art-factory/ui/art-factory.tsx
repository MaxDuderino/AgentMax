"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { artApi, money, read, send } from "./api";
import { ActionButton, isSoundKind, kindWords, post, SoundPlayer, statusLabel, TextEditor, type Cost, type Entry, type GroupRow, type ImageRow, type JobRow, type Kind, type Settings, type Status } from "./factory-shared";
import { ItemBrowser, RefusalHelper, ReviewMode } from "./factory-views";
import { MakeArtLimit, PictureMakerPicker } from "./picture-maker-picker";

/**
 * Content Factory MAX's page (ported from DnD-Max's Art Factory, Issue 421):
 * every item in the catalogue (pictures, voice lines, sound effects, music),
 * made in a queue, reviewed one at a time.
 *
 * The page drives the queue: **Start making** asks the server for one item at
 * a time (or a few, at the pace set below) for as long as the page is open.
 * The queue itself lives on the server, so closing the tab only pauses it.
 * Each press is one **run**, which stops at its spending limit.
 */
interface State {
  appName: string;
  gate: string;
  groups: GroupRow[];
  entries: Record<string, Entry>;
  settings: Settings;
  approvedFiles: number;
  activeProvider: string | null;
  store: "r2" | "memory";
  memory: "redis" | "memory";
  cost: Cost;
  /** Which maker is on for each sound kind, or null. */
  makers?: Partial<Record<Kind, string | null>>;
  /** The real picture makers with a key set, for the refusal helper's "try the other one". */
  pictureMakers?: string[];
}

type WorkAnswer = { kind: "idle" } | { kind: "off"; message: string } | { kind: "wait"; ms: number; reason?: string } | { kind: "made" | "failed"; imageId: string };


const newRunId = () => `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const fetchState = () => read<State>(artApi.factory);

export function ArtFactory() {
  const [state, setState] = useState<State | null | undefined>(undefined);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [nextN, setNextN] = useState("10");
  const [view, setView] = useState<"jobs" | "grid">("jobs");
  const [reviewing, setReviewing] = useState(false);
  const runningRef = useRef(false);
  const runRef = useRef<string>(newRunId());

  const reload = useCallback(async () => {
    const next = await fetchState();
    if (next) setState(next);
  }, []);

  const refreshEntries = useCallback(async () => {
    const answer = await read<{ entries: Record<string, Entry> }>(`${artApi.factory}?only=entries`);
    if (answer) setState((current) => (current ? { ...current, entries: answer.entries } : current));
  }, []);

  useEffect(() => {
    let live = true;
    void fetchState().then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, []);

  const images = useMemo(() => {
    const map = new Map<string, { image: ImageRow; job: JobRow; group: GroupRow }>();
    for (const group of state?.groups ?? []) for (const job of group.jobs) for (const image of job.images) if (!map.has(image.id)) map.set(image.id, { image, job, group });
    return map;
  }, [state?.groups]);

  const counts = useMemo(() => {
    const out: Record<Status, number> = { queued: 0, making: 0, review: 0, approved: 0, rejected: 0, failed: 0 };
    for (const id of images.keys()) {
      const entry = state?.entries[id];
      if (entry) out[entry.status] += 1;
    }
    return out;
  }, [images, state?.entries]);

  const tally = useMemo(() => {
    const cost = state?.cost;
    // Pictures are estimated from the switched-on picture maker; sounds are not estimated yet (the usage page counts them as they are made).
    const priceOf = (image: ImageRow) => (isSoundKind(image.kind) ? 0 : ((image.aspect === "1:1" ? cost?.usd : cost?.usdOther) ?? 0));
    let queued = 0;
    let queuedCount = 0;
    let open = 0;
    let spent = 0;
    let drawn = 0;
    for (const [id, { image }] of images) {
      const entry = state?.entries[id];
      if (entry?.status === "queued" || entry?.status === "making") {
        queued += priceOf(image);
        queuedCount += 1;
      }
      if (entry?.status !== "approved") open += priceOf(image);
      if (entry?.spentUsd) {
        spent += entry.spentUsd;
        drawn += 1;
      }
    }
    return { queued, queuedCount, open, spent, drawn };
  }, [images, state?.entries, state?.cost]);

  async function pump() {
    let errorsInRow = 0;
    while (runningRef.current) {
      const answer = await post<WorkAnswer>({ action: "work", runId: runRef.current });
      if (!answer.ok) {
        // Two server errors in a row stop the run: each try can be a paid picture.
        errorsInRow += 1;
        if (errorsInRow >= 2) {
          setNote(`Stopped after two errors in a row, so no more pictures are paid for: ${answer.message}`);
          break;
        }
        setNote(`${answer.message} Trying once more in 10 s.`);
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        continue;
      }
      errorsInRow = 0;
      const value = answer.value;
      if (value.kind === "idle") {
        setNote("The queue is empty. Everything made is in the review tray.");
        break;
      }
      if (value.kind === "off") {
        setNote(value.message);
        break;
      }
      if (value.kind === "wait") {
        const why = value.reason ? `The maker said to wait: “${value.reason}”` : "At the pace limit";
        await refreshEntries();
        const until = Date.now() + value.ms;
        // Said once, not once a second: a ticking countdown in a live region chatters at screen-reader users (BVD, Matthew).
        setNote(`${why}. Trying again in ${Math.ceil(value.ms / 1000)} s.`);
        while (runningRef.current && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, Math.min(1000, Math.max(0, until - Date.now()))));
        continue;
      }
      const found = images.get(value.imageId);
      const name = found ? `${found.job.title} · ${found.image.number}` : value.imageId;
      setNote(value.kind === "made" ? `Made ${name}. It is waiting in the review tray.` : `One failed: ${name}. See why under the tray.`);
      await refreshEntries();
    }
  }

  async function start(first = "Making…") {
    if (runningRef.current) return;
    runningRef.current = true;
    // Every press of Start making is a fresh run, with its own spending limit.
    runRef.current = newRunId();
    setRunning(true);
    setNote(first);
    const lanes = Math.max(1, Math.min(4, state?.settings.concurrency ?? 1));
    await Promise.all(Array.from({ length: lanes }, () => pump()));
    runningRef.current = false;
    setRunning(false);
    await refreshEntries();
  }

  function stop() {
    runningRef.current = false;
    setRunning(false);
    setNote("Stopping after the picture being drawn now. The queue is kept.");
  }

  async function queue(body: Record<string, unknown>) {
    const answer = await post<{ added: number; skipped: number }>({ action: "queue", ...body });
    if (!answer.ok) {
      setNote(answer.message);
      return;
    }
    const queued = `Queued ${answer.value.added}${answer.value.skipped ? ` (${answer.value.skipped} already made, waiting or in review)` : ""}`;
    await refreshEntries();
    // Queueing starts making: in DnD-Max, Max queued 50 and they sat, because only Start making drove the queue.
    if (answer.value.added > 0 && state?.activeProvider && !runningRef.current) void start(`${queued}. Making now.`);
    else setNote(`${queued}.${runningRef.current ? " Already making; they join the line." : ""}`);
  }

  /** An alt text or caption saved in review, shown everywhere at once without a reload. */
  const setText = (id: string, text: string, edited: boolean) =>
    setState((current) =>
      current
        ? { ...current, groups: current.groups.map((group) => ({ ...group, jobs: group.jobs.map((job) => ({ ...job, images: job.images.map((image) => (image.id === id ? { ...image, text, textEdited: edited } : image)) })) })) }
        : current,
    );

  /** After a Redo: back in the queue, so carry on making unless already running. */
  const afterRedo = (message: string) => {
    setNote(message);
    void refreshEntries();
    if (/Back in the queue/.test(message) && state?.activeProvider && !runningRef.current) void start(`${message} Making now.`);
  };

  if (state === undefined) return <p className="af-muted">Reading the art catalogue…</p>;
  if (state === null) return <p className="af-muted">Could not read Content Factory MAX. Are you signed in as the admin?</p>;
  if (state.groups.length === 0) {
    return (
      <section className="af-card">
        <h2>The catalogue is empty</h2>
        <p>Nothing to make yet. Ask Asset Forge to write the art list (&ldquo;I need art for…&rdquo;), then rebuild the catalogue.</p>
      </section>
    );
  }

  const group = state.groups.find((one) => one.id === groupId) ?? state.groups[0]!;
  const byStatus = (status: Status) => [...images.keys()].map((id) => state.entries[id]).filter((one): one is Entry => one?.status === status);
  const review = byStatus("review").sort((a, b) => a.seq - b.seq);
  const failed = byStatus("failed");
  const hookFailed = byStatus("approved").filter((entry) => entry.hookError);
  const total = images.size;
  const toMake = total - counts.approved;
  const byKind = new Map<Kind, number>();
  for (const { image } of images.values()) byKind.set(image.kind, (byKind.get(image.kind) ?? 0) + 1);
  const kindLine = [...byKind].map(([kind, count]) => `${count} ${count === 1 ? kindWords[kind].one : kindWords[kind].many}`).join(" · ");
  const noText = [...images.values()].filter(({ image }) => !image.text);
  // Everything the export carries: edited words, alt text and captions, and group styles.
  const edited =
    Object.values(state.entries).filter((one) => one.prompt).length +
    [...images.values()].filter(({ image }) => image.textEdited).length +
    state.groups.filter((one) => one.styleEdited).length;
  // Sounds waiting with nothing switched on to make them, so the page can say so before a run stalls.
  const stuckKinds = (["voice", "sfx", "music"] as const).filter((kind) => !state.makers?.[kind] && [...images.values()].some(({ image }) => image.kind === kind && state.entries[image.id]?.status === "queued"));

  return (
    <div className="af-wrap">
      {state.gate === "open-laptop" ? (
        <p className="af-banner" role="note">
          No ADMIN_PASSWORD is set, so on this computer everyone is the admin. Set one before going live: without it the live site locks the factory.
        </p>
      ) : null}
      {state.memory === "memory" || state.store === "memory" ? (
        <p className="af-banner" role="note">
          {state.memory === "memory" ? "Redis is not connected, so the queue lives in this server's memory. " : ""}
          {state.store === "memory" ? "R2 is not connected, so pictures live in memory only. " : ""}
          Fine for a try-out; a restart forgets everything. Set the UPSTASH_REDIS_* and R2_* variables for the real thing.
        </p>
      ) : null}

      <section className="af-card" aria-labelledby="af-controls">
        <h2 id="af-controls" className="af-sr">
          Controls
        </h2>
        <PictureMakerPicker onChanged={() => void reload()} />
        <hr style={{ border: 0, borderTop: "1px solid var(--af-line)", width: "100%", margin: 0 }} />
        <div className="af-progress" role="img" aria-label={`${counts.approved} of ${total} approved`}>
          <span style={{ width: `${total ? (counts.approved / total) * 100 : 0}%` }} />
        </div>
        <p style={{ fontSize: "1.05rem" }}>
          <strong>{total}</strong> {byKind.size === 1 && byKind.has("image") ? "pictures" : "items"} in the catalogue{byKind.size > 1 ? ` (${kindLine})` : ""} · <strong>{counts.approved}</strong> approved · <strong>{counts.review}</strong> to review · <strong>{counts.queued + counts.making}</strong> in the queue
          {counts.failed ? (
            <>
              {" "}
              · <strong className="af-bad-text">{counts.failed}</strong> failed
            </>
          ) : null}
        </p>
        <p className="af-muted">
          {state.activeProvider ? (
            <>
              Drawing with <strong>{state.cost.provider}</strong> (<code>{state.cost.model}</code>
              {state.cost.quality ? `, ${state.cost.quality} quality` : ""})
              {state.cost.providerName === "practice" ? (
                ", which is free."
              ) : state.cost.usd !== null ? (
                <>
                  , about <strong>{money(state.cost.usd)}</strong> a square picture
                  {state.cost.usdOther !== null && state.cost.usdOther !== state.cost.usd ? (
                    <>
                      {" "}
                      and <strong>{money(state.cost.usdOther)}</strong> a tall or wide one
                    </>
                  ) : null}
                  : about <strong>{money(tally.open)}</strong> for the {toMake} not yet approved (redos cost the same again).
                </>
              ) : (
                ", which the price table has no price for yet (set one on the usage page)."
              )}{" "}
              {state.cost.seeThrough ? "Tokens, icons and items are asked for on a see-through background." : state.cost.providerName === "google" ? "Google cannot draw see-through backgrounds; OpenAI can." : ""}
            </>
          ) : (
            <>No picture maker is on: add OPENAI_API_KEY_ImageGen or GOOGLE_API_KEY_ImageGen, or pick Practice above.</>
          )}{" "}
          Every picture is counted on the usage page as <code>art-factory</code>
          {byKind.size > 1 ? (
            <>
              , sounds as <code>factory-voice</code>, <code>factory-sfx</code> and <code>factory-music</code>
            </>
          ) : null}
          .
        </p>
        {stuckKinds.length ? (
          <p className="af-small af-bad-text">
            Nothing is switched on to make the {stuckKinds.map((kind) => kindWords[kind].many).join(" and ")} in the queue, so they wait. Pick Practice above to rehearse them for free; real voice, effect and music makers plug into the config&rsquo;s <code>makers</code>.
          </p>
        ) : null}
        {state.activeProvider && state.cost.providerName !== "practice" ? <MoneyBox cost={state.cost} tally={tally} onChanged={() => void reload()} /> : null}
        <div className="af-row">
          {running ? (
            <button type="button" className="af-btn af-big" onClick={stop}>
              <span aria-hidden="true">■ </span>Stop
            </button>
          ) : (
            <button type="button" className="af-btn af-big" disabled={!state.activeProvider} onClick={() => void start()}>
              <span aria-hidden="true">▶ </span>Start making
            </button>
          )}
          <label className="af-row">
            <input type="number" aria-label="How many new pictures to queue" min={1} max={1000} value={nextN} onChange={(event) => setNextN(event.target.value)} className="af-input af-tiny" />
            <button type="button" className="af-btn" onClick={() => void queue({ limit: Number(nextN) || 10 })}>
              Make the next {Number(nextN) || 10} new
            </button>
          </label>
          {counts.failed > 0 ? (
            <button type="button" className="af-btn" title="Queue every failed picture again, with its own words. A refused one will likely be refused again unless its words are edited." onClick={() => void queue({ retry: "failed" })}>
              <span aria-hidden="true">↻ </span>Retry {counts.failed} failed
            </button>
          ) : null}
          {counts.rejected > 0 ? (
            <button type="button" className="af-btn" onClick={() => void queue({ retry: "rejected" })}>
              <span aria-hidden="true">↻ </span>Redraw {counts.rejected} rejected
            </button>
          ) : null}
          {counts.queued > 0 && !running ? (
            <button
              type="button"
              className="af-btn"
              onClick={async () => {
                const answer = await post<{ removed: number }>({ action: "clear-queue" });
                setNote(answer.ok ? `Took ${answer.value.removed} out of the queue.` : answer.message);
                await refreshEntries();
              }}
            >
              Empty the queue
            </button>
          ) : null}
          <PaceControl settings={state.settings} onSaved={(settings) => setState({ ...state, settings })} />
        </div>
        <MakeArtLimit />
        {edited ? (
          <p className="af-small">
            {edited} {edited === 1 ? "edit" : "edits"} made here (words, alt text, captions or styles).{" "}
            <a className="af-btn" href={`${artApi.factory}?export=fixes`} download>
              <span aria-hidden="true">⬇ </span>Export prompt fixes
            </a>{" "}
            <span className="af-muted">Asset Forge merges the file into this project&rsquo;s own prompts.json as new numbered versions, so the next rebuild keeps them.</span>
          </p>
        ) : null}
        {noText.length ? (
          <p className="af-small af-muted">
            {noText.length} {noText.length === 1 ? "item has" : "items have"} no alt text or caption yet. Asset Forge drafts them; add or fix one on any card in the review tray.
          </p>
        ) : null}
        {!running && counts.queued > 0 && state.activeProvider ? <p className="af-small" style={{ color: "var(--af-accent)", fontWeight: 650 }}>{counts.queued} waiting in the queue. Press Start making to carry on; the page does the making, so keep this tab open while it runs.</p> : null}
        <p role="status" aria-live="polite" className="af-small af-muted">
          {note ?? ""}
        </p>
      </section>

      <section className="af-card" aria-labelledby="af-tray">
        <div className="af-spread">
          <h2 id="af-tray" tabIndex={-1}>Review tray {review.length ? `· ${review.length}` : ""}</h2>
          {review.length > 0 || reviewing ? (
            <button type="button" id="af-review-toggle" className="af-btn" aria-pressed={reviewing} onClick={() => setReviewing(!reviewing)}>
              {reviewing ? "Back to cards" : "Review mode (keys)"}
            </button>
          ) : null}
          {review.length > 0 && !reviewing ? (
            <ApproveAll
              ids={review.map((entry) => entry.imageId)}
              onProgress={() => void refreshEntries()}
              onDone={(message) => {
                setNote(message);
                void refreshEntries();
              }}
            />
          ) : null}
        </div>
        {review.length === 0 ? <p className="af-muted">Nothing waiting. Queue a job below and it starts making.</p> : null}
        {hookFailed.length ? (
          <div className="af-line af-warn" role="note">
            <p className="af-bad-text">
              {hookFailed.length} approved {hookFailed.length === 1 ? "item is" : "items are"} live, but the project&rsquo;s on-approve step failed, so the app may not know yet.
            </p>
            <ul className="af-list">
              {hookFailed.map((entry) => (
                <li key={entry.imageId} className="af-row">
                  <span>
                    {images.get(entry.imageId)?.job.title} #{images.get(entry.imageId)?.image.number}: {entry.hookError?.message}
                  </span>
                  <ActionButton id={entry.imageId} action="retry-hook" label="↻ Tell the app again" done="Told the app again." onDone={afterRedo} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {/* Review mode stays open on its "all reviewed" screen until it is closed, so focus never falls out of the tray. */}
        {reviewing ? (
          <ReviewMode
            review={review}
            images={images}
            entries={state.entries}
            onDecided={async (message) => {
              setNote(message);
              await refreshEntries();
              if (/Back in the queue/.test(message) && state.activeProvider && !runningRef.current) void start(`${message} Making now.`);
            }}
            onText={setText}
            onClose={() => {
              setReviewing(false);
              // Back to where review mode was opened from, not the top of the page.
              requestAnimationFrame(() => (document.getElementById("af-review-toggle") ?? document.getElementById("af-tray"))?.focus());
            }}
          />
        ) : null}
        {/* Only one review interface at a time: the cards are not mounted while review mode is open. */}
        {!reviewing ? (
        <div className="af-grid">
          {review.map((entry) => {
            const found = images.get(entry.imageId);
            return found ? (
              <ReviewCard key={entry.imageId} entry={entry} image={found.image} job={found.job} onDone={afterRedo} onText={(text, edited) => setText(entry.imageId, text, edited)} />
            ) : null;
          })}
        </div>
        ) : null}
        {failed.length > 0 ? (
          <details>
            <summary className="af-bad-text">{failed.length} failed: see why</summary>
            <ul className="af-list" style={{ marginTop: 8 }}>
              {failed.map((entry) => (
                <li key={entry.imageId} className="af-row">
                  <span>
                    {images.get(entry.imageId)?.job.title} #{images.get(entry.imageId)?.image.number}: {entry.error}
                  </span>
                  <RedoButton id={entry.imageId} onDone={afterRedo} />
                  {entry.refused && images.get(entry.imageId) ? <RefusalHelper entry={entry} image={images.get(entry.imageId)!.image} others={state.pictureMakers ?? []} onDone={afterRedo} /> : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="af-card" aria-labelledby="af-list">
        <div className="af-spread">
          <h2 id="af-list">The list</h2>
          <div className="af-row" role="group" aria-label="Show the list">
            <button type="button" className="af-btn" aria-pressed={view === "jobs"} onClick={() => setView("jobs")}>
              By job
            </button>
            <button type="button" className="af-btn" aria-pressed={view === "grid"} onClick={() => setView("grid")}>
              Grid
            </button>
          </div>
        </div>
        {view === "grid" ? (
          <ItemBrowser
            images={images}
            groups={state.groups}
            entries={state.entries}
            onQueue={(body) => void queue(body)}
            renderDetail={(found) => <ImageLine image={found.image} entry={state.entries[found.image.id]} onQueue={(body) => void queue(body)} onChanged={afterRedo} />}
          />
        ) : (
          <>
        <nav aria-label="Groups" className="af-nav">
          {state.groups.map((one) => {
            const ids = one.jobs.flatMap((job) => job.images.map((image) => image.id));
            const done = ids.filter((id) => state.entries[id]?.status === "approved").length;
            return (
              <button key={one.id} type="button" aria-pressed={one.id === group.id} className="af-btn" onClick={() => setGroupId(one.id)}>
                {one.title}{" "}
                <span className="af-muted" style={{ fontWeight: 400 }}>
                  {done}/{ids.length}
                </span>
              </button>
            );
          })}
        </nav>
        {group.intro ? <p className="af-muted">{group.intro}</p> : null}
        <StyleBlock key={group.id} group={group} onSaved={(style, edited) => setState({ ...state, groups: state.groups.map((one) => (one.id === group.id ? { ...one, style, styleEdited: edited } : one)) })} />
        <div>
          <button type="button" className="af-btn af-go" onClick={() => void queue({ group: group.id })}>
            Make all new in {group.title}
          </button>
        </div>
        <div className="af-stack">
          {group.jobs.map((job) => (
            <JobCard
              key={job.key}
              job={job}
              entries={state.entries}
              onQueue={(body) => void queue(body)}
              onChanged={afterRedo}
            />
          ))}
        </div>
          </>
        )}
      </section>
    </div>
  );
}

function PaceControl({ settings, onSaved }: { settings: Settings; onSaved: (next: Settings) => void }) {
  const [perMinute, setPerMinute] = useState(String(settings.perMinute));
  const [concurrency, setConcurrency] = useState(String(settings.concurrency));
  const [limit, setLimit] = useState(settings.runLimitUsd === null ? "" : String(settings.runLimitUsd));
  const [said, setSaid] = useState<string | null>(null);
  return (
    <span className="af-row af-small">
      Pace
      <input aria-label="Pictures a minute" type="number" min={1} max={60} value={perMinute} onChange={(event) => setPerMinute(event.target.value)} className="af-input af-tiny" />
      a minute,
      <input aria-label="At once" type="number" min={1} max={4} value={concurrency} onChange={(event) => setConcurrency(event.target.value)} className="af-input af-tiny" />
      at once · stop each run after about $
      <input
        aria-label="Stop each run after about this many dollars (empty for no limit)"
        title="One press of Start making is a run. It stops before the try that would take it past this. Empty is no limit."
        type="number"
        min={0.01}
        step="0.5"
        inputMode="decimal"
        value={limit}
        onChange={(event) => setLimit(event.target.value)}
        className="af-input af-narrow"
      />
      <button
        type="button"
        className="af-btn"
        onClick={async () => {
          const answer = await post<Settings>({ action: "settings", perMinute: Number(perMinute), concurrency: Number(concurrency), runLimitUsd: limit.trim() === "" ? null : Number(limit) });
          if (answer.ok) onSaved(answer.value);
          setSaid(answer.ok ? (answer.value.runLimitUsd === null ? "Saved. Runs have no spending limit now." : "Saved.") : answer.message);
        }}
      >
        Save pace
      </button>
      {said ? <span role="status">{said}</span> : null}
    </span>
  );
}

function StyleBlock({ group, onSaved }: { group: GroupRow; onSaved: (style: string, edited: boolean) => void }) {
  const [text, setText] = useState(group.style);
  const [said, setSaid] = useState<string | null>(null);
  async function save(value: string | null) {
    const answer = await post<{ style: string }>({ action: "style", group: group.id, text: value });
    if (answer.ok) {
      onSaved(answer.value.style, value !== null);
      setText(answer.value.style);
    }
    setSaid(answer.ok ? (value === null ? "Back to the catalogue's style." : "Saved: used for every picture in this group from now on.") : answer.message);
  }
  return (
    <details className="af-line">
      <summary>
        Style for {group.title} {group.styleEdited ? <span className="af-muted">(edited here)</span> : null}
      </summary>
      <p className="af-small af-muted">Put in front of every picture in this group, so a set made over several evenings still looks like one set.</p>
      <label className="af-sr" htmlFor={`af-style-${group.id}`}>
        Style for {group.title}
      </label>
      <textarea id={`af-style-${group.id}`} value={text} rows={4} maxLength={2000} onChange={(event) => setText(event.target.value)} className="af-textarea" />
      <div className="af-row">
        <button type="button" className="af-btn af-go" onClick={() => void save(text)}>
          Save style
        </button>
        {group.styleEdited ? (
          <button type="button" className="af-btn" onClick={() => void save(null)}>
            Back to the catalogue&rsquo;s style
          </button>
        ) : null}
        {said ? (
          <span role="status" className="af-small">
            {said}
          </span>
        ) : null}
      </div>
    </details>
  );
}

function JobCard({ job, entries, onQueue, onChanged }: { job: JobRow; entries: Record<string, Entry>; onQueue: (body: Record<string, unknown>) => void; onChanged: (message: string) => void }) {
  const done = job.images.filter((image) => entries[image.id]?.status === "approved").length;
  return (
    <article className="af-line" style={{ padding: 12 }}>
      <div className="af-spread">
        <div>
          <h3>{job.title}</h3>
          <p className="af-small af-muted">{job.meta}</p>
        </div>
        <div className="af-row">
          <span className="af-small af-muted">
            {done}/{job.images.length} approved
          </span>
          <button type="button" className="af-btn af-go" disabled={done === job.images.length} onClick={() => onQueue({ job: job.key })}>
            Make this job
          </button>
        </div>
      </div>
      {job.note ? <p className="af-small af-muted">{job.note}</p> : null}
      <details>
        <summary className="af-small">
          The {job.images.length} {job.images.length === 1 ? "picture" : "pictures"}
        </summary>
        <ol className="af-list" style={{ marginTop: 8 }}>
          {job.images.map((image) => (
            <ImageLine key={image.id} image={image} entry={entries[image.id]} onQueue={onQueue} onChanged={onChanged} />
          ))}
        </ol>
      </details>
    </article>
  );
}

function ImageLine({ image, entry, onQueue, onChanged }: { image: ImageRow; entry: Entry | undefined; onQueue: (body: Record<string, unknown>) => void; onChanged: (message: string) => void }) {
  const [words, setWords] = useState<string | null>(null);
  const status = entry?.status;
  const approvedUrl = entry?.files?.[image.target];
  const sound = isSoundKind(image.kind);
  return (
    <li className="af-line">
      <div className="af-row">
        <span style={{ fontWeight: 650 }}>{image.number}.</span>
        {sound ? <span aria-hidden="true">{kindWords[image.kind].icon}</span> : null}
        {/* eslint-disable-next-line @next/next/no-img-element -- an approved picture from the art store */}
        {approvedUrl && !sound ? <img src={approvedUrl} alt={image.text} className="af-thumb af-checker" /> : null}
        {approvedUrl && sound ? <SoundPlayer src={approvedUrl} label={`${image.description} (approved)`} /> : null}
        <span style={{ flex: 1, minWidth: 0 }}>{image.description}</span>
        {status ? <span className={`af-pill af-${status}`}>{statusLabel[status]}</span> : null}
        {!status || status === "rejected" || status === "failed" ? (
          <button type="button" className="af-btn" onClick={() => onQueue({ ids: [image.id] })}>
            Queue
          </button>
        ) : null}
        {status === "queued" ? (
          <button
            type="button"
            className="af-btn"
            onClick={async () => {
              const answer = await post({ action: "unqueue", id: image.id });
              onChanged(answer.ok ? "Taken out of the queue." : answer.message);
            }}
          >
            Take out
          </button>
        ) : null}
        {status === "approved" ? <RedoButton id={image.id} label="Make again" onDone={onChanged} /> : null}
        {entry?.previous?.length ? (
          <ActionButton
            id={image.id}
            action="put-back"
            label="↶ Put back the earlier one"
            title={`The version approved ${entry.previous[0]!.at.slice(0, 10)} is kept for 30 days. Putting it back keeps this one, so you can swap again.`}
            done="Put back: the earlier version is live again, and this one is kept in case you want it back."
            onDone={onChanged}
          />
        ) : null}
        <button
          type="button"
          className="af-btn"
          aria-expanded={words !== null}
          onClick={async () => {
            if (words !== null) return setWords(null);
            const body = await read<{ sent?: string }>(`${artApi.factory}?prompt=${encodeURIComponent(image.id)}`);
            setWords(body?.sent ?? "Could not read the words.");
          }}
        >
          {words === null ? "Words" : "Hide words"}
        </button>
      </div>
      <p className="af-small af-muted">
        → <code>{image.target}</code>
        {image.outputs.length > 1 ? ` and ${image.outputs.length - 1} more size${image.outputs.length > 2 ? "s" : ""}` : ""} · {image.outputs[0]!.width}×{image.outputs[0]!.height}
      </p>
      {entry?.error && status !== "approved" ? <p className="af-small af-bad-text">{entry.error}</p> : null}
      {entry?.hookError && status === "approved" ? (
        <p className="af-small af-bad-text">
          Live, but the app was not told ({entry.hookError.message}). <ActionButton id={image.id} action="retry-hook" label="↻ Tell the app again" done="Told the app again." onDone={onChanged} />
        </p>
      ) : null}
      {image.text ? (
        <p className="af-small af-muted">
          {sound ? "Caption" : "Alt text"}: {image.text}
        </p>
      ) : null}
      {words !== null ? <pre>{words}</pre> : null}
    </li>
  );
}

function RedoButton({ id, label = "Redo", onDone }: { id: string; label?: string; onDone: (message: string) => void }) {
  return (
    <button
      type="button"
      className="af-btn"
      onClick={async () => {
        const answer = await post({ action: "redo", id });
        onDone(answer.ok ? "Back in the queue." : answer.message);
      }}
    >
      {label}
    </button>
  );
}

function ReviewCard({ entry, image, job, onDone, onText }: { entry: Entry; image: ImageRow; job: JobRow; onDone: (message: string) => void; onText: (text: string, edited: boolean) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sound = isSoundKind(image.kind);

  const cardRef = useRef<HTMLElement>(null);

  async function act(body: Record<string, unknown>, done: string) {
    // Where focus goes once this card leaves the tray: the next card's Approve, else the one before, else the tray's heading.
    const card = cardRef.current;
    const next = (card?.nextElementSibling ?? card?.previousElementSibling) as HTMLElement | null;
    setBusy(true);
    const answer = await post<{ warning?: string }>(body);
    setBusy(false);
    onDone(answer.ok ? (answer.value.warning ?? done) : answer.message);
    if (answer.ok && body.action !== "text") {
      requestAnimationFrame(() => {
        const target = next?.isConnected ? next.querySelector<HTMLElement>("button.af-go") : null;
        (target ?? document.getElementById("af-tray"))?.focus();
      });
    }
  }

  return (
    <figure className="af-figure" ref={cardRef} data-review-card={entry.imageId}>
      {sound ? (
        <div className="af-stack af-sound">
          <span aria-hidden="true" style={{ fontSize: "2.2rem" }}>
            {kindWords[image.kind].icon}
          </span>
          <SoundPlayer src={entry.reviewUrl ?? ""} label={`${job.title}, ${kindWords[image.kind].one} ${image.number}: ${image.description}`} />
          <span className="af-small af-muted">
            {kindWords[image.kind].one}
            {image.voice ? ` · voice ${image.voice}` : ""}
            {image.seconds ? ` · about ${image.seconds} s` : ""}
            {image.loop ? " · loops" : ""}
          </span>
        </div>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element -- a picture waiting for review */
        <img src={entry.reviewUrl} alt={image.text || `${job.title}, picture ${image.number}: ${image.description}`} className="af-checker" />
      )}
      <figcaption className="af-stack">
        <strong>
          {job.title} · {image.number}
        </strong>
        <span className="af-small af-muted">{sound && image.kind === "voice" ? <>Line: {image.description}</> : image.description}</span>
        <span className="af-small af-muted">
          → <code>{image.target}</code> · {entry.provider} {entry.model ? <code>{entry.model}</code> : null}
        </span>
        {entry.provider === "practice" ? <span className="af-small af-bad-text">A practice placeholder: approving puts it live at that path.</span> : null}
        {entry.files ? <span className="af-small af-muted">Approving replaces the live one; it is kept 30 days with a Put back button.</span> : null}
      </figcaption>
      <TextEditor image={image} onSaved={onText} />
      <div className="af-row">
        <button type="button" disabled={busy} className="af-btn af-go" onClick={() => void act({ action: "approve", id: entry.imageId }, `Approved: live at /${image.target}.`)}>
          <span aria-hidden="true">✓ </span>Approve
        </button>
        <button type="button" disabled={busy} className="af-btn" onClick={() => void act({ action: "redo", id: entry.imageId }, "Back in the queue with the same words.")}>
          Redo
        </button>
        <button
          type="button"
          disabled={busy}
          className="af-btn"
          aria-expanded={editing !== null}
          onClick={async () => {
            if (editing !== null) return setEditing(null);
            const body = await read<{ own?: string }>(`${artApi.factory}?prompt=${encodeURIComponent(entry.imageId)}`);
            setEditing(body?.own ?? "");
          }}
        >
          Edit words
        </button>
        <button type="button" disabled={busy} className="af-btn" onClick={() => void act({ action: "reject", id: entry.imageId }, "Rejected. Queue it again from the list whenever you like.")}>
          Reject
        </button>
      </div>
      {editing !== null ? (
        <div className="af-stack">
          <label className="af-small" htmlFor={`af-edit-${entry.imageId}`}>
            The words for this {kindWords[image.kind].one} (the group&rsquo;s style still goes in front)
          </label>
          <textarea id={`af-edit-${entry.imageId}`} value={editing} rows={8} maxLength={6000} onChange={(event) => setEditing(event.target.value)} className="af-textarea" />
          <button type="button" disabled={busy} className="af-btn af-go" onClick={() => void act({ action: "redo", id: entry.imageId, prompt: editing }, "Back in the queue with your words.")}>
            Redo with these words
          </button>
        </div>
      ) : null}
    </figure>
  );
}

/**
 * The money line: what the queue will cost, what the factory has really spent
 * (from the tokens each picture reported), and the credit left on this
 * provider's wallet. The same wallet as the usage page, so a top-up recorded
 * here is recorded there.
 */
function MoneyBox({ cost, tally, onChanged }: { cost: Cost; tally: { queued: number; queuedCount: number; spent: number; drawn: number }; onChanged: () => void }) {
  const [amount, setAmount] = useState("");
  const [said, setSaid] = useState<string | null>(null);
  const credit = cost.credit;
  const left = credit?.remainingUsd ?? null;
  const short = left !== null && tally.queued > left;
  const name = cost.providerName === "openai" ? "OpenAI" : "Google";

  async function record(action: "top-up" | "set-balance") {
    const amountUsd = Number(amount);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      setSaid("Type an amount in dollars first.");
      return;
    }
    const answer = await send(artApi.usage, { action, provider: cost.providerName, amountUsd });
    if (answer.ok) {
      setSaid(action === "top-up" ? `Recorded: added ${money(amountUsd)}.` : `Recorded: the ${name} console says ${money(amountUsd)}.`);
      setAmount("");
      onChanged();
    } else setSaid(answer.message);
  }

  return (
    <div className={`af-line ${short ? "af-warn" : ""}`} style={short ? { borderColor: "var(--af-bad)" } : undefined}>
      <p>
        <strong>Queued:</strong> {tally.queuedCount} {tally.queuedCount === 1 ? "picture" : "pictures"}, about <strong>{money(tally.queued)}</strong> · <strong>Spent here so far:</strong> {money(tally.spent)}
        {tally.drawn ? ` on ${tally.drawn} ${tally.drawn === 1 ? "picture" : "pictures"} (about ${money(tally.spent / tally.drawn)} each, redos included)` : ""}
      </p>
      <p>
        <strong>{name} credit:</strong>{" "}
        {left === null ? (
          <>not recorded yet. Type what your {name} console shows and press Set balance, and the factory counts down from it.</>
        ) : (
          <>
            about <strong className={left < 2 ? "af-bad-text" : ""}>{money(Math.max(0, left))}</strong> left
            {credit?.balanceUsd != null ? <> of {money(credit.balanceUsd)} recorded</> : null}
            {credit?.stopAtZero ? " · stops at zero" : " · will not stop at zero (switch that on in AI usage)"}
          </>
        )}
      </p>
      {short ? (
        <p role="alert" className="af-bad-text">
          The queue costs more than the credit left. It will run until the money does: top up, or queue fewer.
        </p>
      ) : null}
      <div className="af-row">
        <label className="af-row">
          $
          <input type="number" min={0} step="0.01" inputMode="decimal" aria-label={`Dollars of ${name} credit`} value={amount} onChange={(event) => setAmount(event.target.value)} className="af-input af-narrow" />
        </label>
        <button type="button" className="af-btn" onClick={() => void record("top-up")}>
          I added this
        </button>
        <button type="button" className="af-btn" onClick={() => void record("set-balance")}>
          Set balance
        </button>
        <span className="af-small af-muted">Estimates from the price table; the provider&rsquo;s own console is the real number.</span>
      </div>
      {said ? (
        <p role="status" className="af-small af-muted">
          {said}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Approve everything in the tray. Max: *"how about an 'approve all not
 * rejected' option for when i have a big ole batch that are all good or
 * mostly good"*. Reject or Redo the bad ones first; whatever is still in the
 * tray goes live. One approval per request, with a count, a Stop, and a
 * confirm so one stray click cannot approve sixty pictures.
 */
function ApproveAll({ ids, onProgress, onDone }: { ids: readonly string[]; onProgress: () => void; onDone: (message: string) => void }) {
  const [asking, setAsking] = useState(false);
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const stopRef = useRef(false);

  async function run() {
    setAsking(false);
    stopRef.current = false;
    const list = [...ids];
    let approved = 0;
    let warned = 0;
    const failed: string[] = [];
    setProgress({ done: 0, of: list.length });
    for (const id of list) {
      if (stopRef.current) break;
      const answer = await post<{ warning?: string }>({ action: "approve", id });
      if (answer.ok) approved += 1;
      else failed.push(answer.message);
      if (answer.ok && answer.value.warning) warned += 1;
      // A refusing store fails every one the same way: stop at the first rather than forty times.
      if (!answer.ok && /art store is refusing/.test(answer.message)) break;
      setProgress({ done: approved + failed.length, of: list.length });
      if ((approved + failed.length) % 5 === 0) onProgress();
    }
    setProgress(null);
    const stopped = stopRef.current && approved + failed.length < list.length;
    onDone(
      `Approved ${approved} of ${list.length}${stopped ? " (stopped; the rest are still in the tray)" : ""}.` +
        (failed.length ? ` ${failed.length} could not be approved: ${[...new Set(failed)].join(" ")}` : " They are live now.") +
        (warned ? ` ${warned} of them could not be handed to the app; see the Retry list in the tray.` : ""),
    );
  }

  if (progress) {
    return (
      <div className="af-row" role="status">
        <span>
          Approving {progress.done} of {progress.of}…
        </span>
        <button type="button" className="af-btn" onClick={() => (stopRef.current = true)}>
          ■ Stop
        </button>
      </div>
    );
  }
  if (asking) {
    return (
      <div className="af-row">
        <span>Approve all {ids.length} and put them live?</span>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the confirm appears because this button was just pressed; focus follows it */}
        <button type="button" autoFocus className="af-btn af-go" onClick={() => void run()}>
          Yes, approve {ids.length}
        </button>
        <button type="button" className="af-btn" onClick={() => setAsking(false)}>
          Cancel
        </button>
      </div>
    );
  }
  if (ids.length < 2) return null;
  return (
    <div className="af-row">
      <span className="af-small af-muted">Reject or Redo the bad ones first, then:</span>
      <button type="button" className="af-btn af-go" onClick={() => setAsking(true)}>
        ✓ Approve all {ids.length}
      </button>
    </div>
  );
}
