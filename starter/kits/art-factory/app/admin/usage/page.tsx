import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { artFactory } from "@/art-factory.config";
import { AdminShell } from "@/lib/art-factory/ui/admin-shell";
import { UsagePanel } from "@/lib/art-factory/ui/usage-panel";
import "@/lib/art-factory/ui/art-factory.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI usage · Admin", robots: { index: false, follow: false } };

/** AI usage & credits: what is left on each provider, what was used and whether it worked. Admins only. */
export default async function UsagePage() {
  if (!(await artFactory.isAdminHeaders(await headers()))) redirect(`${artFactory.config.adminBase}/login?next=${encodeURIComponent(`${artFactory.config.adminBase}/usage`)}`);
  return (
    <AdminShell
      appName={artFactory.config.appName}
      adminBase={artFactory.config.adminBase}
      current="usage"
      title="AI usage & credits"
      intro={<>What is left on each AI provider, what was used, by what, and whether it worked. No provider says how much prepaid credit is left, so type in what its console shows and this counts down from there.</>}
    >
      <UsagePanel />
    </AdminShell>
  );
}
