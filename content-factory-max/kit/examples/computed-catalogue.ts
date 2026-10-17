/**
 * Example: a catalogue worked out from the game's own data, plus an approve
 * hook. This is the generic version of DnD-Max's "Creatures with no picture"
 * group: every monster the game knows that still has no art becomes a job,
 * and approving one tells the game it has a face now.
 *
 * Use it from `art-factory.config.ts`:
 *
 * ```ts
 * catalogue: jsonCatalogue(catalogueFile as CatalogueFile, {
 *   extra: () => [missingPortraits(allMonsters(), (name) => hasArt(name))],
 *   onApprove: rememberPortrait,
 * }),
 * ```
 */
import { slugOf } from "../lib/art-factory/core/prompts";
import type { ApprovedPicture, FactoryGroup, FactoryJob } from "../lib/art-factory/core/types";

export function missingPortraits(creatures: readonly { name: string; summary?: string }[], hasArt: (name: string) => boolean): FactoryGroup {
  const seen = new Set<string>();
  const jobs: FactoryJob[] = [];
  for (const creature of creatures) {
    const name = creature.name.replace(/\s+/g, " ").trim();
    // The id is written into saved games, so it comes from the name and nothing that changes.
    const id = `made-${slugOf(name, 6)}`;
    if (!name || seen.has(id) || hasArt(name)) continue;
    seen.add(id);
    const key = `creatures/${id}`;
    jobs.push({
      key,
      group: "creatures",
      id,
      title: name,
      meta: "1 token · 512² card + 96² icon",
      note: "Shown as a placeholder until this is approved.",
      images: [
        {
          id: `${key}/01`,
          jobKey: key,
          group: "creatures",
          number: 1,
          description: name,
          prompt: `A game token of ${/^[aeiou]/i.test(name) ? "an" : "a"} ${name.toLowerCase()}${creature.summary ? `: ${creature.summary}` : ""}. One creature only, the whole silhouette inside the frame with clear space around it.`,
          aspect: "1:1",
          target: `art/creatures/${id}-card.webp`,
          outputs: [
            { path: `art/creatures/${id}-card.webp`, width: 512, height: 512, fit: "contain" },
            { path: `art/creatures/${id}-icon.webp`, width: 96, height: 96, fit: "contain" },
          ],
          seeThrough: true,
          data: { creatureId: id, name },
        },
      ],
    });
  }
  return {
    id: "creatures",
    title: "Creatures with no picture",
    intro: "Worked out from the game's data, not written: approve one and it leaves this list.",
    style: "House style for creature tokens: one creature, painted, soft top light, strong readable silhouette, on a fully transparent background. No text, no border, no base.",
    jobs,
  };
}

/** What a game might do when one goes live: here, just remember which creature now has which picture. */
export async function rememberPortrait({ image, files }: ApprovedPicture): Promise<void> {
  const creatureId = image.data?.creatureId;
  if (typeof creatureId !== "string") return;
  console.log(`[game] ${creatureId} now has art at`, Object.keys(files));
}
