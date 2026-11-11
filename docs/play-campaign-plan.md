# Afterlife Campaign: design and implementation plan

Status: approved. The campaign foundation and progression loop merged in PR #55. Phase-two persistence and recovery verification is recorded in [the phase-two QA report](qa/campaign-phase-two.md). Phase-three [encounter and reward calibration](qa/campaign-balance.md) is complete. Presentation, interactive and visual QA, and release verification remain.

Prepared 11 November 2026. Source baseline: `origin/main` at `3d73cff`.

## 1. Product outcome

Play has two clear experiences:

- **Free Play:** choose any supported legal player deck and any supported legal opponent deck, including the existing curated, saved, imported and mirror options. Difficulty is selectable. No campaign unlock is required.
- **Campaign:** begin with one of the two official starters, win encounters, open earned packs, improve a private campaign deck, and defeat an optimized final opponent. Cosmetics persist between runs; campaign cards do not.

The core experience is: choose a starter, learn its plan, earn useful possibilities, make meaningful swaps, see those decisions matter in the next match, earn a new place to play.

Remain desktop-only. Reuse the current rules engine, fair AI, playmat, interactions, audio and match presentation. This is a progression and content expansion, not a new combat ruleset.

## 2. Evidence and boundaries from the repository

- `src/curated/starter-decks.json` contains the actual retail lists for **The Heist** (Blue/Yellow) and **Embracing Power** (Green/Red), each with three Legends and 40 main-deck cards. They must not be replaced with the curated **Heist Reloaded** list.
- Both official starters pass `matchDeckIssues` against the current catalog and engine-support manifest.
- Each starting crew can currently support 53 legal, engine-supported main-deck card identities: 17 already in its starter and 36 additional identities. Each has 119 additional copies available before reaching three of every compatible card. This supports an eight-pack campaign but does not prove power balance or the availability of every proposed reward category.
- Current starter crews provide 4 RAM in their main colour and 2 in their secondary colour. The currently supported recruitment candidates in these colours provide 2 RAM each. Same-colour replacements can preserve the starting RAM shape; still validate rather than assume this for future data.
- `matchStorage.ts` currently stores one match per Vault scope. Mode-specific slots are required to prevent Free Play from replacing a campaign match.
- `validateCircuitSetup` validates the rival and contract, but does not restrict the player's deck to a campaign inventory. A new worker-side campaign admission boundary is required.
- The existing upgrade planner includes purchase pricing and fixes Legends. Reuse its pure scoring helpers and shared legality checks, not its purchase workflow or unrestricted catalog UI.
- The AI audit in `docs/play-opponents-audit.md` found Sharp and Masterful tied in its sample. Difficulty labels alone do not establish a progression curve.
- Existing progress is local IndexedDB data, scoped to signed-in user, local Vault, or sample Vault. Signing in does not cloud-sync Play progress. Preserve and disclose this boundary.

## 3. Campaign rules

### Starting and replaying

One active campaign per Vault scope, alongside one independent Free Play match. Start by choosing The Heist or Embracing Power. The first encounter uses the exact official starter, with no imports or access to the physical Vault collection.

A campaign has nine sequential encounters in three acts. These are normal best-of-one matches. The encounter count is the intended first-release scope; change it only if measured match duration or balance makes the progression drag, and document that decision before expanding or cutting content.

All campaign inventory is available in the campaign workshop. Unused cards remain in reserve, never destroyed. The active deck follows existing rules: three different Legends by name, 40–50 main-deck cards, copy and RAM limits. Campaign reserve is not a seven-card sideboard. No sideboarding during a match.

The first campaign stays within the chosen starter's two colours and initial crew colour distribution. Earned Legends replace a crew member of the same colour. Preserve adequate RAM and validate the resulting deck. This gives real crew choices without making the initial release depend on assembling a completely new colour package by luck.

New runs reset cards, deck, encounters and reward rolls. They retain profile history, existing cosmetic entitlements and campaign environment unlocks. Starting another run while one is active requires explicit abandonment confirmation. It never silently overwrites an active run.

### Losing and retrying

