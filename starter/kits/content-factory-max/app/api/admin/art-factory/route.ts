import { artHandlers } from "@/art-factory.config";

/** Content Factory MAX's one door: GET the list and every item's state, POST queue / work / approve / redo / reject / put-back / retry-hook / text / style / pace. Admins only (404 for anyone else). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Longer than the slowest picture maker's own limit (OpenAI: 180 s), so a paid picture is never cut off mid-answer.
export const maxDuration = 300;

export const GET = artHandlers.factoryGet;
export const POST = artHandlers.factoryPost;
