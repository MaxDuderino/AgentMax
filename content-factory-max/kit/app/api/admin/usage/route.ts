import { artHandlers } from "@/art-factory.config";

/** AI usage & credits: counts, costs, wallets, prices. Admins only. Keys never leave the server. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = artHandlers.usageGet;
export const POST = artHandlers.usagePost;
