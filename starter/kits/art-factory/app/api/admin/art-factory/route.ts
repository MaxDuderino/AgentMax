import { artHandlers } from "@/art-factory.config";

/** The art factory's one door: GET the list and every picture's state, POST queue / work / approve / redo / reject / style / pace. Admins only (404 for anyone else). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const GET = artHandlers.factoryGet;
export const POST = artHandlers.factoryPost;
