import { artHandlers } from "@/art-factory.config";

/** The picture maker switcher and Make art's daily limit. Admins only. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = artHandlers.settingsGet;
export const POST = artHandlers.settingsPost;
