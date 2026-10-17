import { describe, expect, it } from "vitest";

import example from "../art/art-catalogue.json";
import { missingPortraits } from "../examples/computed-catalogue";
import { checkCatalogue, groupsFromFile, jsonCatalogue, type CatalogueFile } from "../lib/art-factory/core/json-catalogue";
import { aspectForSize, factoryPrompt, singlePrompt, slugOf, splitBatch, styleFor, wantsSeeThrough } from "../lib/art-factory/core/prompts";
import { allImages, indexCatalogue } from "../lib/art-factory/core/types";
import { makeArtAllowance, makeArtPrompt, readMakeArtPrompt } from "../lib/art-factory/core/make-art-prompt";

describe("the words side", () => {
  it("cuts a numbered batch into items, keeping the intro and the rules after it", () => {
    const { head, items, tail } = splitBatch("Three snacks.\n\n1. A jelly.\n   It wobbles.\n2. A crisp.\n\nKeep them cute.");
    expect(head).toBe("Three snacks.");
    expect(items).toEqual(["1. A jelly.\n   It wobbles.", "2. A crisp."]);
    expect(tail).toBe("Keep them cute.");
    const one = singlePrompt(head, items[1]!, tail, 2, 2);
    expect(one).toContain("Draw ONE picture only — number 2 of 2");
    expect(one).toContain("A crisp.");
    expect(one).toContain("Keep them cute.");
    expect(one).not.toContain("A jelly");
  });

  it("makes file-safe slugs from the opening words", () => {
    expect(slugOf("A goblin sneak: crouched low")).toBe("goblin-sneak");
    expect(slugOf("The Café of Ünder-Things, at night")).toBe("cafe-of-under-things");
    expect(slugOf("!!!")).toBe("picture");
  });

  it("asks for the nearest shape", () => {
    expect(aspectForSize(1920, 1080)).toBe("16:9");
    expect(aspectForSize(512, 512)).toBe("1:1");
    expect(aspectForSize(1080, 1920)).toBe("9:16");
  });

  it("decides see-through: 'no transparency' wins, then the words, then a contain cut", () => {
    expect(wantsSeeThrough("on a transparent background")).toBe(true);
    expect(wantsSeeThrough("a table top, no transparency")).toBe(false);
    expect(wantsSeeThrough("an opaque card", [{ fit: "contain" }])).toBe(false);
    expect(wantsSeeThrough("a sword", [{ fit: "contain" }])).toBe(true);
    expect(wantsSeeThrough("a sunset", [{ fit: "cover" }])).toBe(false);
  });

  it("puts the group's style (or the admin's edit) in front of the words", () => {
    expect(styleFor({ id: "icons", style: "Chunky." })).toBe("Chunky.");
    expect(styleFor({ id: "icons", style: "Chunky." }, { icons: "Thin." })).toBe("Thin.");
    expect(factoryPrompt("Chunky.", { prompt: "A heart." })).toBe("Chunky.\n\nA heart.");
    expect(factoryPrompt("Chunky.", { prompt: "A heart." }, "A broken heart.")).toBe("Chunky.\n\nA broken heart.");
    expect(factoryPrompt("", { prompt: "x".repeat(7000) }).length).toBe(6000);
  });
});

