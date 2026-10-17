"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { artApi, money, read } from "./api";
import { isSoundKind, kindWords, post, SoundPlayer, statusLabel, TextEditor, type Entry, type GroupRow, type ImageRow, type JobRow, type Kind, type Status } from "./factory-shared";

/**
 * Content Factory MAX phase 2 (2026-10-17): working at DnD-Max's scale (907
 * pictures, 117 in one group).
 *
 * - **The grid**: every item as a thumbnail, with search, filters (status,
 *   kind, group, refused), "only unmade", paging, and each item's redos and
 *   cost. Press `/` to jump to the search box.
 * - **Review mode**: one item big, its set beside it, and keys: A approve,
 *   X reject, R redo, E edit words, ← → move, Esc close. Focus stays put and
 *   the screen reader hears one line per decision, not a ticking clock.
 * - **The refusal helper**: soften the words (shown, you confirm) or try the
 *   other picture maker (Max, 2026-10-16: "Both").
 */
export type Found = { image: ImageRow; job: JobRow; group: GroupRow };

const pageSize = 48;

type StatusFilter = "all" | "unmade" | "refused" | Status;

/** What a tile shows: the approved file, else the one waiting for review. */
const shownUrl = (image: ImageRow, entry: Entry | undefined) => entry?.files?.[image.target] ?? entry?.reviewUrl ?? null;

/** Not made yet, or made and thrown away: what "only unmade" and bulk queueing mean. */
const isUnmade = (entry: Entry | undefined) => !entry || entry.status === "rejected" || entry.status === "failed";