No lives or permanent death. Loss, draw or concession retains campaign inventory and the cleared encounters. Return to the current briefing with **Retry** and **Review deck**. Concessions award no pack. Draws do not advance the campaign.

Retry uses the same authored opponent list and difficulty, with a new saved shuffle/bot seed. Reloading a live attempt restores its existing checkpoint instead of rerolling it. Restarting an unfinished campaign match is explicitly an abandoned attempt, with no reward.

Workshop edits are reversible. Preserve the original starter and a last-legal deck snapshot so a player can repair an invalid draft without losing cards. After repeated losses, foreground available legal swaps from the earned reserve and the opponent's briefing. Do not secretly weaken the opponent, change dice odds or give it hidden information.

Previously cleared encounters can be revisited through Free Play, using a copied deck snapshot, without additional campaign packs. The campaign itself advances forward rather than providing a farming loop.

### Rewards and completion

Encounters 1–8 each award one card pack on their first win in that run. Encounter 9 awards a **Champion's Cache** with an environment choice. This is an intentional refinement of “a pack after each win”: the final reward is useful immediately rather than adding cards after the journey has ended.

First completion lets the player choose one of three complete environments: **Afterlife Private Booth**, **Rainline Rooftop**, or **Arasaka Night Suite**. Each coordinates background, lighting and restrained ambience. They work in both modes, preserve card readability and never change rules. Subsequent completions allow another still-locked choice. If all three are owned, show the victory record without an empty reward chooser.

Allow a completed campaign deck to open as a new ordinary Deck Builder draft or Free Play snapshot. Do not mark campaign cards as physically owned or automatically save over any personal deck.

## 4. Encounter content and difficulty progression

The following is an authoring brief, not a claim that existing lists already have the right strength. Campaign opponent lists are versioned, immutable copies authored for these stages. Ordinary Free Play lists remain unchanged.

| Encounter | Working title | Opponent brief | Initial AI setting |
| --- | --- | --- | --- |
| 1 | First Call | The other official starter; shown when the player chooses their starter | Standard |
| 2 | Chrome Debt | Starter-strength gear midrange, adapted from Chrome Syndicate | Standard |
| 3 | Dead Drop | Modestly upgraded midrange starter; first act closer | Standard |
| 4 | Night Drive | Restrained Nomad Convoy; wider boards and meaningful trades | Standard |
| 5 | Dead Air | Tuned Lowball Netrun control; rewards economy and timing | Sharp |
| 6 | Red Line | Tuned Smasher Surge; a stronger finisher plan | Sharp |
| 7 | Mosh Pit | Cohesive aggressive list; tests the player's curve and stabilization | Sharp |
| 8 | Hostile Takeover | Strong Streetkid Braindance variant; tests flexible answers | Sharp |
| 9 | Last Call | Optimized Arasaka 9s, chosen and tuned against both campaign paths | Masterful |

Use the existing contract identity, locations and art where they fit. Introduce only enough copy to give each opponent a motive and a strategy: a short opening line, a concise matchup briefing and a result reaction. No branching story system is needed for the core loop.

All opponent lists and skill settings are declared in the campaign version. Except for the disclosed starter pairing in encounter 1, they do not counter-pick the player's latest edits or scale up to erase a good reward. Preview crew, strategic identity and pressure points. Optional full-list inspection is acceptable; never expose a shuffled hand, deck order or concealed Legend slot.

The player should feel stronger across an act. Do not increase enemy quality so aggressively that every improvement merely returns them to the same difficulty. The final opponent should be genuinely strong but beatable by several well-built campaign outcomes, not one mandatory combo.

## 5. Reward specification

### Eight cards, with a decision

Each progression pack grants **seven randomized main-deck cards and one selected card from three offers**. These are campaign rewards, not simulations of commercial booster collation or market value.

- Ordinary encounters: all three choice offers are main-deck cards from distinct useful roles where possible, such as pressure, resilience, or Gig/economy play.
- Act breaks after encounters 3 and 6: the choice offers are two eligible new Legends and one substantial main-deck upgrade. The player can keep the existing crew.
- Recruitment offers include the same-colour slot they can replace, a RAM comparison and a brief strategic explanation. A Legend is a sidegrade opportunity, not automatically superior because of rarity.

