# Status · 2026-10-17 · v1.2 (merged)
**Where we are:** **AgentMax v1.0 + Content Factory MAX phase 1.** 14 agents: 13 ✅ proven, plus **Content Factory MAX** (was the Art Factory; 🧪 tested in a fresh Next.js app, not yet in one of Max's projects). The template's code kit is now `starter/kits/content-factory-max/`. New builds start from the MaxTemplateWithAgents template.
**Next up:** Content Factory MAX phase 2 (working at 907-item scale: grid, review mode with keys, refusal helper, cost truth, versioned prompt fixes), then phase 3, the Sound Stage (real voice, effect and music makers).
**Waiting on Max:**
- DnD-Max's live factory has the same 3-minute lease bug the BVD found (a slow picture can be paid for twice at 2+ lanes): fix it in the DnD-Max repo.
- Delete the QA sample branch `docs/agentmax-qa-2026-10-15` in DnD-Max (GitHub → Branches → trash icon) and test table QXT-RZN on the live site.
- Check push protection on DnD-Max.

# Progress Log

Newest on top. Each entry quotes the request that caused it.

---

## 2026-10-17 · Shipped: PR #2 merged, lineup reinstalled, template updated

> "go for it"

- Merged AgentMax PR #2 (Art Factory + BVD review + Content Factory MAX phase 1) into main.
- Ran `install.ps1`: every skill reinstalled, the retired `art-factory` skill folder removed, `~/.claude/RULES.md` refreshed.
- Copied `starter/` into **MaxTemplateWithAgents** (its PR #1, merged): new projects now ship `kits/content-factory-max/`. It was already marked as a template on GitHub.

---

## 2026-10-17 · Content Factory MAX, phase 1: one engine for every kind, and the safety nets

> "you know i want the full studio.... lol" · picked **Content Factory MAX** · **Keep old versions + Put back** and **Stop at zero + per-run limit** · **Asset Forge drafts, you edit in review** (Max's questionnaire answers, 2026-10-16)

Built from phase 1 of the plan in `council/2026-10-16-art-factory-review.md`. Nothing in the DnD-Max repo was touched.

**What changed**
- **Renamed** the kit and skill: `starter/kits/content-factory-max/` and the `content-factory-max` skill ("art factory" still finds it). Updated build.py, LINEUP, README, COMMANDS, VISION, HANDOFF, AGENTS snippet, the starter README and both installers, which now remove the retired `art-factory` skill folder. The code inside keeps its `art-factory` paths on purpose, so a project that has the kit updates in place.
- **Every catalogue item has a `kind`** (image, voice, sfx, music). Sounds have no sizes and land at `<dir>/<file>.mp3` (or wav/ogg), with `seconds`, `loop` and `voice`. Older computed lists with no kind are pictures.
- **One `Maker` door** (`lib/art-factory/server/maker.ts`): makers say which kinds they make. OpenAI, Google and Practice pictures come through it unchanged. Projects can plug in their own sound makers via `makers` in the config. **Practice now makes free placeholder sounds** (real WAV beeps), so the whole sound flow can be rehearsed. A kind with nothing to make it waits in the queue and the page says why.
- **Usage ledger: units and an open provider list.** Calls can record characters, seconds or pictures; prices can be per unit (set on the usage page too). Any provider id works (`suno`, `my-tts`). Old token rows read exactly as before.
- **Safety nets, on by default:** re-approving keeps the live version in `art-factory/previous/…` with **↶ Put back** (which keeps the newer one, so you can swap back), tidied after 30 days; **stop at zero on** for every new wallet; a **per-run spending limit** ($5, beside the pace; empty = none).
- **Approve is resumable:** every file written first, then all recorded; Approve again after an interruption carries on and never keeps the new picture as "previous". A failed on-approve hook is marked on the item with **↻ Tell the app again**.
- **Alt text and captions** in the catalogue (a voice line's caption defaults to its line), editable on every review card, served at `/api/art/text`, and handed back by `artSrc(path, { withText: true })`. **Asset Forge's `build_catalogue.py` drafts them** (prompt's first sentence minus drawing instructions; name in brackets for effects; the line for voices) and passes `kind` and sound fields through.
- The review tray plays sounds with a named player that never autoplays. The example catalogue gained a small "Sounds" group.

**Checked**
- Kit tests: 95 pass (23 new, one per item above, including an interrupted approve, Put back, the 30-day tidy, the run limit, units and stop-at-zero). `npx tsc --noEmit` clean. `python tools/build.py --check` clean.
- Asset Forge: built a catalogue from a test prompts.json with pictures, an effect and a voice; the kit's own check accepted it.
- **Fresh Next.js 16.3.2 app:** installer added every file (including the new `/api/art/text` route and `maker.ts`), `tsc` and `next build` clean. On a real `next start` server (signed in with a throwaway test password, memory only): Practice made a picture, a sound effect and a voice line; approved them; the sound was served as a real WAV; re-approving kept the previous picture and Put back swapped it in. In the browser: the tray shows a full-width labelled player that never autoplays, captions and alt text save from the keyboard. Found and fixed one bug there: the players were squished to a third of the card.
- Test data: everything lived in that throwaway app's memory; nothing touched a live site.

**Not done / not checked**
- No real voice, effect or music maker yet (phase 3). No real provider call was made; all tests use fakes.
- One test stub was wrong at first: two versions kept in the same millisecond shared a folder. That was a real (if rare) clash, so each kept version now gets its own folder.
- A run with several lanes can pass its limit by about one picture per lane.
- `starter/` not yet copied into MaxTemplateWithAgents (another repo).

---

## 2026-10-16 · BVD Full Council on the Art Factory → Content Factory MAX; seat 01 is now DuderMax

> "can we have the BVD do a review of the art-factory universal and see what they think and what should be changed or added. the keys for them are UNIVERSAL and CUSTOMIZABLE … perhaps we need to consider the other AI generated content, like audio … let them cook and ill expect a questionaire with feedback sourced direction options and ideas."

**What happened**
- **Full Council, all 11 seats** as separate subagents (read-only; none ran code). Verdict: **APPROVE WITH CHANGES, 11 of 11**. Record, seat-by-seat, and the build plan: `council/2026-10-16-art-factory-review.md`.
- I looked at the live DnD-Max admin in Max's browser for them, **read only, nothing pressed**: 907 pictures / 216 approved, ~$0.095 per picture with redos vs 3.5¢ list, two violence refusals, and a working Voices studio.
- **Max answered the questionnaire:** full studio (pictures, voices, sound effects, music), named **Content Factory MAX**, Next.js only for now, real runs + a DnD-Max shakedown before "Proven", review mode + grid, refusal help both ways, old versions kept + stop at zero + per-run limit, no rule on voice cloning, Asset Forge drafts alt text, prompt fixes saved versioned to the project's own list, themes with presets and a picker, a banner + contact sheet when a group is done. All in RULES.md, tagged Max.
- **Bug fixed from Henry's review:** the "picture is lost" lease (3 min) was no longer than OpenAI's own timeout, so at 2+ lanes a slow picture could be drawn and paid for twice. Lease is now 7 min, longer than the 300 s route limit; new test. **DnD-Max's live factory still has the 3-minute lease.**
- **Seat 01 renamed DuderMax.** Max: "an AI logging things as my name? i dont want this so his name should be MaxDuderino if thats not already in use. please update in all agent configs." MaxDuderino is his GitHub name and commit author, so I asked; he picked **DuderMax**. Changed in the persona sources, the BVD skill, LINEUP, the canon notes (the .docx keeps history), new rule 26a, and both installers (they now remove the retired `bvd-max-bullis` agent). Rebuilt, reinstalled into `~/.claude` (old agent file and old persona copy removed), and refreshed `~/.claude/RULES.md`.
- Jerry caught two stale lines here (status said "not pushed"; "70 tests"): fixed.

**Not done**
- Content Factory MAX itself is not built yet: this was the review and the questionnaire. The plan is phased in the council file.
- Older council records (2026-10-15) and the .docx still say "Max Bullis" as history.

---

## 2026-10-16 · The Art Factory: DnD-Max's art admin panel, for every project

> "i need to make sure that i have that admin function and control panel available for any of my projects since i generate all AI art"

Max's choices: where the code lives, **"In the template"**; the kit includes the factory plus **"AI usage & cost tracker", "Make art buttons", "Model/quality switcher"** (not the storage mover); and **"Forge feeds the factory"**. All work done in AgentMax; nothing in the DnD-Max repo was changed (read as the reference only).

**What changed**
- **New code kit: `starter/kits/art-factory/`.** DnD-Max's Art Factory, made reusable. The DnD-only parts (the art-todo list, packs, creatures, made-creature sync) became a **catalogue**: what to draw, where each file lands, every size it is cut to, style groups, and an on-approve hook. It keeps the live-run lessons: R2 storage (never Vercel Blob), uploads that send their length, stop rather than pay for pictures that can't be kept, busy ≠ failed, leases, see-through backgrounds, queueing starts making.
  - Screens: Art factory (queue, review tray with Approve / Approve all / Redo / Edit words / Reject, styles, pace, credit box), picture maker switcher (OpenAI / Google with model, quality and prices), AI usage & credits, ✨ Make art button, admin sign-in.
  - **New, beyond DnD-Max:** **Practice** mode (free placeholder pictures, to rehearse the whole flow with no key), a one-password admin gate for projects without accounts, Empty the queue, a progress bar, Redo also starts making, and one self-contained stylesheet with dark mode.
  - `install.mjs` installs or updates the kit in any Next.js project (names-only `.env.example`, deps, `@/*` path; never overwrites the project's own config or catalogue).
  - 70 tests of its own at the time (`npm test`; 72 after the review fixes), and it typechecks against Next 16.
- **New skill: `art-factory`.** Installs the kit into a new or existing project, makes it that project's factory (catalogue from Asset Forge, style blocks, Make art buttons that really save), walks Max through keys (names only, Key Keeper rules), Redis and R2, and checks it works before calling it done.
- **Asset Forge feeds the factory.** New `build_catalogue.py` turns `prompts.json` into the factory's `art-catalogue.json` (stable ids, size presets, a style block per family). The ChatGPT paste queue stays as the fallback for projects with no factory.
- **Pipeline:** `tools/build.py` copies each kit into its skill (`art-factory/kit/`), removes files a kit dropped, and leaves `node_modules` out of the zips.
- **Rule Ledger:** Asset Forge's scope note now says "Forge feeds the factory" with Max's answer as the source (it extends his earlier "manual ChatGPT use, one prompt at a time, no APIs"). New entries for the art admin panel in every project, the kit living in the template, and R2 storage (that last one is **AI, unconfirmed**: it comes from the DnD-Max live run, not from Max).
- LINEUP, README, COMMANDS, VISION, INSTALL (14 skills), the template README and the AGENTS snippet updated.

**Tested**
- The kit's 70 tests pass; `tsc` passes, including the Next.js pages and routes.
- **A fresh Next.js 16 app**, made from scratch in a scratch folder: `install.mjs` installed the kit, `next build` passed with all 11 pages and routes, and in the browser (production mode, a throwaway local password): wrong password refused, signed in, switched to Practice, queued a job (it started making on its own), Approve, Reject, Redo with edited words, Approve all with its confirm; the approved picture was served as WebP at 256×256 and 64×64; the usage page saved a balance; a Make art button on the home page made and placed a portrait. Keyboard pass: every control reachable with a visible focus ring, and the whole loop driven with Enter.
- Fixed from that run: two number boxes with no label, Redo not restarting the queue, the usage page hiding Google, focus after Approve all, the sign-in form layout. Also changed listed pictures to stable ids, so reordering the art list never scrambles the factory's records.
- Asset Forge's catalogue output passes the kit's own checker.

**Fixed after the PR review (Copilot, 2026-10-16)**
- Sign-in could send the admin to another site with a crafted `next=/\evil` link; now only paths on the same site are followed.
- Make art's daily cap could be beaten by many clicks at once; a slot is now reserved in one atomic step before drawing and handed back on any failure (tested: 10 clicks at a cap of 3 draw exactly 3).
- `build_catalogue.py` had a broken quote from my own last edit (it would not run at all) and its style-block reader swallowed the rest of STYLE.md; both fixed and re-run.
- The factory and Make art routes now allow 300 s, longer than OpenAI's own 180 s limit, so a paid picture is not cut off.
- The installer adds only the missing variable names to `.env.example`, never duplicates.
- `build.py` leaves files removed from a kit out of the skill zip in the same build.

**Not done / not tested**
- **No real picture maker, Redis or R2 was used.** OpenAI and Google were tested with recorded answers, R2 with a stand-in bucket, Redis with a stand-in client. The first real run in a project is the real test.
- Not yet installed in one of Max's own projects, so the skill itself hasn't run end to end there.
- Not deployed to Vercel.
- MaxTemplateWithAgents not refreshed yet (copy `starter/` into it).
- Not carried over from DnD-Max: Anthropic's own cost report (needs an Anthropic admin key), the Vercel Blob fallback, and the storage mover (Max left it out).
- The BVD did not review this; Max made the design calls directly. Offer a Quick Council before the first real install if he wants one.
- The dollar estimates are only as good as the price table (dated 2026-10-16, OpenAI rows from third-party pages).

---

## 2026-10-15 · Key Keeper hook works on Windows

> "Fix the Key Keeper pre-commit hook template in Max's AgentMax repo so it works on Windows." (from the DnD Max session setting up Max's new Windows 11 machine)

**What changed**
- **The hook now runs `python3` instead of just looking for it.** On Windows, `python3` is a Microsoft Store shortcut that exists but only prints "Python was not found" and fails. The old hook found the shortcut, used it, and blocked every commit. Now, if `python3` doesn't actually run, the hook uses `python`.
- `dist/key-keeper.zip` rebuilt with the fix.

**Tested**
- On Max's Windows 11 machine (Store shortcut still present, exit 49): installed the hook in a throwaway repo; it printed "Key Keeper: no secrets found.", exited 0, and a real commit went through.

**Not done / found along the way**
- Repos that already have the old hook keep it until `key_scan.py --install-hook` runs again there (DnD Max was patched by hand).
- `python tools/build.py --check` fails on this machine even on untouched `main`: Python 3.14 for Windows compresses zips with zlib-ng, so every zip comes out with different bytes but the same contents. I only committed the key-keeper zip, whose contents really changed. A Windows checkout with `core.autocrlf=true` also makes every generated text file look changed; a `.gitattributes` forcing LF would fix that.

---

## 2026-10-15 · v1.0: template, install guide, update script, cheat sheet

> "https://github.com/MaxDuderino/MaxTemplateWithAgents ill mark that as a template once complete" · "INSTALL.md for Grizz, Update script, Slash-command cheat sheet" · "Keep 'edit sources, not generated files', all passed the shakedown so i think honest is good go mark done."

**What changed**
- **MaxTemplateWithAgents filled:** README with the first five minutes, CLAUDE.md and AGENTS.md (lineup snippets), VISION.md, PROGRESS.md, `docs/testing/`, a secrets-proof `.gitignore`, `.env.example`. The source lives in AgentMax's `starter/`, generated from the same snippets, so the template can't drift.
- **INSTALL.md:** step by step for Claude chat, Claude Code (Windows, Mac/Linux), ChatGPT, Gemini and VS, plus updating and removing. Claude chat steps checked against Claude's help center.
- **update.ps1 / update.sh:** pull the latest and reinstall in one go. Tested: it pulled two new versions, listed what changed and reinstalled; a ZIP-download copy gets a clear message instead of an error.
- **COMMANDS.md:** every slash command and phrase on one page, also inside the GPT/Gemini kit.
- **Rules:** "edit sources, not generated files" and "honest status board" are now Max ✓.
- **Shakedown:** all 8 of Max's checks marked passed. The board records Asset Forge and Deploy Doctor as proven on Max's sign-off.
- **Tagged v1.0.**

**Not done / not tested**
- I didn't watch Max's 8 shakedown checks run; they're recorded as his sign-off.
- Claude chat still needs one upload per skill: as far as Claude's help center says, a zip holds one skill.

---

## 2026-10-15 · v1.0 shakedown: six more agents proven on AgentMax itself

> "go ahead and merge or delete it i dont need that QA sample. BVD approved. Unless you have a way to approve the agents' usage on a test basis before closing it out as V1.0."

**What happened**
- **BVD personas v4.5 approved** (RULES.md #27 is now Max ✓).
- **Real runs on AgentMax:**
  - Checkpoint: restore point made, then cleaned up.
  - Key Keeper: hook installed; it scanned this commit.
  - Session Kickoff: read the log, git state and hook.
  - Vision Keeper: wrote VISION.md and traced every CLAUDE.md rule. Two are untraced: "edit sources, not generated files" and "honest status board".
  - Handoff Packer: wrote HANDOFF.md.
  - Focus Group: Quick Playtest of the install (`docs/testing/2026-10-15-focus-group-install.md`). Verdict: too many steps, no update path.
- **Fixes the runs found:**
  - Vision Keeper's keyword-only rule hunt missed "don't"-style rules; it now reads every bullet.
  - Checkpoint now handles sessions that can't delete GitHub branches.
- **v1.0 Shakedown checklist** artifact for the tests only Max can run. Results save there.

**Not done**
- **The QA sample branch in DnD-Max is still there.** This session isn't allowed to delete GitHub branches (two attempts, plus the API, all refused). Max deletes it: DnD-Max on GitHub → Branches → trash icon next to `docs/agentmax-qa-2026-10-15`.
- **Test table QXT-RZN** is left for Max to delete on the live site.
- **Asset Forge and Deploy Doctor** need a real project to prove on; both are on Max's checklist.

---

## 2026-10-15 · AgentMax goes private (light mode)

> "gonna make it no longer private as well" … "i mean no longer public"

- RULES.md scope note now says the repo is private. Push protection and Secret Protection are confirmed on (Max's screenshot).
---

## 2026-10-15 · Built every fix from the BVD review

> "Foundation (Recommended), Cross-tool kit, Less ceremony, Cleanup" · access: "Give it real weight" · reports: "In the DnD-Max repo" · names: "they are 2 diferent people and MattKoch should probably be referred to as MattiMax."

**What changed**
- **Foundation:**
  - RULES.md now ships inside every skill.
  - `tools/build.py` makes identical bytes every run, and has `--check` and `--help`.
  - The status board is honest: Proven / Tested / Built, not run.
  - Key Keeper closes every hole George and Henry found: renames, SCREAMING_CASE names, non-English file names, JWTs, Google/HF/Stripe keys, `.envrc`. The hook keeps existing hooks and survives the skill folder moving. GitHub push protection is now part of setup.
  - Checkpoint rolls back in one step and one commit. Rehearsed with a merge commit: the old revert failed, the new one restored the files exactly.
- **Cross-tool kit:**
  - `snippets/AGENTS.md` in plain words.
  - `dist/for-gpt-gemini/`: AGENTMAX-ALL.md (the whole lineup in one file) plus INSTRUCTIONS.txt for the instructions box.
- **Less ceremony:**
  - New **Wrap** skill: one readout at the end of every change.
  - Session Kickoff is the front door and calls the rest of the crew.
  - The CLAUDE.md snippet is trimmed to start, build, wrap, with light mode first.
  - README is the stage.
- **Cleanup:**
  - DnD-Max QA report moved to the DnD-Max repo (branch `docs/agentmax-qa-2026-10-15`; not on main, which auto-deploys) and removed here.
  - CLAUDE.md and AGENTS.md fence this repo to agent-building.
  - Testers and QA roles can't edit files or use GitHub.
  - Test-data cleanup is a rule.
  - Asset queue: buttons named per asset for screen readers, "Next up" keeps the filter, reduced-motion, a "done ✓" moment.
- **Access, real weight:** keyboard pass on every smoke test, an Access line in QA reports, a ninth tester (Lee, The Screen Reader User), and RULES.md #8a.
- **Names:** Matt Koch is now Mattimax everywhere, Word doc included.

**Not done / not tested**
- Nothing has run in ChatGPT, Gemini, Visual Studio or real Windows yet.
- Git history still contains the old real name from earlier commits. Only a history rewrite removes it, and that's Max's call.
- No combined all-skills zip for Claude chat. I'm not sure Claude chat accepts more than one skill per zip, so it's one zip per skill.

## 2026-10-15 · BVD Full Council reviews the lineup: 11 of 11 approve with changes

> "ok we are off track, this is an agent build project. so in that spirit, lets have the BVD review the agent files and overall process you just created and suggest improvements or their approval."

**Mistake, owned:** after "make it so" I drifted from building agents into running QA on DnD-Max. This is an agent-build project. The DnD-Max report and the two entries below are that drift. Moving them is one of the open decisions.

**What happened**
- First real BVD run: a Full Council with all eleven seats as separate agents, each reading the repo cold. Several seats actually ran the build, the installer and the secret scanner on copies.
- Vote: 11 of 11 approve with changes. Full readout: `council/2026-10-15-lineup-review.md`.
- Top fixes: bundle RULES.md with every agent, an honest status board, a real GPT/Gemini path, move the DnD-Max work out, one "wrap" instead of eight agents per change, close the Key Keeper holes.
- Flags: George (Key Keeper holes), Mattimax/Richie/Randy (RULES.md not bundled), GoddiMax (real people's details in a public repo, if they're real).

**Fixed along the way**
- Jerry accidentally rebuilt three zips during review. Reverted; the repo is clean.

**Not done**
- Nothing from the review is built yet. Waiting on Max's answers first (design questions before building).

---

## 2026-10-15 · QA Team live play-through of DnD-Max

> "Yes, play a solo table (Recommended)"

**What happened**
- Played Gutterfang Warren solo on the live site as DemoUSer2: start, pick a hero, roll, move, a full fight, loot, and a rules question. Full report: `reports/dnd-max/2026-10-15-qa-live-playthrough.md`.
- **Release call: SHIP WITH NOTES.** The core loop plays well, and DMax is funny.

**Findings**
- 🕳️ **"Can I do this?" (Issue 252, marked ✅) answers nothing on the default "Play it now" table.** No ruleset is pinned, so it says "your call," then contradicts itself with "This is what the ruleset says."
- 🕳️ **Every hero gets every resource:** a Fighter with a Familiar and spell Mana.
- ❓ Poke DMax showed no visible reaction. Needs a human look.
- ❓ Some board plates sit off-screen at phone width. Needs a real phone.
- ✅ The two-click move is by design (Max's own call, Issue 295). Not a bug.

**Max's decisions**
- The ten unmerged wave-1 branches stay with the DnD-Max project.

**Not done / not tested**
- Multiplayer, projector, watch links, saves, builder, Forge, Crawler, other rulesets.
- The browser pane was hidden, so clicks were fired from the page's own code, not a mouse. A person should repeat the hands-on parts.
- Bug reports are drafted in the report, not filed. The AgentMax session only has read access to DnD-Max.
- Left one unlisted test table (QXT-RZN) on the live site.

---

## 2026-10-15 · First QA Team run: Hollow-Feature Audit on DnD-Max (read-only pass)

> "make it so" (agreeing to: point the Hollow-Feature Audit at DnD-Max)

**What happened**
- Pulled every issue status from DnD-Max: 153 ✅ done, 251 🔍 built but never tried by a person, 19 ⬜, 1 🚧.
- Clicked through the live site in the built-in browser, signed in as DemoUSer2: home, games, create game (viewed, not submitted), adventures, characters, discover, forge, account, leaderboards. Every page loaded, no console errors, no one-option dropdowns, no "coming soon" text. The disabled buttons are waiting on input, which is normal.
- Found that DnD-Max's own depth audit (2026-10-15 morning, docs/testing/depth-audit-2026-10-15.md) already did the code-side hollow hunt and filed issues 410–440. The audit agrees with it and didn't duplicate it.

**Findings for Max**
- The surface is solid. The hollowness is underneath, as the depth audit says: thin content on deep engines.
- 251 features have never been driven by a person. That's the real QA gap, and it needs live play-throughs.
- Ten wave-1 crews (issues 410–421) were cut off by the session limit. Their work sits unmerged on `wip/agent-…` branches. Nothing from them is live.

**Not done / not tested**
- No table was created or played. That writes to the live site, so it waits on Max's OK.
- Multi-player, dice, combat and DMax flows were not tried this run.

---

## 2026-10-15 · Road crew and bonus tracks built: 9 more agents

> "make it so"

**What changed**
- **Scribe:** log entry, light-mode entry, status overview and commit-note formats. PROGRESS.md is the source of truth, with a Claude Doc mirror.
- **Vision Keeper:** writes VISION.md with Max (template included), checks plans for drift, dropped and shrunk features and hollow risk, and hunts untraced "must/never" rules.
- **Asset Forge:** style bible template, prompts.json format, and `build_queue.py`, which builds a clickable asset-prompts.html. One-click copy, a "Next up" button, done/redo/skip marks, and a "Copy status update" to paste back. Built for manual ChatGPT use. Example included.
- **Deploy Doctor:** Vercel logs → observed vs suspected → proposed fix. Never rolls back or redeploys on its own.
- **Checkpoint:** pushed restore-point branches, a one-phrase rollback, and cleanup once the risk passes.
- **Translator:** plain-English change reports for an IT brain, no code dumps.
- **Session Kickoff:** reads the log, issues, roadmap, vision, deploy and git state, then offers clickable next moves.
- **Key Keeper:** `key_scan.py` secret scanner plus an automatic pre-commit hook. Tested: it blocked a fake Anthropic key, a fake Google key and a .env file, and let clean commits through.
- **Handoff Packer:** on-demand HANDOFF.md brief.
- Installers now pick up every skill folder automatically (12 skills, 22 subagents). `tools/build.py` also builds skill zips into `dist/` for Claude chat.

**Fixed along the way**
- The first Key Keeper hook ran the scan twice when it found a secret. Fixed and retested.

**Not done / not tested**
- None of the new skills have run on a real project yet, except Key Keeper's scanner.
- The asset queue page was syntax-checked but not opened in a browser.

---

## 2026-10-15 · Focus Group and QA Team built, pushed to AgentMax

> "they need to be a bit more generic so lets expand it, to test any app or game so "vet" in whatever the applicable app or game is a better specialty. something like: noob, first time %whatever%, PRO %whatever%, Vet %Whatever, Person on the street, Dad Gamer, teenager gamer, and pro live streamer."

**What changed**
- **Focus Group:** 8 generic testers (Pat the Noob, Duke the First-Time {HOST}, Nadia the PRO, Grizz the Vet, Sam the Person on the Street, Dale the Dad Gamer, Kai the Teen Gamer, Jax the Pro Live Streamer). `{THING}` and `{HOST}` get filled in per project, so the same crew tests DnD-Max, CanastaMax or MasterDebater. Quick and Full Playtest modes. Runs only when Max asks.
- **QA Team:** Henry leads a Smoke Tester, a Bug Wrangler and a Hollow-Feature Audit. Evidence-or-it-didn't-happen rules, live-site clicking, a deploy check through Vercel first, and grades of Full / Partial / Hollow / Missing for "done" items.
- 11 new Claude Code subagents (8 `fg-*`, 3 `qa-*`). Henry's persona now also ships inside the QA Team skill.
- Installers now set up all three skills and all 22 subagents.
- Repo moved from the working name "agent-lineup" to MaxDuderino/AgentMax.

**Not done / not tested**
- No playtest or QA run has happened yet. First real run is the test.
- Tester names are placeholders (RULES.md).

---

## 2026-10-15 · BVD v4.5-draft built, lineup repo scaffolded

> "ok filled out and here are some BVD docs from their long running history lol."

**What changed**
- Built the BVD from the recovered v4.4a canon (11 members, accepted 2025-10-19) plus Max's Soundcheck answers.
- `bvd/personas/`: eleven portable persona files. Each has canon, how they talk, how they steer, how they disagree, what they flag, and a new "In Max's projects" section.
- `bvd/SKILL.md`: the conductor. Quick Council by default, Full Council on request. Council is advisory and skewed toward Max's asks. Ends every review with a BVD readout and clickable decisions.
- `claude-code/agents/`: eleven `bvd-*` subagents for real Full Councils in Claude Code.
- `RULES.md`: rule ledger, every rule tagged with its source. Max's literal Soundcheck answers quoted.
- `LINEUP.md`: master sheet and status board.
- `tools/build.py`: regenerates personas and wrappers from the source JSON so they stay in sync.
- Install scripts for Windows and Mac/Linux.

**Decisions from the Soundcheck**
- Top three to build: BVD, a 5-person demo weekend crew, the QA team.
- Build now: Scribe, Vision Keeper, Focus Group, Asset Forge, Deploy Doctor (propose fixes, don't act).
- Wanted bonus agents: Checkpoint (with cleanup), Translator, Bug Wrangler, Key Keeper, Smoke Tester, Session Kickoff, Rule Ledger. Handoff Packer is a maybe, on demand only.
- Table Check cut from this lineup; it stays a DnD-Max-only agent.

**Not done / not tested**
- The Full Council subagents haven't been run in Claude Code yet. First real council will be the test.
- Persona v4.5 changes are drafts until Max approves them. Persona speaking styles and sample lines were AI-written in v4.4a and are still unconfirmed (RULES.md #27).

---

## 2026-10-15 · Agent Lineup Soundcheck

> "can you review and build a clickable questionaire style form to guide this process along?"

- Built the Soundcheck questionnaire artifact. Max rated the handoff brief, my read on how he works, and every proposed agent. Answers saved in the artifact.
