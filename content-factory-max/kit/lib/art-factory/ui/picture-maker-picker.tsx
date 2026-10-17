"use client";

import { useEffect, useState } from "react";

import { artApi, money, read, send } from "./api";

/**
 * Which picture maker draws, and on OpenAI which model and quality (ported
 * from DnD-Max, 2026-10-16). Max: *"i should be able to switch models/systems
 * on the art factory page, dont wanna go thru admin and all that anytime i
 * want it switched"*. So every click saves at once: no Save button. One
 * setting for the whole site; the factory and Make art both use it.
 */
type Quality = "low" | "medium" | "high";
type Name = "openai" | "google" | "practice";

export interface PickerSettings {
  dailyCap: number | null;
  provider: Name | null;
  activeProvider: Name | null;
  keyFrom: string | null;
  providers: { name: Name; label: string; configured: boolean; keyFrom: string | null; model: string }[];
  openaiModel: string;
  openaiQuality: Quality;
  openaiModels: { id: string; label: string; note: string; usd: Record<Quality, number | null> }[];
}

const qualities: readonly { id: Quality; label: string; hint: string }[] = [
  { id: "low", label: "Low", hint: "rough drafts, fast" },
  { id: "medium", label: "Medium", hint: "the default" },
  { id: "high", label: "High", hint: "finest detail, about four times medium" },
];

const short: Record<Name, string> = { openai: "OpenAI", google: "Google", practice: "Practice (free)" };
const keyHint: Record<Name, string> = { openai: "OPENAI_API_KEY_ImageGen", google: "GOOGLE_API_KEY_ImageGen", practice: "" };

export const fetchPickerSettings = () => read<PickerSettings>(artApi.settings);

export function PictureMakerPicker({ onChanged }: { onChanged?: () => void }) {
  const [settings, setSettings] = useState<PickerSettings | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetchPickerSettings().then((next) => {
      if (live) setSettings(next);
    });
    return () => {
      live = false;
    };
  }, []);

  if (settings === undefined) return <p className="af-muted">Reading which picture maker is on…</p>;
  if (settings === null) return <p className="af-muted">Could not read the picture maker settings.</p>;

  const active = settings.activeProvider;
  const model = settings.openaiModel;
  const quality = settings.openaiQuality;
  const chosenModel = settings.openaiModels.find((one) => one.id === model);

  async function save(change: Record<string, unknown>, words: string) {
    setSaving(true);
    setSaid(null);
    const answer = await send<PickerSettings>(artApi.settings, change);
    if (answer.ok) {
      setSettings(answer.value);
      setSaid(`Switched: ${words}.`);
      onChanged?.();
    } else {
      setSaid(answer.message);
    }
    setSaving(false);
  }

  return (
    <div className="af-stack">
      <div role="radiogroup" aria-label="Picture maker" className="af-row">
        <span style={{ fontWeight: 650 }}>Picture maker</span>
        {settings.providers.map((row) => (
          <button
            key={row.name}
            type="button"
            role="radio"
            aria-checked={active === row.name}
            disabled={!row.configured || saving}
            title={row.configured ? (row.name === "practice" ? "Free placeholder pictures, to rehearse the whole flow" : `Key found in ${row.keyFrom}`) : `Not set up: add ${keyHint[row.name]} to the environment variables and redeploy`}
            className="af-btn"
            onClick={() => active !== row.name && void save({ provider: row.name }, row.label)}
          >
            {short[row.name]}
            {!row.configured ? <span className="af-muted" style={{ fontWeight: 400 }}> · no key</span> : null}
          </button>
        ))}
      </div>

      {active === "openai" ? (
        <>
          <div role="radiogroup" aria-label="OpenAI model" className="af-row">
            <span style={{ fontWeight: 650 }}>Model</span>
            {settings.openaiModels.map((row) => (
              <button key={row.id} type="button" role="radio" aria-checked={model === row.id} disabled={saving} title={row.note} className="af-btn" onClick={() => model !== row.id && void save({ openaiModel: row.id, openaiQuality: quality }, `${row.label}, ${quality}`)}>
                {row.label} <span className="af-muted" style={{ fontWeight: 400 }}>{money(row.usd[quality])}</span>
              </button>
            ))}
          </div>
          <div role="radiogroup" aria-label="Quality" className="af-row">
            <span style={{ fontWeight: 650 }}>Quality</span>
            {qualities.map((one) => (
              <button key={one.id} type="button" role="radio" aria-checked={quality === one.id} disabled={saving} title={one.hint} className="af-btn" onClick={() => quality !== one.id && void save({ openaiModel: model, openaiQuality: one.id }, `${chosenModel?.label ?? model}, ${one.id}`)}>
                {one.label} <span className="af-muted" style={{ fontWeight: 400 }}>{money(chosenModel?.usd[one.id])}</span>
              </button>
            ))}
          </div>
          <p className="af-small af-muted">
            {chosenModel ? `${chosenModel.label}: ${chosenModel.note}. ` : ""}Prices are about a square picture; tall and wide ones cost about half as much again. Tokens, icons and items are drawn on a see-through background.
          </p>
        </>
      ) : active === "google" ? (
        <p className="af-small af-muted">Google draws with {settings.providers.find((one) => one.name === "google")?.model}. It cannot draw see-through backgrounds, so tokens and icons come back on a plain ground (OpenAI can).</p>
      ) : active === "practice" ? (
        <p className="af-small af-muted">Practice draws free placeholder cards with each picture&rsquo;s name, so you can rehearse queue → review → approve → every size cut. Approving one puts the placeholder live at its path, so switch to a real maker before the real run.</p>
      ) : (
        <p>No picture maker is on yet. Add OPENAI_API_KEY_ImageGen (or GOOGLE_API_KEY_ImageGen) to the environment variables and redeploy, or pick Practice to rehearse for free.</p>
      )}

      {said || saving ? (
        <p role="status" className="af-small af-muted">
          {saving ? "Switching…" : said}
        </p>
      ) : null}
    </div>
  );
}

