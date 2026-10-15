# QA REPORT · DnD-Max · 2026-10-15 · Lead: Henry

**Ran:** Smoke Tester + Hollow-Feature Audit (Bug Wrangler drafts below)
**Site:** https://dnd-maxvercel.vercel.app · **Account:** DemoUSer2 (Max's test account)
**Request:**
> "Yes, play a solo table (Recommended)"

**How:** the built-in browser on Max's computer. The pane was hidden, so I drove the page with real button clicks fired from the page's own code, not mouse coordinates. A person should repeat the hands-on parts with a mouse.

**Release call: SHIP WITH NOTES** (advisory: Max decides)

---

## Read-only sweep

Ten pages: home, games, create game, adventures, characters, discover, forge, account, leaderboards, and the table. Every page loaded with zero console errors, no one-option dropdowns, no "coming soon" text. The disabled buttons are waiting on input, which is normal.

## Live play-through: Gutterfang Warren, solo

| Flow | Result | Evidence |
|---|---|---|
| "Play it now" makes a table | ✅ | Unlisted table, code QXT-RZN, lobby with 4 seats and all host controls |
| Start the game | ✅ | Brother Matthias offers 5 pregens and 4 class picks |
| Pick a hero | ✅ | Fighter, 30/30 HP, AC 17, +5, 1d10+3 |
| DMax opening narration | ✅ | Arrival line in DMax's voice |
| Dice roll (1d20) | ✅ | Server rolled 3, shown in history |
| Poke DMax | ❓ | Request sent; no visible reaction found in page text. Might be a brief animation. Needs a human look. |
| Move a token | ✅ (by design) | Click to propose the route, click to accept. Max's own choice in Issue 295; Hotfix 335 kept it. |
| Start combat | ✅ | Initiative; goblin moved in on its own, crit-failed, DMax narrated it |
| Attack | ✅ | Longsword, natural 20, 12 damage, goblin down in 1 round |
| Fight wrap-up | ✅ | Three achievements, 10/100 XP, "fight is over" card, treasure in reach |
| Take loot | ✅ | Took "a potion of healing labelled 'POISUN'", Uncommon, with a Drink button and a DMax quip |
| **Can I do this?** | 🕳️ **Hollow on the default path** | See finding 1 |
| Phone width (375px) | ✅ / ❓ | No sideways page scroll. Some board plates sit past the right edge; needs a human look on a real phone. |

---

## Findings

### 1. 🕳️ "Can I do this?" answers nothing on the default table · Major
**Issue 252 is marked ✅.** On "Play it now" tables, the path every new player takes, the table runs "built-in rules" with no ruleset pinned. Asked "Can I attack twice in one turn?", it replied that there was nothing to quote and it was my call, then added a line saying "This is what the ruleset says," which contradicts it.
- **What should happen:** the default table answers from the built-in House Rules pack (DnD Max — House Rules is already in the ruleset list), or pins it automatically.
- **Copy bug:** don't show the "This is what the ruleset says" footer when there's nothing quoted.
- **Grade:** Hollow on the default path; works only if a host pins a ruleset by hand.

### 2. 🕳️ Every hero gets every resource · Minor
A level-1 Fighter got **Luck, Familiar, Mana and Grit**. A Fighter with a familiar and spell mana, and his class move (Whirlwind) costs mana. Resources look table-wide, not class-specific. Partly covered by Issue 426, "classes that differ", but this exact symptom isn't named there.
- **What should happen:** each class gets its own resources; a Fighter gets Grit, not a Familiar.

### 3. ❓ Poke DMax: no visible reaction · Needs a human look
The request went through, but I found no new text afterwards. If the reaction is an animation, fine. If not, it's a dead button.

### 4. ❓ Board plates off the right edge on a phone · Needs a human look
At 375px, a few board plates sit 50–260px past the screen edge. The page itself doesn't scroll sideways, so they may just be pannable. Check on a real phone.

### 5. ℹ️ The "Take a trophy" line shows up three times
After the roll, the same trophy line appeared in three places at once (log, toast and panel). Probably intended. Mentioned only because it reads as spam.

---

## What this run did not cover
Multiplayer (a second browser joining by code), projector view, watch links, campaign saves, the adventure builder, the Forge, the DMax Crawler, and any other ruleset. Those are next, along with the 251 🔍 issues no person has driven.

## Left on the live site
One unlisted test table (QXT-RZN) under DemoUSer2, with one trophy and one potion.
