import { aspectForSize, capped, singlePrompt, slugOf, splitBatch, itemBody, wantsSeeThrough } from "./prompts";
import { artAspects, type ApprovedPicture, type ArtAspect, type ArtCatalogue, type FactoryGroup, type FactoryImage, type FactoryOutput } from "./types";

/**
 * The catalogue file Asset Forge writes (`art/art-catalogue.json`), turned
 * into the factory's groups. Most projects need nothing else: Asset Forge
 * keeps the list, the factory makes it.
 *
 * ```json
 * {
 *   "version": 1,
 *   "project": "Space Snacks",
 *   "root": "art",
 *   "sizes": { "icon": [{ "suffix": "", "width": 256, "height": 256, "fit": "contain" }, { "suffix": "-small", "width": 64, "height": 64, "fit": "contain" }] },
 *   "groups": [{
 *     "id": "icons", "title": "Icons", "style": "House style for icons: ...",
 *     "jobs": [
 *       { "id": "ui", "title": "Interface icons", "dir": "icons", "sizes": "icon",
 *         "images": [{ "name": "Heart", "file": "heart", "prompt": "A glossy red heart ..." }] },
 *       { "id": "enemies", "title": "Enemies, batch of 3", "dir": "enemies", "sizes": "icon",
 *         "batch": "Three enemies for a space game.\n\n1. A slime...\n2. A drone...\n3. A crab...\n\nKeep them cute." }
 *     ]
 *   }]
 * }
 * ```
 *
 * A file lands at `<root>/<dir>/<file><suffix>.webp`. `sizes` is a named
 * preset or an inline list; a job with neither gets one 1024² `cover`.
 *
 * Picture ids are `<group>/<job>/<id or file>` for listed images and
 * `<group>/<job>/<NN>` for a batch's items. The factory remembers every
 * picture by its id, so do not reuse an id for a different picture.
 */
export interface CatalogueSize {
  suffix?: string;
  width: number;
  height: number;
  fit?: "cover" | "contain";
}

export interface CatalogueImageEntry {
  /** Stable id inside the job (Asset Forge uses the asset's id). Absent: the file name. Never reuse one for a different picture. */
  id?: string;
  name: string;
  /** File name without extension; absent is a slug of `name`. */
  file?: string;
  prompt: string;
  sizes?: string | readonly CatalogueSize[];
  aspect?: ArtAspect;
  seeThrough?: boolean;
  data?: Record<string, unknown>;
}

export interface CatalogueJobEntry {
  id: string;
  title: string;
  meta?: string;
  note?: string;
  dir?: string;
  sizes?: string | readonly CatalogueSize[];
  aspect?: ArtAspect;
  seeThrough?: boolean;
  images?: readonly CatalogueImageEntry[];
  /** A numbered batch prompt, cut into one picture per item. */
  batch?: string;
}

export interface CatalogueGroupEntry {
  id: string;
  title: string;
  intro?: string;
  style?: string;
  jobs: readonly CatalogueJobEntry[];
}

export interface CatalogueFile {
  version?: number;
  project?: string;
  root?: string;
  sizes?: Readonly<Record<string, readonly CatalogueSize[]>>;
  groups: readonly CatalogueGroupEntry[];
}

