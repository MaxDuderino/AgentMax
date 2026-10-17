import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AdminLogin, AdminShell } from "../lib/art-factory/ui/admin-shell";
import { artSrc, safeNext } from "../lib/art-factory/ui/api";
import { ArtFactory } from "../lib/art-factory/ui/art-factory";
import { MakeArtButton } from "../lib/art-factory/ui/make-art-button";
import { PictureMakerPicker } from "../lib/art-factory/ui/picture-maker-picker";
import { UsagePanel } from "../lib/art-factory/ui/usage-panel";

/**
 * A first render of every screen, on the server: proves each one mounts and
 * says something sensible before its data arrives. Clicking through the real
 * screens is the browser check in the kit's README.
 */
describe("the screens render", () => {
  it("each screen's first paint", () => {
    expect(renderToStaticMarkup(<ArtFactory />)).toContain("Reading the art catalogue");
    expect(renderToStaticMarkup(<UsagePanel />)).toContain("Loading usage");
    expect(renderToStaticMarkup(<PictureMakerPicker />)).toContain("Reading which picture maker is on");
    expect(renderToStaticMarkup(<MakeArtButton subject={{ kind: "item", name: "Cat" }} onMade={() => undefined} />)).toContain("✨ Make art");
  });

  it("the admin frame links both pages and marks the current one", () => {
    const html = renderToStaticMarkup(
      <AdminShell appName="Space Snacks" title="Art factory" intro="Hi" current="factory">
        <p>inside</p>
      </AdminShell>,
    );
    expect(html).toContain('href="/admin/art-factory"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Space Snacks · Admin");
    expect(html).toContain("<p>inside</p>");
  });

  it("the sign-in page explains each situation", () => {
    expect(renderToStaticMarkup(<AdminLogin appName="X" next="/admin/art-factory" mode="locked" />)).toContain("ADMIN_PASSWORD");
    expect(renderToStaticMarkup(<AdminLogin appName="X" next="/admin/art-factory" mode="password" />)).toContain('type="password"');
    expect(renderToStaticMarkup(<AdminLogin appName="X" next="/admin/art-factory" mode="open-laptop" />)).toContain("already the admin");
  });

  it("after sign-in, only ever goes to a page on this site", () => {
    const home = "/admin/art-factory";
    expect(safeNext("/admin/usage?x=1", home)).toBe("/admin/usage?x=1");
    const backslash = String.fromCharCode(92);
    const bads = ["//evil.example", `/${backslash}evil.example`, `/${backslash}${backslash}evil.example`, "https://evil.example", `/${String.fromCharCode(9)}evil`, `/${String.fromCharCode(10)}evil`, "", null, "javascript:alert(1)"];
    for (const bad of bads) expect(safeNext(bad as string, home)).toBe(home);
  });

  it("artSrc points at the address approved art is always served from", () => {
    expect(artSrc("/public/art/icons/heart.webp")).toBe("/api/art/made/art/icons/heart.webp");
  });
});
