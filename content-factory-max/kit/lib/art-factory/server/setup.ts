import { defaultMakeArtKinds, type MakeArtKind } from "../core/make-art-prompt";
import { indexCatalogue, type ArtCatalogue, type ContentKind, type IndexedCatalogue } from "../core/types";
import { passwordGate, type AdminGate } from "./admin-gate";
import { MemoryArtStore, R2ArtStore, type ArtStore } from "./art-store";
import type { FactoryDeps } from "./factory-service";
import { FactoryStore } from "./factory-store";
import { meteredImageProvider, type ImageProvider, type ImageProviderName } from "./image-provider";
import { kvFromEnv, MemoryKv, redisCredentials, type Env, type Kv } from "./kv";
import { meteredMaker, practiceMaker, type Maker } from "./maker";
import type { MakeArtDeps } from "./make-art-service";
import { activeProvider, ArtSettingsStore, buildProvider, defaultKeyNames, readProviderName, type ArtSettings } from "./providers";
import { R2Client, r2Config } from "./r2-client";
import { UsageLedger } from "./usage/usage-ledger";
import { sharpConverter, type ImageConverter } from "./webp";

/**
 * One project's Content Factory MAX, wired (the kit's front door).
 *
 * `art-factory.config.ts` at the project root calls this once with the
 * project's catalogue and name. Everything else has a working default:
 * Redis and R2 from the environment (memory when they are not set), the
 * password gate for admin, OpenAI or Google from whichever key is present,
 * and Practice for every kind.
 */
export interface ArtFactoryConfig {
  /** Shown on the pages. */
  appName: string;
  /** Starts every Redis key, so projects can share one database: lower-case, no spaces. */
  prefix: string;
  catalogue: ArtCatalogue;
  /** Defaults to `process.env`. */
  env?: Env;
  /** The project's own admin check. Default: the `ADMIN_PASSWORD` gate. */
  isAdmin?: (request: Request) => boolean | Promise<boolean>;
  /** Who may use the Make art buttons, by a stable id (an account id). Default: only the admin. */
  whoIs?: (request: Request) => string | null | Promise<string | null>;
  /** Make art's kinds and their style blocks. Asset Forge writes these from the style bible. */
  makeArtKinds?: Readonly<Record<string, MakeArtKind>>;
  /** Offer free practice pictures (and practice sounds) on the switcher. Default true. */
  practice?: boolean;
  /**
   * Makers for voice lines, sound effects and music: anything with `kinds`
   * and `make` (see `lib/art-factory/server/maker.ts`). Each is metered under
   * its own name, in its own unit. One that lists "image" replaces the
   * picture switcher. While the switcher is on Practice, kinds with no maker
   * here get free practice sounds.
   */
  makers?: readonly Maker[];
  /** Env var names each provider's key may be under, in order. */
  keyNames?: typeof defaultKeyNames;
  /** When a path has no approved art, send the browser to `/<path>` (the public folder). Default true. */
  fallbackToPublic?: boolean;
  /** Where the admin pages live, for links. Default `/admin`. */
  adminBase?: string;
  // For tests and unusual hosts:
  kv?: Kv;
  art?: ArtStore;
  convert?: ImageConverter;
  /** Replaces the real picture makers. Tests only. */
  providerFor?: (name: ImageProviderName, settings: ArtSettings) => ImageProvider;
  now?: () => Date;
}

export interface ArtFactory {
  config: Required<Pick<ArtFactoryConfig, "appName" | "prefix" | "practice" | "fallbackToPublic" | "adminBase">> & ArtFactoryConfig;
  env: Env;
  kv: Kv;
  art: ArtStore;
  store: FactoryStore;
  settings: ArtSettingsStore;
  /** Record any AI call here (chat, narration, voices) and it shows on the usage panel. */
  usage: UsageLedger;
  gate: AdminGate;
  kinds: Readonly<Record<string, MakeArtKind>>;
  isAdmin(request: Request): Promise<boolean>;
  /** For server-rendered pages, which have headers but no Request. */
  isAdminHeaders(headers: Headers): Promise<boolean>;
  whoIs(request: Request): Promise<string | null>;
  catalogue(): Promise<IndexedCatalogue>;
  /** The site's picture maker as it is switched now, metered with `purpose`. With `only`, that provider if its key is set, else `null`. */
  provider(purpose: string, tag?: string, only?: string): Promise<ImageProvider | null>;
  /** The maker for one kind other than the switcher's pictures (the config's `makers`, or Practice), metered; `null` when none. */
  maker(kind: ContentKind, purpose: string): Promise<Maker | null>;
  factoryDeps(): FactoryDeps;
  makeArtDeps(): MakeArtDeps;
}

