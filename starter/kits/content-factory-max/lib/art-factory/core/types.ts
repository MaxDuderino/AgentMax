/**
 * Content Factory MAX's shapes (ported from DnD-Max's Art Factory, 2026-10-16;
 * media-neutral since 2026-10-17).
 *
 * A **catalogue** says what the project needs made: groups (icons, enemies,
 * voice lines, music), each holding jobs, each cut into single items. Every
 * item has a **kind** (a picture, a voice line, a sound effect or a piece of
 * music), the words to send, where it lands and, for a picture, every size it
 * is cut to on approval. The factory itself never knows what a game is about;
 * the catalogue is the one project-specific piece.
 *
 * Pure: no provider, no store, no network.
 */
export type ContentKind = "image" | "voice" | "sfx" | "music";

export const contentKinds: readonly ContentKind[] = ["image", "voice", "sfx", "music"];

/** How each kind is named on screen, one and many. */
export const kindNames: Readonly<Record<ContentKind, { one: string; many: string }>> = {
  image: { one: "picture", many: "pictures" },
  voice: { one: "voice line", many: "voice lines" },
  sfx: { one: "sound effect", many: "sound effects" },
  music: { one: "piece of music", many: "pieces of music" },
};

export const isSound = (kind: ContentKind | undefined) => kind === "voice" || kind === "sfx" || kind === "music";

export type SoundFormat = "mp3" | "wav" | "ogg";

export const soundFormats: readonly SoundFormat[] = ["mp3", "wav", "ogg"];

export type ArtAspect = "1:1" | "4:3" | "3:4" | "2:3" | "3:2" | "16:9" | "9:16";

export const artAspects: readonly ArtAspect[] = ["1:1", "4:3", "3:4", "2:3", "3:2", "16:9", "9:16"];

/** One file written when a picture is approved. */
export interface FactoryOutput {
  /** Relative to the site root, no leading slash: `art/icons/heart.webp`. */
  path: string;
  width: number;
  height: number;
  /**
   * `cover` fills the frame and crops the overflow (backgrounds, portraits);
   * `contain` keeps the whole silhouette on a transparent ground (tokens,
   * icons, objects).
   */
  fit: "cover" | "contain";
}

/**
 * One item to make. Named `FactoryImage` from when the factory only drew
 * pictures; `FactoryItem` is the same thing. A sound has no sizes: `outputs`
 * is empty and the made file is written to `target` as it came.
 */
export interface FactoryImage {
  /** `<jobKey>/<NN>`, stable while the job's list keeps its order. */
  id: string;
  /** What it is. Absent means a picture (computed catalogues written before kinds need no change); read it with {@link kindOf}. */
  kind?: ContentKind;
  jobKey: string;
  group: string;
  number: number;
  /** A short label for the list and the review tray. */
  description: string;
  /** The single-picture prompt, before the group's style block. */
  prompt: string;
  aspect: ArtAspect;
  /** The main file: the first output. */
  target: string;
  outputs: readonly FactoryOutput[];
  /** Ask for a see-through ground. Absent: worked out from the words and the outputs. */
  seeThrough?: boolean;
  /** Anything the project wants handed back to `onApprove` (a creature id, a card id). */
  data?: Readonly<Record<string, unknown>>;
  /** A picture's alt text, read out by screen readers. Asset Forge drafts it; the admin can change it in review. */
  alt?: string;
  /** A sound's caption, shown to people who cannot hear it ("[A door creaks open]"). */
  caption?: string;
  /** A sound's file type. Default mp3. */
  format?: SoundFormat;
  /** About how long a sound should be, in seconds (music, effects). */
  seconds?: number;
  /** A sound meant to loop (music, ambience). */
  loop?: boolean;
  /** Which voice reads a voice line (a provider's voice name). */
  voice?: string;
}

export type FactoryItem = FactoryImage;

export const kindOf = (item: Pick<FactoryImage, "kind">): ContentKind => item.kind ?? "image";

export interface FactoryJob {
  key: string;
  group: string;
  id: string;
  title: string;
  meta: string;
  note: string;
  images: readonly FactoryImage[];
}

export interface FactoryGroup {
  id: string;
  title: string;
  intro?: string;
  /** The default style block put in front of every picture in this group. An admin can change it in the factory. */
  style?: string;
  jobs: readonly FactoryJob[];
}

/** What the factory hands the project when a picture goes live. */
export interface ApprovedPicture {
  image: FactoryImage;
  /** Every file written: relative path → served URL. */
  files: Readonly<Record<string, string>>;
  at: string;
  /** The alt text (picture) or caption (sound) as it stands, edits included. */
  text?: string;
  /** True when this is a picture put back from its previous version, not a new one. */
  putBack?: boolean;
}

/**
 * The one project-specific piece: what to draw, and what to do when a picture
 * is approved. `groups` may be computed (every enemy in the game data with no
 * picture yet) as long as ids stay stable.
 */
export interface ArtCatalogue {
  groups(): readonly FactoryGroup[] | Promise<readonly FactoryGroup[]>;
  /** Called after every size of an approved picture is written. A throw never undoes the approval: the factory marks it and offers a retry. */
  onApprove?(picture: ApprovedPicture): void | Promise<void>;
}

export interface IndexedCatalogue {
  groups: readonly FactoryGroup[];
  byId: ReadonlyMap<string, FactoryImage>;
}

export function indexCatalogue(groups: readonly FactoryGroup[]): IndexedCatalogue {
  const byId = new Map<string, FactoryImage>();
  for (const group of groups) for (const job of group.jobs) for (const image of job.images) if (!byId.has(image.id)) byId.set(image.id, image);
  return { groups, byId };
}

export function allImages(groups: readonly FactoryGroup[]): FactoryImage[] {
  return groups.flatMap((group) => group.jobs.flatMap((job) => job.images));
}
