/**
 * The art factory's shapes (ported from DnD-Max, 2026-10-16).
 *
 * A **catalogue** says what the project needs drawn: groups (icons, enemies,
 * backgrounds), each holding jobs, each cut into single pictures. Every
 * picture knows the words to send, where it lands, and every size it is cut
 * to on approval. The factory itself never knows what a game is about; the
 * catalogue is the one project-specific piece.
 *
 * Pure: no provider, no store, no network.
 */
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

export interface FactoryImage {
  /** `<jobKey>/<NN>`, stable while the job's list keeps its order. */
  id: string;
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
}

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
}

/**
 * The one project-specific piece: what to draw, and what to do when a picture
 * is approved. `groups` may be computed (every enemy in the game data with no
 * picture yet) as long as ids stay stable.
 */
export interface ArtCatalogue {
  groups(): readonly FactoryGroup[] | Promise<readonly FactoryGroup[]>;
  /** Called after every size of an approved picture is written. Errors are logged, never undo the approval. */
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
