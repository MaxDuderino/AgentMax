import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { artFactory } from "@/art-factory.config";
import { AdminShell } from "@/lib/art-factory/ui/admin-shell";
import { ArtFactory } from "@/lib/art-factory/ui/art-factory";
import "@/lib/art-factory/ui/art-factory.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Content Factory MAX · Admin", robots: { index: false, follow: false } };

/** Content Factory MAX: every picture and sound in the catalogue, made in a queue, reviewed one at a time. Admins only. */
export default async function ArtFactoryPage() {
  if (!(await artFactory.isAdminHeaders(await headers()))) redirect(`${artFactory.config.adminBase}/login?next=${encodeURIComponent(`${artFactory.config.adminBase}/art-factory`)}`);
  return (
    <AdminShell
      appName={artFactory.config.appName}
      adminBase={artFactory.config.adminBase}
      current="factory"
      title="Content Factory MAX"
      intro={
        <>
          Every picture, voice line, sound effect and piece of music in the catalogue. Queue a job, a group or the next few and it starts making; then approve what comes back. An approved picture is cut to every size it is used at and written to the art store at the path the app already uses, so it shows up with no deploy. Replace one and the old one is kept for 30 days with a Put back button.
        </>
      }
    >
      <ArtFactory />
    </AdminShell>
  );
}