All eight earned cards go into campaign inventory. They are never auto-added to the active deck. A choice is confirmed once; the workshop still allows acquired cards to be moved in and out freely.

### Hard constraints

1. Every card is legal, engine-supported and in the campaign's versioned allowlist. Reward pools use card identities, not random printings of the same card.
2. Random main-deck cards fit the player's campaign crew at the encounter's first start. Recruitment and later swaps preserve the colour/RAM shape, so these cards remain usable with an eligible owned crew.
3. No award takes a non-Legend identity above three owned copies. Cap each exact Legend identity at one. Alternate Legends with the same character name may be owned, but cannot violate crew uniqueness when equipped.
4. The seven random cards use distinct identities within the pack. The three choice offers are distinct and separate from the random seven; every possible choice independently passes inventory limits.
5. Every pack contains at least two authored synergy/role candidates for an available campaign direction. This is a content guarantee, not a promise that every card strictly improves every possible deck.
6. Each ordinary choice has at least one demonstrable legal inclusion or one-for-one swap into the current deck. This establishes usability; it does not prove a win-rate gain.
7. Recruitment candidates must be unowned exact identities, have an eligible same-colour replacement, and preserve a legal 40–50-card build from owned cards. At least one main-deck fallback remains available.
8. Generation considers the whole campaign inventory, including reserve and already-awarded pending cards. Removing a card from the deck does not make it eligible for extra copies.
9. A pack and its offers never change when the player loses, refreshes, opens another tab, or replays the reveal.

If a narrow role bucket is exhausted, broaden to an explicit same-act compatible fallback pool using the same deterministic seed. Never relax legality, ownership caps or the usable-choice guarantee. The content validator must reject a definition unable to produce a full valid pack for reachable states. In production, a generation/content fault preserves the victory and shows a recoverable error; it never grants an empty pack or deletes progress.

### Pacing and variety

Author two broad directions for each starter initially: The Heist can lean toward efficient Gear/Units or Blue tempo/Gig play; Embracing Power can lean toward Arasaka synergy or resilient Red/Green pressure. They are soft reward themes, not a permanent class choice.

Weight early packs toward improvements with immediate use, middle packs toward synergies and recruitment, and late packs toward consistency and answers. Continue to include playable low-cost cards throughout. Rarity, real-world price and a single numeric card rating must not determine the difficulty curve.

Use the existing hand-curated ratings, roles and synergy helpers to shortlist options, then author/test the actual reward pools. Do not use a runtime LLM to generate rewards or opposing lists. A quality target is that packs regularly create one to three tempting edits and a final deck differs meaningfully from its starter; measure this rather than filling packs to meet an arbitrary rarity quota.

### Randomness and timing

Give each run a saved reward seed and a pinned content version. At the first start of each encounter, generate and persist that encounter's hidden reward manifest from the run inventory/deck snapshot and a seed derived from run + encounter + reward version. Keep reward randomness separate from shuffle, dice and bot streams.

Retries change the match-attempt seeds but not the reward manifest. Normal client state integrity is the goal; local storage is not cheat-proof and no competitive leaderboard is being claimed.

## 6. The player-facing loop

### Hub and briefing

The desktop Play hub has **Campaign** and **Free Play** as the primary choices. Locker and history are secondary. On first visit, explain the two modes in one sentence each. Returning players get a prominent resume action for the exact mode/state they last used, with the other mode still available.

Campaign begins with two large starter presentations using the actual crew art and a short playstyle description. During a run, the hub leads with the current opponent, active crew and next action. Act progress is visible without pushing the action below the first laptop screen. Keep REP and legacy marks out of the campaign's primary progress strip.

### Pack opening

After match playback completes and the victory is durably saved, present the sealed pack on a quiet Afterlife table. A click or optional drag tears the seal; neither dragging nor sound is required. Reveal cards individually or choose **Reveal all**. Use a stronger reveal for the choice slot, then show the three readable candidates.

Provide keyboard operation, reduced-motion presentation, mute support, clear focus and missing-art fallbacks. Preload assets before playing elaborate reveals; art failure must never block reward claims. Opening/animation progress is presentation state, not the authority for earning cards.