describe("the catalogue file (what Asset Forge writes)", () => {
  const file = example as unknown as CatalogueFile;

  it("the example that ships with the kit has no problems", () => {
    expect(checkCatalogue(file)).toEqual([]);
  });

  it("turns images into pictures with every size, at <root>/<dir>/<file><suffix>.webp", () => {
    const groups = groupsFromFile(file);
    const heart = indexCatalogue(groups).byId.get("icons/ui/heart")!;
    expect(heart.target).toBe("art/icons/heart.webp");
    expect(heart.outputs.map((one) => one.path)).toEqual(["art/icons/heart.webp", "art/icons/heart-small.webp"]);
    expect(heart.outputs[1]).toMatchObject({ width: 64, height: 64, fit: "contain" });
    expect(heart.seeThrough).toBe(true);
    expect(heart.aspect).toBe("1:1");
  });

  it("listed pictures keep their ids when the list is reordered or one is removed", () => {
    const job = (images: { name: string; prompt: string; id?: string }[]) => groupsFromFile({ groups: [{ id: "g", title: "G", jobs: [{ id: "j", title: "J", images }] }] })[0]!.jobs[0]!.images.map((one) => one.id);
    expect(job([{ name: "Heart", prompt: "h" }, { name: "Star", prompt: "s" }])).toEqual(["g/j/heart", "g/j/star"]);
    expect(job([{ name: "Star", prompt: "s" }])).toEqual(["g/j/star"]);
    expect(job([{ name: "Star", prompt: "s", id: "token-star-01" }])).toEqual(["g/j/token-star-01"]);
  });

  it("cuts a batch job into one picture per numbered item", () => {
    const groups = groupsFromFile(file);
    const wave = groups.find((one) => one.id === "enemies")!.jobs[0]!;
    expect(wave.images).toHaveLength(3);
    expect(wave.images[1]!.target).toBe("art/enemies/02-crisp-drone-card.webp");
    expect(wave.images[1]!.id).toBe("enemies/wave-one/02");
    expect(wave.images[1]!.prompt).toContain("number 2 of 3");
    expect(wave.images[1]!.prompt).toContain("They should look like one set");
  });

  it("caps sizes at 2048 and picks the aspect from the first size", () => {
    const groups = groupsFromFile({ groups: [{ id: "maps", title: "Maps", jobs: [{ id: "big", title: "Big", sizes: [{ width: 4096, height: 2048 }], images: [{ name: "World", prompt: "The world map." }] }] }] });
    const map = allImages(groups)[0]!;
    expect(map.outputs[0]).toMatchObject({ width: 2048, height: 1024, fit: "cover", path: "maps/big/world.webp" });
    expect(map.aspect).toBe("16:9");
    expect(map.seeThrough).toBe(false);
  });

  it("names every problem in plain English", () => {
    const problems = checkCatalogue({
      sizes: {},
      groups: [
        { id: "Bad Id", title: "x", jobs: [] },
        { id: "ok", title: "Ok", jobs: [{ id: "j", title: "J", sizes: "nope", images: [{ name: "Ann", prompt: "" }, { name: "Ann", prompt: "again" }] }, { id: "j", title: "Again", aspect: "5:4" as never, batch: "1. x" }] },
      ],
    });
    expect(problems.join("\n")).toMatch(/group id must be lower-case/);
    expect(problems.join("\n")).toMatch(/size preset "nope"/);
    expect(problems.join("\n")).toMatch(/"Ann" has no prompt/);
    expect(problems.join("\n")).toMatch(/both be saved as "ann"/);
    expect(problems.join("\n")).toMatch(/two jobs are called "j"/);
    expect(problems.join("\n")).toMatch(/aspect "5:4"/);
    expect(() => jsonCatalogue({ groups: [{ id: "x", title: "x", jobs: [{ id: "y", title: "y" }] }] })).toThrow(/no images and no batch prompt/);
  });

  it("adds computed groups in front and keeps the approve hook", async () => {
    const catalogue = jsonCatalogue(file, { extra: () => [missingPortraits([{ name: "Moon Mite" }, { name: "Moon mite" }, { name: "Drawn One" }], (name) => name === "Drawn One")], onApprove: () => undefined });
    const groups = await catalogue.groups();
    expect(groups[0]!.id).toBe("creatures");
    expect(groups[0]!.jobs.map((job) => job.id)).toEqual(["made-moon-mite"]);
    expect(groups[0]!.jobs[0]!.images[0]!.data).toEqual({ creatureId: "made-moon-mite", name: "Moon Mite" });
    expect(catalogue.onApprove).toBeTypeOf("function");
  });
});

describe("Make art's words and allowance", () => {
  it("pre-fills from the subject with the kind's style block", () => {
    const words = makeArtPrompt({ kind: "character", name: "Captain Crumb", text: "A biscuit astronaut.", tone: "brave", genre: "space" });
    expect(words).toContain("Character: Captain Crumb.");
    expect(words).toContain("A biscuit astronaut.");
    expect(words).toContain("Setting: space. Mood: brave.");
    expect(words).toContain("painted portrait");
  });
  it("refuses empty words and bounds long ones", () => {
    expect(readMakeArtPrompt("  ")).toBeNull();
    expect(readMakeArtPrompt("x".repeat(5000))!.length).toBe(4000);
  });
  it("caps everyone but the admin", () => {
    expect(makeArtAllowance({ usedToday: 5, cap: 5 })).toEqual({ allowed: false, remaining: 0 });
    expect(makeArtAllowance({ usedToday: 5, cap: 5, unlimited: true })).toEqual({ allowed: true, remaining: null });
    expect(makeArtAllowance({ usedToday: 99, cap: null })).toEqual({ allowed: true, remaining: null });
  });
});
