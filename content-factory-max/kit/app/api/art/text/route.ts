import { artHandlers } from "@/art-factory.config";

/** Alt text and captions for every file the catalogue makes, edits included. Public: words for screen readers are not secret. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = artHandlers.textGet;