### Upgrade workshop

Use a focused campaign workshop built from existing card art, detail, quantity, curve and validation pieces. Do not expose the entire ordinary Deck Builder with its global collection/import actions.

- Left: newly earned cards and the campaign reserve, with owned/used counts, fit and roles.
- Right: active crew and deck, curve, composition and readable rule issues.
- Selecting a new card shows its full art and allows a direct swap or add. Compare before/after totals and RAM when relevant.
- All draft edits autosave; a temporary invalid deck is allowed to persist. **Next opponent** requires a legal, supported deck drawn entirely from this campaign inventory.
- **Undo last edit**, **Restore last legal deck**, and **Keep current deck** make experimentation safe. No forced cuts if the deck legally contains 41–50 cards.
- Acquired Legends have a dedicated crew comparison and confirmation; never silently replace a starter Legend.

The battle UI remains the current table. Its return action leads to the correct campaign hub, and a live match cannot be edited underneath its frozen deck snapshot.

## 7. Progression architecture

### Data responsibilities

| Record | Responsibility |
| --- | --- |
| CampaignDefinition | Immutable versioned starter snapshots, encounter lists, skills, reward buckets/roles, recruitment options and environment reward IDs |
| CampaignRun | Run ID, owner scope, content/rules versions, starter, seed, revision, phase, inventory, working deck, last-legal deck, cleared encounters, attempt counters and active match link |
| EncounterReward | Stable run/encounter reward ID, generated seven cards, three offers, eligibility context, selected option and committed grant status |
| StoredMatch | Existing engine checkpoint plus explicit mode and run/encounter/attempt references, frozen player/rival lists and deck revision |
| PlayProfile | Existing REP/history plus explicit permanent cosmetic entitlements and campaign completion records; contains no campaign card inventory |

Keep one current Free Play match keyed by owner scope + mode and one current campaign match keyed by owner scope + run. Keep summaries lightweight. Completed/abandoned runs retain recap/deck/reward history; do not accumulate every turn checkpoint for every finished match.

### State transitions

- Starter selection creates a `preparing` run with the exact starter and inventory.
- `preparing` -> `inMatch` only through worker validation of the stored run, owned quantities, legal committed deck, encounter unlock and expected revision.
- A loss/draw/concession returns to `preparing` with the terminal result retained for the result screen and all campaign inventory unchanged.
- An encounter 1–8 win atomically records the clear, grants the seven fixed cards once, and enters `rewardPending` with the saved three offers.
- Confirming one offer atomically grants that card once and enters `upgrading`. The run cannot skip a pending reward or start the next encounter from a different tab.
- Continuing with a valid workshop deck advances to the next encounter's `preparing` state. It does not discard the completed result/history.
- A final win atomically records campaign success and a pending cosmetic entitlement. The environment choice commits that entitlement and enters `completed`; if everything is already owned, complete directly.

Resume uses phase, not animation position: restore the live table, unopened/partly revealed reward, choice, workshop, or finale claim as appropriate.

### Trust and atomicity

The UI requests campaign actions by run ID and expected revision. The worker/storage layer derives the actual deck, opponent and reward from persisted campaign data. It does not trust a caller-provided deck, a label saying “campaign”, or a client-declared win.

Reuse the current transactional checkpoint pattern. Victory, match checkpoint, encounter clear, inventory grant, receipt and profile update commit together. Reward selection and environment claiming are also atomic and idempotent, using stable IDs rather than relying on the last 50 history entries.

Apply optimistic revision checks alongside serialized IndexedDB read/write transactions. Reject stale deck edits, stale match commands and concurrent reward choices; reload the saved state with a clear message. Only show success after commit. Failed writes leave the last saved state recoverable and block further dependent actions rather than pretending they succeeded.

Keep Free Play and Campaign mode transitions independent. Starting one cannot replace the other's slot. Direct handoffs from Deck Builder, Meta Intel and shared decks always target Free Play, preserving the campaign.

### Versions and account boundaries

