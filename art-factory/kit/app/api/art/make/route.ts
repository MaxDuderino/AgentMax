import { artHandlers } from "@/art-factory.config";

/** The Make art buttons: GET who may and how many are left, POST draw one. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const GET = artHandlers.makeGet;
export const POST = artHandlers.makePost;