/** Make art's daily limit for everybody but the admin. */
export function MakeArtLimit() {
  const [loaded, setLoaded] = useState<boolean | null>(null);
  const [limited, setLimited] = useState(true);
  const [cap, setCap] = useState("5");
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetchPickerSettings().then((next) => {
      if (!live) return;
      setLoaded(next !== null);
      if (next) {
        setLimited(next.dailyCap !== null);
        setCap(String(next.dailyCap ?? 5));
      }
    });
    return () => {
      live = false;
    };
  }, []);

  if (loaded === null) return null;
  if (!loaded) return <p className="af-muted">Could not read the daily limit.</p>;
  return (
    <div className="af-row">
      <span style={{ fontWeight: 650 }}>Make art limit</span>
      <label className="af-row">
        <input type="checkbox" checked={!limited} onChange={(event) => setLimited(!event.target.checked)} /> No limit
      </label>
      {limited ? (
        <label className="af-row">
          <input type="number" aria-label="Pictures per person per day" min={0} max={10000} value={cap} onChange={(event) => setCap(event.target.value)} className="af-input af-tiny" /> pictures per person per day
        </label>
      ) : null}
      <button
        type="button"
        className="af-btn"
        onClick={async () => {
          const dailyCap = limited ? Number(cap) : null;
          const answer = await send(artApi.settings, { dailyCap });
          setSaid(answer.ok ? `Saved: ${dailyCap === null ? "no limit" : `${dailyCap} a day`}.` : answer.message);
        }}
      >
        Save limit
      </button>
      <span className="af-small af-muted">The admin is never limited.</span>
      {said ? (
        <span role="status" className="af-small">
          {said}
        </span>
      ) : null}
    </div>
  );
}