export function ItemBrowser({
  images,
  groups,
  entries,
  onQueue,
  renderDetail,
}: {
  images: ReadonlyMap<string, Found>;
  groups: readonly GroupRow[];
  entries: Readonly<Record<string, Entry>>;
  onQueue: (body: Record<string, unknown>) => void;
  /** The full line for one item (its buttons, words, Put back), drawn by the page. */
  renderDetail: (found: Found) => ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [kind, setKind] = useState<"all" | Kind>("all");
  const [group, setGroup] = useState("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const kinds = useMemo(() => [...new Set([...images.values()].map(({ image }) => image.kind))], [images]);

  // "/" jumps to the search box from anywhere on the page, the way big lists on the web do.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.key !== "/" || event.ctrlKey || event.metaKey || target?.closest("input, textarea, select, [contenteditable=true]")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const matches = useMemo(() => {
    const words = search.trim().toLowerCase();
    return [...images.values()].filter(({ image, job, group: g }) => {
      const entry = entries[image.id];
      if (group !== "all" && g.id !== group) return false;
      if (kind !== "all" && image.kind !== kind) return false;
      if (status === "unmade" && !isUnmade(entry)) return false;
      if (status === "refused" && !entry?.refused) return false;
      if (status !== "all" && status !== "unmade" && status !== "refused" && entry?.status !== status) return false;
      if (!words) return true;
      return [image.description, image.id, image.target, image.text, job.title, g.title, `#${image.number}`].some((one) => one.toLowerCase().includes(words));
    });
  }, [images, entries, search, status, kind, group]);

  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  const at = Math.min(page, pages - 1);
  const shown = matches.slice(at * pageSize, (at + 1) * pageSize);
  const unmade = matches.filter(({ image }) => isUnmade(entries[image.id]) && !entries[image.id]).map(({ image }) => image.id);
  const chosen = selected ? images.get(selected) : undefined;
  const filter = (apply: () => void) => {
    apply();
    setPage(0);
  };

  return (
    <div className="af-stack">
      <div className="af-row af-toolbar" role="search" aria-label="Find items">
        <label className="af-row af-small">
          Search
          <input ref={searchRef} type="search" className="af-input" placeholder="name, file, alt text… ( / )" value={search} onChange={(event) => filter(() => setSearch(event.target.value))} />
        </label>
        <label className="af-row af-small">
          Status
          <select className="af-input" value={status} onChange={(event) => filter(() => setStatus(event.target.value as StatusFilter))}>
            <option value="all">all</option>
            <option value="unmade">only unmade</option>
            <option value="review">to review</option>
            <option value="queued">waiting</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
            <option value="failed">failed</option>
            <option value="refused">refused by a safety filter</option>
          </select>
        </label>
        {kinds.length > 1 ? (
          <label className="af-row af-small">
            Kind
            <select className="af-input" value={kind} onChange={(event) => filter(() => setKind(event.target.value as "all" | Kind))}>
              <option value="all">all</option>
              {kinds.map((one) => (
                <option key={one} value={one}>
                  {kindWords[one].many}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="af-row af-small">
          Group
          <select className="af-input" value={group} onChange={(event) => filter(() => setGroup(event.target.value))}>
            <option value="all">all</option>
            {groups.map((one) => (
              <option key={one.id} value={one.id}>
                {one.title}
              </option>
            ))}
          </select>
        </label>
        {unmade.length ? (
          <button type="button" className="af-btn af-go" onClick={() => onQueue({ ids: unmade.slice(0, 1000) })}>
            Make the {Math.min(unmade.length, 1000)} new {unmade.length === 1 ? "one" : "ones"} shown
          </button>
        ) : null}
      </div>
      <p className="af-small af-muted" aria-live="polite">
        {matches.length} of {images.size} {matches.length === 1 ? "item" : "items"}
        {pages > 1 ? ` · page ${at + 1} of ${pages}` : ""}
      </p>

      {chosen ? (
        <div className="af-line af-selected" aria-label={`Selected: ${chosen.job.title} ${chosen.image.number}`} role="group">
          <div className="af-spread">
            <strong>
              {chosen.group.title} · {chosen.job.title}
            </strong>
            <button type="button" className="af-btn" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <ol className="af-list">{renderDetail(chosen)}</ol>
        </div>
      ) : null}

      <ul className="af-tiles">
        {shown.map(({ image, job }) => {
          const entry = entries[image.id];
          const url = shownUrl(image, entry);
          return (
            <li key={image.id}>
              <button type="button" className="af-tile" aria-pressed={selected === image.id} onClick={() => setSelected(selected === image.id ? null : image.id)}>
                <span className="af-tile-art af-checker" aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a thumbnail from the art store */}
                  {url && !isSoundKind(image.kind) ? <img src={url} alt="" loading="lazy" /> : <span className="af-tile-icon">{kindWords[image.kind].icon}</span>}
                </span>
                <span className="af-tile-name">
                  {job.title} #{image.number}: {image.description}
                </span>
                <span className="af-tile-meta">
                  {entry ? <span className={`af-pill af-${entry.status}`}>{statusLabel[entry.status]}</span> : <span className="af-pill">Not made</span>}
                  {entry?.refused ? <span className="af-pill af-failed">refused</span> : null}
                  {entry?.redos ? <span>{entry.redos} {entry.redos === 1 ? "redo" : "redos"}</span> : null}
                  {entry?.spentUsd ? <span>{money(entry.spentUsd)}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {pages > 1 ? (
        <nav className="af-row" aria-label="Pages">
          <button type="button" className="af-btn" disabled={at === 0} onClick={() => setPage(at - 1)}>
            <span aria-hidden="true">← </span>Previous
          </button>
          <span className="af-small">
            Page {at + 1} of {pages}
          </span>
          <button type="button" className="af-btn" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>
            Next<span aria-hidden="true"> →</span>
          </button>
        </nav>
      ) : null}
    </div>
  );
}

/**
 * Review mode: one item big, its set beside it, decided from the keyboard.
 * A approve · X reject · R redo · E edit words · ← → move · Esc close.
 */
export function ReviewMode({
  review,
  images,
  entries,
  onDecided,
  onText,
  onClose,
}: {
  review: readonly Entry[];
  images: ReadonlyMap<string, Found>;
  entries: Readonly<Record<string, Entry>>;
  onDecided: (message: string) => Promise<void> | void;
  onText: (id: string, text: string, edited: boolean) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  // A draft of new words belongs to one item: moving on, or an answer arriving late for another, never carries it over.
  const [draft, setDraft] = useState<{ id: string; text: string } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const wordsRef = useRef<HTMLTextAreaElement>(null);
  const at = Math.min(index, Math.max(0, review.length - 1));
  const entry = review[at];
  const found = entry ? images.get(entry.imageId) : undefined;
  const currentId = useRef<string | null>(null);
  currentId.current = entry?.imageId ?? null;
  const editing = draft && draft.id === entry?.imageId ? draft.text : null;
  const setEditing = (text: string | null) => setDraft(text === null || !entry ? null : { id: entry.imageId, text });
  const move = (to: number) => {
    setDraft(null);
    setIndex(to);
  };

  useEffect(() => {
    boxRef.current?.focus();
  }, []);
  useEffect(() => {
    if (editing !== null) wordsRef.current?.focus();
  }, [editing]);

  async function decide(body: Record<string, unknown>, done: string) {
    if (!entry || !found || busy) return;
    setBusy(true);
    const answer = await post<{ warning?: string }>({ ...body, id: entry.imageId });
    setBusy(false);
    // A failed request keeps the draft, so the words can be sent again.
    if (answer.ok) setDraft(null);
    const left = review.length - 1;
    const next = review[at + 1] ?? review[at - 1];
    const nextName = next ? images.get(next.imageId) : undefined;
    // One line per decision for the screen reader: what happened, how many are left, what is next.
    const line = answer.ok
      ? `${answer.value.warning ?? done} ${left} left.${nextName ? ` Now: ${nextName.job.title} ${nextName.image.number}, ${nextName.image.description}.` : ""}`
      : answer.message;
    setSaid(line);
    await onDecided(answer.ok ? (answer.value.warning ?? done) : answer.message);
    boxRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const typing = (event.target as HTMLElement).closest("input, textarea, select");
    if (event.key === "Escape") {
      event.preventDefault();
      if (editing !== null) {
        setEditing(null);
        boxRef.current?.focus();
      } else onClose();
      return;
    }
    if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "a") void decide({ action: "approve" }, "Approved.");
    else if (key === "x") void decide({ action: "reject" }, "Rejected.");
    else if (key === "r") void decide({ action: "redo" }, "Back in the queue.");
    else if (key === "e") void openWords();
    else if (event.key === "ArrowRight") move(Math.min(review.length - 1, at + 1));
    else if (event.key === "ArrowLeft") move(Math.max(0, at - 1));
    else return;
    event.preventDefault();
  }

  async function openWords() {
    if (!entry) return;
    const id = entry.imageId;
    const body = await read<{ own?: string }>(`${artApi.factory}?prompt=${encodeURIComponent(id)}`);
    // Only if the same item is still showing: a late answer must not fill another item's editor.
    if (currentId.current === id) setDraft({ id, text: body?.own ?? "" });
  }

  const set = found ? found.job.images : [];
  return (
    <div ref={boxRef} tabIndex={-1} onKeyDown={onKeyDown} className="af-review-mode" role="region" aria-label="Review mode" aria-describedby="af-review-keys">
      <div className="af-spread">
        <h3>
          Review mode {review.length ? `· ${at + 1} of ${review.length}` : ""}
        </h3>
        <button type="button" className="af-btn" onClick={onClose}>
          Close (Esc)
        </button>
      </div>
      <p id="af-review-keys" className="af-small af-muted">
        Keys: <kbd>A</kbd> approve · <kbd>X</kbd> reject · <kbd>R</kbd> redo · <kbd>E</kbd> edit words · <kbd>←</kbd> <kbd>→</kbd> move · <kbd>Esc</kbd> close
      </p>
      <p role="status" className="af-sr">
        {said}
      </p>
      {!entry || !found ? (
        <p>All reviewed. Nice work.</p>
      ) : (
        <div className="af-review-body">
          <div className="af-review-main">
            {isSoundKind(found.image.kind) ? (
              <div className="af-stack af-sound">
                <span aria-hidden="true" style={{ fontSize: "3rem" }}>
                  {kindWords[found.image.kind].icon}
                </span>
                <SoundPlayer src={entry.reviewUrl ?? ""} label={`${found.job.title} ${found.image.number}: ${found.image.description}`} />
              </div>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element -- the picture being reviewed */
              <img src={entry.reviewUrl} alt={found.image.text || `${found.job.title}, picture ${found.image.number}: ${found.image.description}`} className="af-checker af-review-big" />
            )}
          </div>
          <div className="af-stack af-review-side">
            <strong>
              {found.job.title} · {found.image.number}
            </strong>
            <span>{found.image.kind === "voice" ? <>Line: {found.image.description}</> : found.image.description}</span>
            <span className="af-small af-muted">
              → <code>{found.image.target}</code> · {entry.provider} {entry.model ? <code>{entry.model}</code> : null}
              {entry.redos ? ` · redo ${entry.redos}` : ""}
              {entry.spentUsd ? ` · ${money(entry.spentUsd)} so far` : ""}
            </span>
            <TextEditor key={found.image.id} image={found.image} onSaved={(text, edited) => onText(found.image.id, text, edited)} />
            <div className="af-row">
              <button type="button" disabled={busy} className="af-btn af-go" onClick={() => void decide({ action: "approve" }, "Approved.")}>
                <span aria-hidden="true">✓ </span>Approve <kbd aria-hidden="true">A</kbd>
              </button>
              <button type="button" disabled={busy} className="af-btn" onClick={() => void decide({ action: "redo" }, "Back in the queue.")}>
                Redo <kbd aria-hidden="true">R</kbd>
              </button>
              <button type="button" disabled={busy} className="af-btn" aria-expanded={editing !== null} onClick={() => (editing === null ? void openWords() : setEditing(null))}>
                Edit words <kbd aria-hidden="true">E</kbd>
              </button>
              <button type="button" disabled={busy} className="af-btn" onClick={() => void decide({ action: "reject" }, "Rejected.")}>
                Reject <kbd aria-hidden="true">X</kbd>
              </button>
            </div>
            {editing !== null ? (
              <div className="af-stack">
                <label className="af-small" htmlFor="af-review-words">
                  The words for this {kindWords[found.image.kind].one} (the group&rsquo;s style still goes in front)
                </label>
                <textarea id="af-review-words" ref={wordsRef} value={editing} rows={6} maxLength={6000} onChange={(event) => setEditing(event.target.value)} className="af-textarea" />
                <button type="button" disabled={busy} className="af-btn af-go" onClick={() => void decide({ action: "redo", prompt: editing }, "Back in the queue with your words.")}>
                  Redo with these words
                </button>
              </div>
            ) : null}
            {set.length > 1 ? (
              <div className="af-stack">
                <span className="af-small af-muted">The rest of this set</span>
                <ul className="af-strip">
                  {set.map((one) => {
                    const sibling = entries[one.id];
                    const url = shownUrl(one, sibling);
                    return (
                      <li key={one.id} className={one.id === found.image.id ? "af-current" : undefined} title={`#${one.number} ${one.description}: ${sibling ? statusLabel[sibling.status] : "not made"}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- a sibling thumbnail */}
                        {url && !isSoundKind(one.kind) ? <img src={url} alt={`#${one.number} ${one.description}`} loading="lazy" className="af-checker" /> : <span className="af-tile-icon" aria-label={`#${one.number} ${one.description}`}>{kindWords[one.kind].icon}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The refusal helper, for an item a safety filter refused: soften the words
 * (shown with every change, edited if you like, sent only when you press
 * Redraw) or try the other picture maker.
 */
export function RefusalHelper({ entry, image, others, onDone }: { entry: Entry; image: ImageRow; others: readonly string[]; onDone: (message: string) => void }) {
  const [soft, setSoft] = useState<{ text: string; changes: { from: string; to: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const label = (name: string) => (name === "openai" ? "OpenAI" : name === "google" ? "Google" : name);
  // "Try the other one" switches picture makers; a sound's maker is chosen by its kind, so sounds only get Soften.
  const other = isSoundKind(image.kind) ? [] : others.filter((one) => one !== entry.provider);

  async function redo(body: Record<string, unknown>, done: string) {
    setBusy(true);
    const answer = await post({ action: "redo", id: entry.imageId, ...body });
    setBusy(false);
    onDone(answer.ok ? done : answer.message);
  }

  return (
    <div className="af-stack af-refusal">
      <div className="af-row">
        <button
          type="button"
          className="af-btn"
          disabled={busy}
          aria-expanded={soft !== null}
          onClick={async () => {
            if (soft) return setSoft(null);
            const answer = await post<{ text: string; changes: { from: string; to: string }[] }>({ action: "soften", id: entry.imageId });
            if (answer.ok) setSoft(answer.value);
            else onDone(answer.message);
          }}
        >
          Soften the words
        </button>
        {other.map((name) => (
          <button key={name} type="button" className="af-btn" disabled={busy} onClick={() => void redo({ provider: name }, `Back in the queue, to be drawn on ${label(name)} this once.`)}>
            Try {label(name)} instead
          </button>
        ))}
      </div>
      {soft ? (
        <div className="af-stack">
          {soft.changes.length ? (
            <p className="af-small">
              Changed: {soft.changes.map((one) => `“${one.from}” → “${one.to}”`).join(", ")}. Read it, edit it if you like, then redraw.
            </p>
          ) : (
            <p className="af-small">No words to soften were found. Edit them by hand below, or try the other picture maker.</p>
          )}
          <label className="af-small" htmlFor={`af-soft-${image.id.replace(/[^a-z0-9-]/gi, "-")}`}>
            The words to redraw with
          </label>
          <textarea id={`af-soft-${image.id.replace(/[^a-z0-9-]/gi, "-")}`} className="af-textarea" rows={5} maxLength={6000} value={soft.text} onChange={(event) => setSoft({ ...soft, text: event.target.value })} />
          <button type="button" className="af-btn af-go" disabled={busy} onClick={() => void redo({ prompt: soft.text }, "Back in the queue with the softened words.")}>
            Redraw with these words
          </button>
        </div>
      ) : null}
    </div>
  );
}
