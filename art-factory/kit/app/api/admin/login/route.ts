import { artHandlers } from "@/art-factory.config";

/** Admin sign in and sign out (the kit's password gate). GET says whether this browser is the admin. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = artHandlers.sessionGet;
export const POST = artHandlers.loginPost;
