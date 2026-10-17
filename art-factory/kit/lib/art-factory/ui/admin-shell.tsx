"use client";

import { useState, type ReactNode } from "react";

import { artApi, send } from "./api";

/**
 * The frame around the kit's admin pages: a header with the project's name,
 * links between the Art factory and AI usage, and Sign out.
 */
export function AdminShell({ appName, title, intro, current, adminBase = "/admin", children }: { appName: string; title: string; intro: ReactNode; current: "factory" | "usage"; adminBase?: string; children: ReactNode }) {
  return (
    <main className="af-root">
      <div className="af-wrap">
        <header className="af-card">
          <div className="af-spread">
            <p className="af-kicker">{appName} · Admin</p>
            <nav aria-label="Admin pages" className="af-nav">
              <a className="af-btn" aria-current={current === "factory" ? "page" : undefined} aria-pressed={current === "factory"} href={`${adminBase}/art-factory`}>
                🎨 Art factory
              </a>
              <a className="af-btn" aria-current={current === "usage" ? "page" : undefined} aria-pressed={current === "usage"} href={`${adminBase}/usage`}>
                💸 AI usage &amp; credits
              </a>
              <SignOut adminBase={adminBase} />
            </nav>
          </div>
          <h1>{title}</h1>
          <p className="af-muted" style={{ maxWidth: "48rem" }}>
            {intro}
          </p>
        </header>
        {children}
      </div>
    </main>
  );
}

function SignOut({ adminBase }: { adminBase: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="af-btn"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await send(artApi.login, { action: "logout" });
        window.location.href = `${adminBase}/login`;
      }}
    >
      Sign out
    </button>
  );
}

/** The password form for projects using the kit's own admin gate. */
export function AdminLogin({ appName, next, mode }: { appName: string; next: string; mode: "password" | "open-laptop" | "locked" | "custom" }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <main className="af-root">
      <div className="af-wrap" style={{ maxWidth: 440 }}>
        <section className="af-card">
          <p className="af-kicker">{appName} · Admin</p>
          <h1>Sign in</h1>
          {mode === "locked" ? (
            <p>
              No admin password is set for this site. Add <code>ADMIN_PASSWORD</code> to the project&rsquo;s environment variables (Vercel → Project → Settings → Environment Variables), redeploy, then come back.
            </p>
          ) : mode === "open-laptop" ? (
            <p>
              No password is set on this computer, so you are already the admin. <a href={next}>Carry on</a>.
            </p>
          ) : mode === "custom" ? (
            <p>This site uses its own accounts. Sign in the usual way, then open the admin pages again.</p>
          ) : (
            <form
              className="af-stack"
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                setProblem(null);
                const answer = await send(artApi.login, { password });
                setBusy(false);
                if (answer.ok) window.location.href = next;
                else setProblem(answer.message);
              }}
            >
              <label htmlFor="af-password">Admin password</label>
              <input id="af-password" type="password" autoComplete="current-password" className="af-input" value={password} onChange={(event) => setPassword(event.target.value)} required />
              <button type="submit" className="af-btn af-big" disabled={busy || !password}>
                {busy ? "Checking…" : "Sign in"}
              </button>
              {problem ? (
                <p role="alert" className="af-bad-text">
                  {problem}
                </p>
              ) : null}
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
