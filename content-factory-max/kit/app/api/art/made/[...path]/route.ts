import { artHandlers } from "@/art-factory.config";

/** Approved art at an address that never changes: `/api/art/made/<path>`. Use `artSrc(path)` in the app. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = artHandlers.made;
