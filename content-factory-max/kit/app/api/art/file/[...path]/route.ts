import { artHandlers } from "@/art-factory.config";

/** Every stored picture, through the site: approved art (`art/…`), the review tray, Make art pictures. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = artHandlers.file;