Pin campaign content and generated offers for a run. Editing a curated deck or daily card/price sync must not silently change that run's opponent list, reward odds or acquired cards. Keep versioned campaign definitions shipped for active runs and record an engine/rules compatibility version. An incompatible engine/catalog change needs an explicit migration or recoverable compatibility screen, not a silent reset.

Continue existing local/user/sample isolation. Switching accounts closes old workers and remounts the relevant saved experience; data from the previous scope cannot settle into the next one. Show “Saved in this browser” and the lack of cross-device sync plainly in the hub. Cloud campaign sync and anonymous-to-account merging are separate work, not implied by sign-in.

## 8. Existing Circuit migration

- Keep current matches/checkpoints, earned REP, history, seals and unlocked finishes. Existing players do not restart their personal profile.
- Materialize previously earned finish entitlements before replacing old unlock rules.
- Migrate the current saved match into the Free Play slot. An unfinished old Circuit match retains its legacy settlement metadata and can finish with its original rewards exactly once. It does not advance a new starter campaign.
- Archive the six-contract board and marks in history rather than exposing a third primary play mode. Start the new Campaign with a fresh starter choice.
- Keep existing match REP/ranks as secondary profile decoration. Campaign card rewards and environment rewards depend on encounter/run completion, never accumulated REP.
- Keep the existing REP-based finish paths. Going forward, House Gold also unlocks from a new campaign clear; Black Chrome also unlocks from completing campaigns with both starters. Preserve anyone who already earned either under the original rules.
- Old six-contract and new nine-encounter rewards use separate ID namespaces. Neither can double-settle or impersonate the other.

## 9. Balance plan

### Goals, not claimed results

Players should usually win early, need adaptation in the middle, and reasonably expect some retries near the end. The optimized final opponent must be beatable with multiple sensible decks from each starter, including less-fortunate reward sequences.

Initial calibration targets for a fixed competent reference policy are roughly 65–80% wins early, 50–65% in the middle, 40–60% late, and 35–55% against the boss. These are tuning guides, not player-facing promises or estimates of human win rates. Individual matchup variation is expected; eliminate severe cliffs rather than forcing a perfectly monotonic percentage at all nine nodes.

### Evidence layers

1. **Content feasibility:** verify every starter, encounter, recruitment option and reward identity against the shared rules and engine manifest. Verify a reachable legal deck throughout every generated path. Reject content that can exhaust a required bucket without a valid fallback.
2. **Reward simulation:** at least 1,000 seeded trajectories per starter, exercising all ordinary choice roles and both accepting/declining recruitment. Measure pack validity, duplicates, choice diversity, eligible swap opportunities and inventory containment. Test deliberate saturation and worst-case choices separately; random sampling is not exhaustive proof.
3. **Deck trajectories:** build plausible pressure, balanced and resilient variants using only earned cards. Include the unchanged starter as a diagnostic baseline, low/median/high reward outcomes and a deliberately mediocre editing policy. A card-score total is only a sampling aid, not the strength label.
4. **Match calibration:** run actual engine games with fixed seeds and both seats. Use a constant reference policy to separate deck strength from AI skill, then test the intended campaign skill schedule. Begin with a small sweep (for example six shuffles per seat per representative cell), expand boss and outlier cells to at least 20 per seat, and expand further only where uncertainty affects a decision. Report sample sizes, uncertainty, losses, stalls and latency.
5. **Independent checks:** avoid having the same score function both create decks and declare them balanced. Use actual outcomes, multiple player policies, matchup diversity and interactive playtests. Recheck hidden-information invariance for any AI code changed during tuning.
6. **Interactive play:** complete a full run with each starter, inspect a poor-reward/repeated-loss sequence, and verify the feel of upgrade decisions. Browser-driven completion checks mechanics and UX; it does not establish that human players find the campaign fun. Record any outstanding human playtest need honestly.

If a poor reward path repeatedly becomes a wall, adjust the authored rewards, guaranteed choices or opponent list and repeat the affected tests. Do not solve initial balancing by adding a second currency, farming loop or unannounced opponent handicap.

Target meaningful deck change over a run rather than raw inventory size. Record how often a pack offers an attractive edit, how many starter copies remain before the boss, and whether both strategic directions can finish. Investigate dominant choices and effectively mandatory boss counters.

