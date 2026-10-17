import { artHandlers } from "@/art-factory.config";

/** The Make art buttons: GET who may and how many are left, POST draw one. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Longer than the slowest picture maker's own limit (OpenAI: 180 s), so a paid picture is never cut off mid-answer.
export const maxDuration = 300;

export const GET = artHandlers.makeGet;
export const POST = artHandlers.makePost;