const two = (n: number) => String(n).padStart(2, "0");
const cleanPart = (part: string) => part.replace(/^\.?\/+/, "").replace(/^public\//, "").replace(/\/+$/, "");

/** Every problem with a catalogue file, in plain English. Empty means it is fine. */
export function checkCatalogue(file: unknown): string[] {
  const problems: string[] = [];
  const data = file as Partial<CatalogueFile> | null;
  if (!data || typeof data !== "object" || !Array.isArray(data.groups)) return ["The catalogue needs a `groups` list."];
  const groupIds = new Set<string>();
  for (const group of data.groups) {
    if (!group?.id || !/^[a-z0-9][a-z0-9-]*$/.test(group.id)) problems.push(`A group id must be lower-case letters, numbers and dashes (got "${group?.id}").`);
    if (groupIds.has(group.id)) problems.push(`Two groups are called "${group.id}".`);
    groupIds.add(group.id);
    const jobIds = new Set<string>();
    for (const job of group.jobs ?? []) {
      if (!job?.id || !/^[a-z0-9][a-z0-9-]*$/.test(job.id)) problems.push(`In ${group.id}: a job id must be lower-case letters, numbers and dashes (got "${job?.id}").`);
      if (jobIds.has(job.id)) problems.push(`In ${group.id}: two jobs are called "${job.id}".`);
      jobIds.add(job.id);
      if (!job.images?.length && !job.batch) problems.push(`${group.id}/${job.id} has no images and no batch prompt.`);
      for (const sizes of [job.sizes, ...(job.images ?? []).map((one: CatalogueImageEntry) => one.sizes)]) {
        if (typeof sizes === "string" && !data.sizes?.[sizes]) problems.push(`${group.id}/${job.id} asks for size preset "${sizes}", which the catalogue does not define.`);
      }
      for (const aspect of [job.aspect, ...(job.images ?? []).map((one: CatalogueImageEntry) => one.aspect)]) {
        if (aspect && !artAspects.includes(aspect)) problems.push(`${group.id}/${job.id}: aspect "${aspect}" is not one of ${artAspects.join(", ")}.`);
      }
      const files = new Set<string>();
      const ids = new Set<string>();
      for (const image of job.images ?? []) {
        if (!image.prompt?.trim()) problems.push(`${group.id}/${job.id}: "${image.name}" has no prompt.`);
        const name = image.file ?? slugOf(image.name ?? "");
        if (files.has(name)) problems.push(`${group.id}/${job.id}: two pictures would both be saved as "${name}".`);
        files.add(name);
        const id = image.id ?? name;
        if (image.id !== undefined && !/^[a-z0-9][a-z0-9_-]*$/i.test(image.id)) problems.push(`${group.id}/${job.id}: picture id "${image.id}" may only use letters, numbers, - and _.`);
        else if (ids.has(id) && image.id !== undefined) problems.push(`${group.id}/${job.id}: two pictures have the id "${id}".`);
        ids.add(id);
      }
    }
  }
  return problems;
}

function sizesOf(file: CatalogueFile, wanted: string | readonly CatalogueSize[] | undefined): CatalogueSize[] {
  if (typeof wanted === "string") return [...(file.sizes?.[wanted] ?? [])];
  if (Array.isArray(wanted) && wanted.length > 0) return [...wanted];
  return [{ width: 1024, height: 1024, fit: "cover" }];
}

function outputsFor(base: string, sizes: readonly CatalogueSize[]): FactoryOutput[] {
  return sizes.map((size, index) => ({
    path: `${base}${size.suffix ?? (index === 0 ? "" : `-${size.width}x${size.height}`)}.webp`,
    ...capped({ width: size.width, height: size.height }),
    fit: size.fit ?? "cover",
  }));
}

/** The catalogue file as factory groups. */
export function groupsFromFile(file: CatalogueFile): FactoryGroup[] {
  const root = file.root ? cleanPart(file.root) : "";
  return file.groups.map((group) => ({
    id: group.id,
    title: group.title,
    ...(group.intro ? { intro: group.intro } : {}),
    ...(group.style ? { style: group.style } : {}),
    jobs: group.jobs.map((job) => {
      const key = `${group.id}/${job.id}`;
      const dir = [root, cleanPart(job.dir ?? `${group.id}/${job.id}`)].filter(Boolean).join("/");
      // Listed pictures are known by their own id (or file name), so reordering or removing one never shifts the rest.
      // A batch's items have no names of their own, so they are numbered: keep a batch's order when editing it.
      const entries: { slot: string; name: string; file: string; prompt: string; entry?: CatalogueImageEntry }[] = [];
      if (job.images?.length) {
        for (const image of job.images) {
          const fileName = image.file ?? slugOf(image.name);
          entries.push({ slot: image.id ?? fileName, name: image.name, file: fileName, prompt: image.prompt, entry: image });
        }
      } else if (job.batch) {
        const { head, items, tail } = splitBatch(job.batch);
        if (items.length === 0) entries.push({ slot: "01", name: job.title, file: slugOf(job.title), prompt: job.batch.trim() });
        items.forEach((item, index) => {
          const description = itemBody(item);
          entries.push({ slot: two(index + 1), name: description, file: `${two(index + 1)}-${slugOf(description, 4)}`, prompt: singlePrompt(head, item, tail, index + 1, items.length) });
        });
      }
      const images: FactoryImage[] = entries.map((one, index) => {
        const outputs = outputsFor(`${dir}/${one.file}`, sizesOf(file, one.entry?.sizes ?? job.sizes));
        const first = outputs[0]!;
        const seeThrough = one.entry?.seeThrough ?? job.seeThrough;
        return {
          id: `${key}/${one.slot}`,
          jobKey: key,
          group: group.id,
          number: index + 1,
          description: one.name.length > 220 ? `${one.name.slice(0, 217)}…` : one.name,
          prompt: one.prompt.trim(),
          aspect: one.entry?.aspect ?? job.aspect ?? aspectForSize(first.width, first.height),
          target: first.path,
          outputs,
          seeThrough: seeThrough ?? wantsSeeThrough(one.prompt, outputs),
          ...(one.entry?.data ? { data: one.entry.data } : {}),
        };
      });
      const first = images[0]?.outputs[0];
      return {
        key,
        group: group.id,
        id: job.id,
        title: job.title,
        meta: job.meta ?? `${images.length} ${images.length === 1 ? "picture" : "pictures"}${first ? ` · ${first.width}×${first.height}` : ""} · → ${dir}/`,
        note: job.note ?? "",
        images,
      };
    }),
  }));
}

/**
 * A catalogue from the JSON file. Pass `onApprove` to do something when a
 * picture goes live (update a game's data, ping a webhook). Throws on load if
 * the file has problems, so a broken catalogue is a failed build, not a quiet
 * empty factory.
 */
export function jsonCatalogue(file: CatalogueFile, options: { onApprove?: (picture: ApprovedPicture) => void | Promise<void>; extra?: () => readonly FactoryGroup[] | Promise<readonly FactoryGroup[]> } = {}): ArtCatalogue {
  const problems = checkCatalogue(file);
  if (problems.length) throw new Error(`The art catalogue has problems:\n- ${problems.join("\n- ")}`);
  const built = groupsFromFile(file);
  return {
    groups: async () => (options.extra ? [...(await options.extra()), ...built] : built),
    ...(options.onApprove ? { onApprove: options.onApprove } : {}),
  };
}