## 10. Implementation sequence and release gates

### PR 1: Mode separation and campaign foundation

- Separate navigation, mode-specific save slots, source handoffs and resume routing.
- Add versioned campaign records and worker-side ownership/encounter admission.
- Add migration and preserve existing matches, unlocks and record history.
- Add exact starter selection and the first playable campaign encounter behind a campaign-development flag while production retains the functioning old experience until replacement is complete.
- Gate: Free Play regression checks pass; both starters start legally; switching modes and reloading cannot overwrite either match; migration tests pass. Do not publicly expose an unfinished reward loop.

### PR 2: Packs, recruitment and upgrade loop

- Add deterministic manifests, atomic grants, choice/recruitment flow and restricted workshop.
- Connect all nine encounters using authored provisional content, plus completion/environment entitlement logic.
- Implement resume for every non-match phase and all stale-write/error states.
- Gate: deterministic full runs with both starters; no duplicate rewards, illegal starts or inventory leaks; refresh/close/reopen at every transition; reward feasibility simulations pass. Visual structure should already be coherent, even before final pack artwork.

### PR 3: Balance, presentation and release

Status (2026-11-11): encounter/reward tuning shipped in PR #57. The following presentation pass implements pack reveals, act arrivals, actual-deck recap, three generated room environments, and before/after workshop comparisons. See `docs/qa/campaign-presentation.md` for verification evidence and remaining human-playtest limits. This pass changes no encounter lists, reward constraints, AI or game rules.

- Tune actual opponent and reward content using the evidence above; commit reproducible results.
- Finish the pack opening, act transitions, starter art treatment, result recap and three unlockable environments. Keep effects skippable and preserve the table's established readability.
- Verify desktop at 1280×800, 1440×900 and a wide display, plus browser zoom, keyboard, reduced motion, muted audio, slow/missing art and interrupted storage. Mobile retains the existing desktop-only message.
- Run `npm run check` and affected engine/AI checks. Enable the new campaign only when its entire loop passes. Preserve production recovery paths until migration is verified.

The stages can share a development branch or ship behind a flag; no merge should leave public users in a half-functional campaign. The implementation agent owns routine details, but changes to campaign length, pack size, loss penalties or colour restrictions should be documented as product changes rather than silently substituted.

## 11. Completion criteria

- A new player can choose either exact official starter and finish all nine encounters with only starter/earned cards.
- Each first clear of encounters 1–8 pays exactly one fixed valid pack; retry, reload, simultaneous tabs and history truncation cannot duplicate or reroll it.
- Rewards offer usable choices; invalid workshop drafts cannot enter a match; declining recruitment remains a viable path.
- A loss cannot destroy progress or make the original legal starter unavailable. Multiple tested trajectories from both starters can defeat the final opponent.
- Campaign matches, Free Play matches and ordinary Deck Builder drafts cannot overwrite one another. Account/sample scopes remain isolated.
- Reload restores the precise live match or pending campaign phase. Save failures preserve prior durable data and present an honest recovery action.
- Old matches and earned cosmetic entitlements survive migration. Final environment choices persist and work in both modes.
- Pack reveals, workshop decisions and the next action are legible and comfortable on a laptop. Animations, sound and artwork failure never gate essential actions.
- The release report distinguishes automated mechanics evidence, simulation balance evidence and human feedback. It makes no claim of perfect balance or universal engine correctness.

## 12. Explicitly deferred

Cloud campaign sync, competitive leaderboards, paid packs, a crafting/shop economy, permadeath, cross-colour deck pivots, branching routes, additional starter choices, best-of-three campaign matches and a new AI engine. These are not required to deliver the proposed starter-to-champion experience.

## 13. Implementation handoff

Use GPT-6.1 Sol Extra High for the approved implementation. Read this plan, `CLAUDE.md`, `docs/design-system.md`, `docs/play-circuit.md` and `docs/play-opponents-audit.md` first. Preserve generated-data boundaries and the vendored engine build process. Begin with mode/save separation and migration; do not begin by decorating the current unrestricted Circuit. Treat the numerical balance targets and proposed encounter variants as hypotheses requiring the verification above.
