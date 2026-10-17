/**
 * The refusal helper's "soften the words" (Max, 2026-10-16: "Both": soften
 * the words, shown before the redraw, or try the other provider).
 *
 * Picture makers refuse game violence by the word, not the idea: in DnD-Max
 * both failures were OpenAI safety refusals on fight scenes. This swaps the
 * words that trip the filters for gentler ones that still draw the same
 * scene ("a bloody axe" → "a battle-worn axe"), and says exactly what it
 * changed, so the admin reads it and confirms before anything is redrawn.
 *
 * Plain word swaps, no AI: free, instant, predictable. Pure.
 */
export interface SoftenResult {
  text: string;
  changes: { from: string; to: string }[];
}

/** Word (or phrase) → gentler stand-in. Longer phrases first, so "blood-soaked" wins over "blood". */
const swaps: readonly [RegExp, string][] = [
  [/\bblood[- ]?(?:soaked|stained|spattered|splattered|covered)\b/gi, "battle-worn"],
  [/\b(?:pool|pools|puddle|spray|splatter)s? of blood\b/gi, "scattered debris"],
  [/\bdecapitat(?:ed|ion|ing|e)\b/gi, "defeated"],
  [/\bdismember(?:ed|ment|ing)?\b/gi, "defeated"],
  [/\bdisembowel(?:ed|led|ing)?\b/gi, "defeated"],
  [/\bimpal(?:ed|ing|e)\b/gi, "pinned"],
  [/\bmutilat(?:ed|ion|ing|e)\b/gi, "battered"],
  [/\bsever(?:ed)? (?:head|heads|limb|limbs|arm|arms|leg|legs)\b/gi, "fallen armour"],
  [/\b(?:corpse|corpses|dead body|dead bodies|carcass|carcasses)\b/gi, "fallen figures"],
  [/\bgor(?:e|y)\b/gi, "dramatic"],
  [/\bgrisly\b/gi, "grim"],
  [/\bgruesome\b/gi, "grim"],
  [/\bbloody\b/gi, "battle-worn"],
  [/\bbleeding\b/gi, "wounded"],
  [/\bblood\b/gi, "red paint"],
  [/\bentrails\b/gi, "debris"],
  [/\bguts\b/gi, "debris"],
  [/\b(?:massacre|slaughter|carnage)\b/gi, "great battle"],
  [/\bslaughter(?:ed|ing)\b/gi, "defeated"],
  [/\bmurder(?:ed|ing|s)?\b/gi, "defeat"],
  [/\bkill(?:ed|ing|s)?\b/gi, "defeat"],
  [/\bstab(?:bed|bing|s)?\b/gi, "strike"],
  [/\b(?:torture|tortured|torturing)\b/gi, "captive"],
  [/\bexecution\b/gi, "showdown"],
  [/\bhanged\b/gi, "captured"],
  [/\bsuicide\b/gi, "despair"],
  [/\bnaked\b/gi, "unarmoured"],
  [/\bnude\b/gi, "unarmoured"],
];

/** Keeps the first letter's case of the word it replaces. */
const matchCase = (found: string, swap: string) => (/^[A-Z]/.test(found) ? swap.charAt(0).toUpperCase() + swap.slice(1) : swap);

/** The words with the filter-tripping ones swapped, and the list of every change. Empty `changes` means nothing to soften. */
export function softenWords(text: string): SoftenResult {
  let out = text;
  const changes: { from: string; to: string }[] = [];
  for (const [pattern, swap] of swaps) {
    out = out.replace(pattern, (found) => {
      const to = matchCase(found, swap);
      if (!changes.some((one) => one.from.toLowerCase() === found.toLowerCase())) changes.push({ from: found, to });
      return to;
    });
  }
  // A swap can leave "a battle-worn battle-worn axe": say it once.
  out = out.replace(/\b(\w[\w-]*)( \1\b)+/gi, "$1");
  return { text: out, changes };
}
