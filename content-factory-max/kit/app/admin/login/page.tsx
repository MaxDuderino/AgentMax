import { artFactory } from "@/art-factory.config";
import { AdminLogin } from "@/lib/art-factory/ui/admin-shell";
import { safeNext } from "@/lib/art-factory/ui/api";
import "@/lib/art-factory/ui/art-factory.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · Admin", robots: { index: false, follow: false } };

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  // Only ever back to a page on this site.
  const next = safeNext((await searchParams).next, `${artFactory.config.adminBase}/art-factory`);
  return <AdminLogin appName={artFactory.config.appName} next={next} mode={artFactory.config.isAdmin ? "custom" : artFactory.gate.mode()} />;
}
