# Cyberpunk TCG engine

This generated browser module pins [TheCardGoat/tcg-engines](https://github.com/TheCardGoat/tcg-engines/tree/6de59de1c203827edc1bc6faa1bc6184cd126a5f) and bundles its Cyberpunk runtime, card catalog, and three rival strategies: greedy, tactical and ability-aware tactical. Upstream labels all three "public": they decide from the seat's own filtered view. The full-information oracle strategies are not exported. The accompanying MIT notices cover the upstream engine and bundled dependencies.

The hidden-information patch hides both seats' face-down Legends and assigns fresh instance IDs when their pre-game crews are shuffled. `entry.ts` supplies the strategy with a filtered view and legal prompt. The tactical strategies look ahead, so they also receive a boundary-safe engine handle to try their own moves on a fork; Vault wraps that handle (`fairHandle` in `src/lib/play/engineSession.ts`) so every view the search reads is masked exactly as the player's is. Vault owns the worker lifecycle, deck validation, and player-facing snapshots in `src/lib/play`. The retail-rules patch updates the pinned engine for confirmed October rules changes. The manual-payments patch exposes legal costs and sources to the player. See the [audit](../../docs/play-rules-audit.md) for the source versions, coverage, and release gates.

Regenerate from the Vault root with Node 22 or later.

```sh
npm ci
npm ci --prefix vendor/cyberpunk-engine
git clone --no-checkout https://github.com/TheCardGoat/tcg-engines.git ../tcg-engines
node scripts/build-play-engine.mjs ../tcg-engines
npm run check
```

The build reads the pinned revision from the local clone, applies the checked-in patches, and regenerates `engine.mjs`. Ordinary Vault builds use the generated module and require only the root dependencies. Review the engine's rule changes, the upstream type signatures used by `engine.d.mts`, and the current card coverage when updating the revision.

The Program-resolution patch adds the public resolving area, finalizes Programs before older effects, and covers simultaneous end-of-turn effects and paid mass-defeat replacement. It also distinguishes ordinary Legend play from Go Solo and updates the reference fixtures affected by the Program zone change.

The rules-boundaries patch validates Unit and Gig attack targets, resumes a suspended end of turn after a defeat replacement, and adds the Fight-step regression for Muamar's protection.

The fair-tactical-search patch stops speculative evaluation at new concealed-card revelations (including shuffled Legends), removes the upstream exception for looking at the controller's unknown deck top, and prevents follow-up/stall scoring from reading those simulated outcomes. Known board tactics still use lookahead. Targeted decision invariance and sampled-midgame tests cover the boundary; they are not a claim of optimal play.

The build also generates `card-slugs.json`, a lightweight legal-card manifest used to validate matchup lists without loading the engine on the UI thread. `src/lib/play/engineCards.ts` keeps Vault-to-engine aliases shared by validation and match setup.

The rival-defense-sequencing patch gives all three shipped levels a public-view Alt Cunningham discard policy, and gives Standard a material-based Jackie replacement policy. Alt matches each threatened Gig to a distinct equal-cost discard, prefers the least valuable eligible card, and increases the value of prevention near victory or in overtime. Jackie compares the best eligible Unit and its attached Gear with the replacement and payment cost. These are bounded heuristics, not optimal-play claims. Tactical combat filters retain equipment, abilities, development, and passing alongside eligible attacks rather than forcing immediate combat. Search limits are unchanged. A new public-condition cutoff stops speculative steals against a visible discard-prevention ability and a concealed nonempty hand: even the presence or absence of a simulated prevention prompt can otherwise reveal a matching card.


`choices.ts` handles legally revealed search cards, reveal destinations, card-type guesses, die selection, and avoiding repeated private Legend inspections. Standard uses simple material/affordability estimates; Sharp and Masterful also consider visible ability fit and Gig conditions. Card-type guesses use the registered own deck mix as a prior, not the hidden deck contents. Die choices average all legal faces; they never sample the match RNG.

`rival-informed-planning.patch` makes Masterful's public ability fit a bounded part of the primary score, with 96-node/depth-four searches, reserved reply work, and a fair share of that work per root candidate. Sharp retains its 48-node/depth-three policy. A remembered Legend identity may be used when calling that slot, but speculative reveals never enter persistent memory. The patch also stops combat lookahead before a concealed QUICK response could be inferred from the presence or absence of a reaction prompt. This is deliberately conservative about unknown responses.

Vault stores actual Legend-peek snapshots and authorized viewers in checkpoints, passes only the deciding seat's memories into search, and invalidates them when a crew is shuffled or a slot leaves the Legend area. Older checkpoints hydrate only their explicitly recorded known slots. These are planning improvements, not a tournament-strength certification.

`rival-commitment-search.patch` keeps an attack and a competing Gear purchase for the same host in the tactical search. It values the extra Gigs a purchase can actually steal and the Eddies available after a search, draw, or peek. When an attack can expose hidden information, both branches are scored from the public position before declaration. The coach and the two tactical rivals share this policy. [Decision fixtures and results](../../docs/play-opponents-audit.md#comparing-equipment-with-an-immediate-attack)

For Gig steals, `choices.ts` gives Standard the largest eligible faces first. Sharp scores the abilities its own Gigs can enable. `rival-calibration.patch` also lets Masterful score what the remaining dice enable on the rival’s public board. At a hidden combat response, Masterful weighs how many incoming steals a winning fight could prevent and whether a direct attack could reach seven. [Tier calibration and paired matches](../../docs/play-opponents-audit.md#calibrating-standard-sharp-and-masterful)