const catalogueTtlMs = 30_000;

export function createArtFactory(input: ArtFactoryConfig): ArtFactory {
  const env = input.env ?? (process.env as Env);
  const config = { practice: true, fallbackToPublic: true, adminBase: "/admin", ...input, prefix: input.prefix.toLowerCase().replace(/[^a-z0-9-]/g, "-") };
  // Without Redis or R2 the memory stand-ins are kept on globalThis, so every route (and a dev server that loads this module twice) sees the same queue and pictures.
  const shared = ((globalThis as typeof globalThis & { __artFactoryMemory?: Record<string, { kv: Kv; art: ArtStore }> }).__artFactoryMemory ??= {});
  const memory = (shared[config.prefix] ??= { kv: new MemoryKv(), art: new MemoryArtStore() });
  const kv = input.kv ?? (redisCredentials(env) ? kvFromEnv(env) : memory.kv);
  const r2 = r2Config(env);
  const art = input.art ?? (r2 ? new R2ArtStore(new R2Client(r2)) : memory.art);
  const store = new FactoryStore(kv, config.prefix);
  const settings = new ArtSettingsStore(kv, config.prefix, env);
  const usage = new UsageLedger(kv, config.prefix, input.now);
  const gate = passwordGate({ env, prefix: config.prefix, kv });
  const kinds = input.makeArtKinds ?? defaultMakeArtKinds;
  const convert = input.convert ?? sharpConverter;

  let cached: { value: IndexedCatalogue; at: number } | null = null;
  async function catalogue() {
    if (!cached || Date.now() - cached.at > catalogueTtlMs) cached = { value: indexCatalogue(await input.catalogue.groups()), at: Date.now() };
    return cached.value;
  }

  async function provider(purpose: string, tag?: string, only?: string) {
    const current = await settings.read();
    const wanted = only ? readProviderName(only) : current.provider;
    if (only && !wanted) return null;
    const active = activeProvider(env, wanted, { practice: config.practice, ...(input.keyNames ? { keyNames: input.keyNames } : {}) });
    if (!active || (only && active.name !== only)) return null;
    const made = input.providerFor ? input.providerFor(active.name, current) : buildProvider(active, env, current);
    return meteredImageProvider(made, usage, purpose, tag);
  }

  async function maker(kind: ContentKind, purpose: string) {
    const own = input.makers?.find((one) => one.kinds.includes(kind));
    if (own) return meteredMaker(own, usage, purpose);
    if (kind === "image" || config.practice === false) return null;
    // Rehearsing on Practice: sounds with no real maker yet get free placeholders too.
    return (await settings.read()).provider === "practice" ? practiceMaker() : null;
  }

  const isAdmin = async (request: Request) => Boolean(await (input.isAdmin ?? gate.isAdmin)(request));

  const factory: ArtFactory = {
    config,
    env,
    kv,
    art,
    store,
    settings,
    usage,
    gate,
    kinds,
    isAdmin,
    isAdminHeaders: (headers) => isAdmin(new Request("http://localhost/", { headers })),
    whoIs: async (request) => (input.whoIs ? await input.whoIs(request) : null),
    catalogue,
    provider,
    maker,
    factoryDeps: () => ({
      store,
      art,
      catalogue,
      provider: (only) => provider("art-factory", undefined, only),
      makers: (kind) => maker(kind, kind === "image" ? "art-factory" : `factory-${kind}`),
      convert,
      ...(input.catalogue.onApprove ? { onApprove: input.catalogue.onApprove.bind(input.catalogue) } : {}),
      ...(input.now ? { now: input.now } : {}),
    }),
    makeArtDeps: () => ({
      kv,
      prefix: config.prefix,
      art,
      kinds,
      provider: (who) => provider("make-art", who),
      cap: async () => (await settings.read()).dailyCap,
      convert,
      ...(input.now ? { now: input.now } : {}),
    }),
  };
  return factory;
}
