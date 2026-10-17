"use client";

import { useEffect, useState } from "react";

import { makeArtPrompt, type MakeArtKind, type MakeArtSubject } from "../core/make-art-prompt";
import { artApi, read } from "./api";

/**
 * ✨ Make art, anywhere something is being built (ported from DnD-Max, Issue
 * 324). Drop it next to a level, a card, a character:
 *
 * ```tsx
 * <MakeArtButton subject={{ kind: "character", name: hero.name, text: hero.bio }} onMade={({ url }) => setPortrait(url)} />
 * ```
 *
 * The words are written for you from the subject and are yours to change
 * before anything is sent. Who may use it and the daily cap come from the
 * server (`/api/art/make`).
 */
interface MakeStatus {
  allowed: boolean;
  on: boolean;
  admin: boolean;
  cap: number | null;
  remaining: number | null;
  kinds: Record<string, MakeArtKind>;
}

export function MakeArtButton({
  subject,
  onMade,
  disabled = false,
  label = "Make art",
}: {
  subject: MakeArtSubject;
  onMade: (made: { key: string; url: string }) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<MakeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [made, setMade] = useState<string | null>(null);

  // By value, so a subject written inline (a new object every render) does not refetch every render.
  const subjectKey = JSON.stringify(subject);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void read<MakeStatus>(artApi.make).then((next) => {
      if (!live) return;
      setStatus(next);
      // The server's style blocks win over the defaults, so the words match the project's style bible.
      if (next) setPrompt((current) => (current ? current : makeArtPrompt(JSON.parse(subjectKey) as MakeArtSubject, next.kinds)));
    });
    return () => {
      live = false;
    };
  }, [open, subjectKey]);

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        className="af-btn"
        onClick={() => {
          setPrompt("");
          setProblem(null);
          setMade(null);
          setOpen(true);
        }}
      >
        ✨ {label}
      </button>
    );
  }

  const left = status?.admin ? "You are the admin: no daily limit." : status && status.remaining !== null && status.cap !== null ? `${status.remaining} of ${status.cap} left today.` : "";
  const blocked = status !== null && (!status.allowed || !status.on);

  return (
    <div className="af-line" role="group" aria-label="Make art">
      <p className="af-kicker">Make art</p>
      {status && !status.allowed ? <p className="af-small af-muted">Making pictures is for signed-in builders on this site.</p> : status && !status.on ? <p className="af-small af-muted">Making pictures is not switched on for this site yet.</p> : null}
      <label className="af-small" htmlFor="af-make-words">
        What the picture should show (change anything)
      </label>
      <textarea id="af-make-words" value={prompt} rows={6} maxLength={4000} onChange={(event) => setPrompt(event.target.value)} className="af-textarea" />
      {left ? <p className="af-small af-muted">{left}</p> : null}
      <div className="af-row">
        <button
          type="button"
          disabled={disabled || busy || blocked}
          className="af-btn af-go"
          onClick={async () => {
            setBusy(true);
            setProblem(null);
            try {
              const response = await fetch(artApi.make, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, kind: subject.kind }) });
              const body = (await response.json().catch(() => ({}))) as { key?: string; url?: string; remaining?: number | null; error?: { message: string } };
              if (!response.ok || !body.key || !body.url) {
                setProblem(body.error?.message ?? "The picture maker did not answer properly. Nothing was used up; try again in a minute.");
                return;
              }
              setMade(body.url);
              setStatus((current) => (current && body.remaining !== undefined ? { ...current, remaining: body.remaining ?? null } : current));
              onMade({ key: body.key, url: body.url });
            } catch {
              setProblem("No answer from the server. Nothing was used up; try again in a minute.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Drawing… (this takes a few seconds)" : "Make it"}
        </button>
        <button type="button" className="af-btn" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      {made ? (
        <figure className="af-figure">
          {/* eslint-disable-next-line @next/next/no-img-element -- a picture just made */}
          <img src={made} alt={`Made from: ${prompt.slice(0, 120)}`} className="af-checker" />
          <figcaption className="af-small af-muted">Placed, and saved. Marked as AI-made. Make it again for another try.</figcaption>
        </figure>
      ) : null}
      {problem ? (
        <p role="alert" className="af-small af-bad-text">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
