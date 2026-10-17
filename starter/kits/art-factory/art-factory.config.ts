/**
 * This project's art factory. The art-factory skill fills this in; edit freely.
 *
 * - `appName` and `prefix`: shown on the pages / the start of every Redis key.
 * - `catalogue`: what to draw. Asset Forge writes `art/art-catalogue.json`;
 *   computed lists (every enemy in the game data with no picture yet) go in
 *   `extra`, and `onApprove` runs when a picture goes live.
 * - `makeArtKinds`: the ✨ Make art buttons' kinds and style blocks.
 * - `isAdmin` / `whoIs`: plug in the project's own accounts. Leave them out
 *   to use the ADMIN_PASSWORD gate, with Make art for the admin only.
 */
import catalogueFile from "./art/art-catalogue.json";
import { jsonCatalogue, type CatalogueFile } from "@/lib/art-factory/core/json-catalogue";
import { defaultMakeArtKinds } from "@/lib/art-factory/core/make-art-prompt";
import { createHandlers } from "@/lib/art-factory/server/handlers";
import { createArtFactory } from "@/lib/art-factory/server/setup";

export const artFactory = createArtFactory({
  appName: "My Project",
  prefix: "my-project",
  catalogue: jsonCatalogue(catalogueFile as CatalogueFile, {
    // extra: async () => [ ...groups computed from the game's data... ],
    // onApprove: async ({ image, files }) => { ...tell the game a new picture is live... },
  }),
  makeArtKinds: defaultMakeArtKinds,
  // isAdmin: async (request) => (await currentAccount(request))?.isAdmin === true,
  // whoIs: async (request) => (await currentAccount(request))?.id ?? null,
});

export const artHandlers = createHandlers(artFactory);
