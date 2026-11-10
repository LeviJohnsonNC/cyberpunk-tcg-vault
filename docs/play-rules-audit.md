# Play Mode rules audit

**Status: ready for desktop design, UX, and art.** The gate covers the current legal Vault card pool, the browser worker, and the desktop decision flow.

## Scope and source versions

The target is a desktop, local best-of-one constructed game with the current Vault card pool. Tournament administration, sealed formats, physical procedures and later sets are outside this product scope.

- WeirdCo's comprehensive rules reader returned 733 entries, 691 numbered, with 73 marked as changed on October 29. [Official rules](https://cyberpunktcg.com/comprehensive-rules) · [Reader data](https://api.netdeck.gg/api/cyberpunk/comprehensive-rules)
- The October 28 tournament rules returned 87 entries, with 41 marked as changed. Appendix B governs card legality for the constructed scope. [Tournament rules](https://cyberpunktcg.com/tournament-rules) · [Reader data](https://api.netdeck.gg/api/cyberpunk/tournament-rules)
- The official FAQ returned 311 rulings on November 9, including 286 card entries and 25 game entries. The pinned engine predates 51 published rulings. [Rules FAQ](https://cyberpunktcg.com/rules-faq) · [Reader data](https://api.netdeck.gg/api/faqs/cyberpunk)
- The rules patch and the two gameplay errata were checked against the engine. The other errata update artist credits. [Retail patch notes](https://cyberpunktcg.com/blog/rules-patch-notes1) · [Card errata](https://cyberpunktcg.com/errata)

## Findings by rules area

| Area | Finding and disposition |
| --- | --- |
| Setup, deck checks, names | The existing checks cover unique Legend names, RAM, card and copy limits, opening hands and mulligan order. A seeded shuffle provides the digital equivalent of the randomized deck and face-down crew presentation in 7.6.2 and 7.7.2. Rule 3.9.3 also gives a two-name card both component names. The current legal pool has no such card. Extend and test name matching before adding one. |
| Hidden information | Real Kiroshi Optics attack coverage confirms the selectable Legend slots are masked and the private reveal goes only to the authorized seat. Three Mouths, One Desire is covered from both seats at the decision boundary. The worker test also plays the card on both sides and checks what reaches the player. |
| Turn order and game end | Fixed a start-of-turn choice being replaced by Gain a Gig. Ready, draw and gain now wait until start effects finish. Gig victory is checked first. Deck-out occurs on a failed draw. Resolution stops once the result is decided, per 1.13, 1.14 and 8.6. |
| Sell and costs | Bootleg Black Sapphire Show keeps Sell for Turn available. Rule 5.8.2.3 and the explicit card FAQ govern this outcome despite the older conflicting sentence in 11.12.2.2. Discounts have a floor of one Eddie under 11.11.3. Free plays bypass discounts. The table supports choosing Eddie and eligible Legend sources for plays, QUICK plays, calls, activations, Go Solo, and defeat replacement. A separately paid effect play can request its own payment. A Legend spent for a separate activation cost is excluded from Eddie payment for that activation. |
| Crew deployment | CR 4.5 and the V: Corporate Exile FAQ allow ordinary play of a costed, face-up Legend. That action preserves spent state and adds lag. Go Solo applies its own cost modifiers and deploys the Legend ready and without lag, per 11.29.1. Vault fixtures cover both paths. |
| Attack eligibility | CR 9.3.1–9.3.2 limits attacks to eligible Units and rival Gig areas that contain at least one Gig. The engine applies the same restrictions to offered targets and submitted moves. A must-attack effect allows the turn to end when no target qualifies. |
| Fight and defeat | The fight comparison fixes the outcome. Defeats are applied before post-fight abilities resolve. Temporary fight effects are removed before those abilities run. Defeat replacements still occur in the fight, and the actual Maelstrom Zealots fixture verifies the order of both defeats. Broad checks cover zero power, ties, Gear, and automatic win/loss effects. Retain targeted coverage for last-known information and stacked replacement effects. |
| Gig adjustments and steals | The engine validates die faces, limits D20 selection and applies steal count and prevention. It transfers selected Gigs before firing steal effects. The batch can count per Gig or once, as authored on the card. Historical Gig values and source power now preserve Rogue's first qualifying steal when a die changes value or another copy enters. |
| Effect timing and targets | Conditions are evaluated at resolution under 10.16.1.1. Programs are public while resolving, then move straight to trash or their card-specific destination before older pending effects resume. Lizzy Wizzy and Alt Cunningham bottom-deck the played Program directly. Cyberpsychosis joins simultaneous end-of-turn effects so the controller can choose when it resolves. A paid defeat replacement resumes the turn transition after resolving. |
| Deck movement and Gear | Current top-of-deck effects use a one-card remainder. Existing bottom-deck handling groups attached Gear and uses the owner's deck. The generic multi-card top-deck rules in 11.16 need dedicated engine coverage before an authored card relies on them. |
| Catalog and errata | All 151 legal Vault cards resolve to distinct engine definitions. Johnny Silverhand: Never Stop Fighting has no Sell Tag. Kiroshi Optics targets a friendly Unit or face-up Legend. Alt Cunningham's Vault and authored engine text match the current publisher card feed. The upstream canonical-authorship comparison uses a different pinned source snapshot. |

## Verification and release gate

- Vault regression tests cover the deployed worker adapter and the rebuilt engine. Payment fixtures check calling with a different source, Go Solo, a QUICK reaction, a defeat replacement, Alt Cunningham's separate activation and Program payments, and Rippler ordering and privacy. A browser game exercises payments through the actual desktop controls.
- Two focused source tests passed. One exercises an effect defeat during the Fight step. The other checks that Jackie Welles saves the Unit from delayed Cyberpsychosis and the turn advances.
- The full archived engine run passed 2,321 tests and failed 135. Of those failures, 130 use fixtures or expectations that depend on attacks into empty Gig areas, which current CR 9.3.2.2 forbids. The other five cover older fight, effect-driven Sell, hidden-information and setup expectations, and the pinned Alt Cunningham authorship snapshot. One optional expert automation suite could not load its dependencies. The current Vault checks cover the shipped behavior in those rules areas.
- The Vault check passed 243 tests. Thirty-two seeded matches finished across both starters, all four rivals, and both seats. A full Chromium match verified the desktop controls, rematch, and draft return. A deterministic 1280 × 800 Chromium fixture played Floor It, confirmed that it was public while waiting for its target, and checked its move to Trash when the target resolved.

### Post-pin FAQ coverage

The row numbers below refer to the 51 entries published after October 9 in the November 9 reader response, in response order. The current publisher FAQ and comprehensive rules responses match the versions listed above. Verification combines current Vault regressions with focused reference cases.

| FAQ rows | Ruling | Evidence |
| --- | --- | --- |
| 1, 3, 7, 8, 22, 51 | Gear tags stay on the Gear | Vault equips each Gear to a Unit and a Legend and checks both sets of tags. The engine's tag selectors read the target's authored classifications. |
| 2, 4, 14, 25, 34, 47 | Six Programs are playable without a legal effect target | Direct Vault regression for each Program. |
| 5, 21, 40 | Bootleg preserves Sell for Turn. Fight losses still defeat Maelstrom Zealots and the Safety Override beneficiary | Direct Vault regressions for Bootleg and Maelstrom Zealots. Safety Override's real-card reference suite passed. |
| 6, 27 | Cyberpsychosis applies only to fights and steals after it resolves. Kusanagi may leave before the pending defeat | Vault fixtures exercise both orders of the fight and Cyberpsychosis, and select the Kusanagi return from the real end-of-turn prompt. |
| 9, 10 | Floor It can target zero power. Gorilla Arms triggers once per qualifying batch | Direct Vault regressions for a zero-power target and a two-Gig steal with a third Gig taken by Gorilla Arms. |
| 11–13, 29, 32, 33 | Goro's bonus snapshots on resolution. Nadia reads the current Gig count. Panam uses the stated mixed target sets | Vault checks Goro with face-up, face-down, and zero Legends and after an orientation change, Nadia after the Gig-count crossover, five equipped friendlies with or without a Legend, and Panam's face-up Legend count across both areas. |
| 15, 17, 18, 24, 26, 41, 50 | Played-turn attack permission, Adrenaline, and ready-target restrictions | Vault checks Johnny and Gunpoint for both Unit types, Voodoo Boy with Adrenaline before and after MaxTac leaves, Misty under a must-attack effect, and spent-only targets for Oda and Steel Dragon. |
| 16, 28, 35, 39 | Jackie can replace a mass defeat. Muamar protects against fight defeat. Gear follows a defeated Legend | Vault checks Jackie in a mass defeat, both Muamar defeat paths, and Gear remaining in trash when Rogue or Royce is removed. The focused reference test applies an effect defeat while the Fight step is open. |
| 19, 20 | Lizzy's Program finishes before old pending effects and moves directly to the bottom of the deck | Vault exercises Lizzy from hand and trash. Both seats see the resolving Program. The movement event goes directly to the bottom of the deck before the older Rippler search starts. |
| 23, 30, 46, 48, 49 | MaxTac's spent check, Fixer die exclusion, mandatory private search selection, printed cost, and the first Arasaka attack | Vault fixtures cover the Fixer exclusion, mandatory private search, and Viktor's printed cost. MaxTac and Yorinobu have passing card suites. |
| 31, 42–45 | Overwatch, Faceplate and Rippler timing across costs, attacks and attachment changes | Vault checks Overwatch before Faceplate, Faceplate after Panam moves it, Rippler ordered alongside an Attack effect before React, and Rippler after an activation or paid Program. Private search information stays with the authorized player. |
| 36–38 | Rogue uses the first qualifying steal across the turn and across copies | The Vault regression covers prior steals, later copies, and changed die values. The reference cascade asserts two Eddie readies and two Gig steals after Gorilla Arms. |

The design gate uses the current Vault suite, targeted rule fixtures, seeded matches, and desktop controls. The full archived reference suite remains a diagnostic against an October engine pin.
