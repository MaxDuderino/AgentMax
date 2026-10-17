"use client";

import { useState } from "react";

import { artApi, send } from "./api";

/**
 * Shapes and small pieces shared by Content Factory MAX's screens: the page,
 * the grid, review mode and the refusal helper.
 */
export type Status = "queued" | "making" | "review" | "approved" | "rejected" | "failed";

export type Kind = "image" | "voice" | "sfx" | "music";

export const kindWords: Record<Kind, { one: string; many: string; icon: string }> = {
  image: { one: "picture", many: "pictures", icon: "🖼" },
  voice: { one: "voice line", many: "voice lines", icon: "🗣" },
  sfx: { one: "sound effect", many: "sound effects", icon: "💥" },
  music: { one: "piece of music", many: "pieces of music", icon: "🎵" },
};

export const isSoundKind = (kind: Kind) => kind !== "image";

export interface Entry {
  imageId: string;
  status: Status;
  seq: number;
  prompt?: string;
  attempts: number;
  reviewUrl?: string;
  provider?: string;
  model?: string;
  error?: string;
  files?: Record<string, string>;
  spentUsd?: number;
  approvedAt?: string;
  previous?: { at: string; keptAt: string; files: Record<string, string> }[];
  hookError?: { at: string; message: string };
  redos?: number;
  draws?: number;
  refused?: boolean;
  useProvider?: string;
}

export interface Cost {
  provider: string;
  providerName: "google" | "openai" | "practice";
  model: string;
  quality: string | null;
  usd: number | null;
  usdOther: number | null;
  seeThrough: boolean;
  credit: { balanceUsd: number | null; remainingUsd: number | null; stopAtZero: boolean; setAt: string | null } | null;
}

export interface ImageRow {
  id: string;
  kind: Kind;
  number: number;
  description: string;
  target: string;
  outputs: { path: string; width: number; height: number }[];
  aspect: string;
  /** Alt text (a picture) or caption (a sound), edits included. */
  text: string;
  textEdited: boolean;
  format?: string;
  seconds?: number;
  loop?: boolean;
  voice?: string;
}

export interface Settings {
  perMinute: number;
  concurrency: number;
  runLimitUsd: number | null;
}

export interface JobRow {
  key: string;
  title: string;
  meta: string;
  note: string;
  images: ImageRow[];
}

export interface GroupRow {
  id: string;
  title: string;
  intro: string | null;
  style: string;
  styleEdited: boolean;
  defaultStyle: string;
  jobs: JobRow[];
}


export const statusLabel: Record<Status, string> = { queued: "Waiting", making: "Making…", review: "To review", approved: "Approved", rejected: "Rejected", failed: "Failed" };


export const post = <T,>(body: Record<string, unknown>) => send<T>(artApi.factory, body);

/** One action on one item, with the server's warning (if any) passed on. */
export function ActionButton({ id, action, label, done, title, onDone }: { id: string; action: string; label: string; done: string; title?: string; onDone: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="af-btn"
      disabled={busy}
      {...(title ? { title } : {})}
      onClick={async () => {
        setBusy(true);
        const answer = await post<{ warning?: string }>({ action, id });
        setBusy(false);
        onDone(answer.ok ? (answer.value.warning ?? done) : answer.message);
      }}
    >
      {label}
    </button>
  );
}

/** A sound in the tray or the list: a named player that never plays by itself (BVD audio rules). */
export function SoundPlayer({ src, label }: { src: string; label: string }) {
  return <audio controls preload="none" src={src} aria-label={`Play ${label}`} className="af-audio" />;
}

/** The alt text (a picture) or caption (a sound), editable in review. Saved for this project; the catalogue's own is the fallback. */
export function TextEditor({ image, onSaved }: { image: ImageRow; onSaved: (text: string, edited: boolean) => void }) {
  const [text, setText] = useState(image.text);
  const [said, setSaid] = useState<string | null>(null);
  const sound = isSoundKind(image.kind);
  const id = `af-text-${image.id.replace(/[^a-z0-9-]/gi, "-")}`;
  async function save(value: string | null) {
    const answer = await post<{ text: string }>({ action: "text", id: image.id, text: value });
    if (answer.ok) {
      setText(answer.value.text);
      onSaved(answer.value.text, value !== null && value.trim() !== "");
    }
    setSaid(answer.ok ? "Saved." : answer.message);
  }
  return (
    <div className="af-stack">
      <label className="af-small" htmlFor={id}>
        {sound ? "Caption, for people who cannot hear it" : "Alt text, read out by screen readers"}
        {image.textEdited ? " (edited here)" : ""}
      </label>
      <textarea id={id} value={text} rows={2} maxLength={500} onChange={(event) => setText(event.target.value)} className="af-textarea" placeholder={sound ? "[A door creaks open]" : "What the picture shows, in a sentence"} />
      <div className="af-row">
        <button type="button" className="af-btn" onClick={() => void save(text)}>
          Save {sound ? "caption" : "alt text"}
        </button>
        {image.textEdited ? (
          <button type="button" className="af-btn" onClick={() => void save(null)}>
            Back to the catalogue&rsquo;s
          </button>
        ) : null}
        {said ? (
          <span role="status" className="af-small">
            {said}
          </span>
        ) : null}
      </div>
    </div>
  );
}

