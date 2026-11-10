# Play Mode rules audit

**Status: design gate held.** Manual payments are in place. The remaining gate is card-effect resolution, targeted hidden-information checks, and disposition of the rule cases below.

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
| Hidden information | Real Kiroshi Optics attack coverage confirms the selectable Legend slots are masked, the rival receives no choice, and the private reveal goes only to the authorized seat. The existing projection and worker tests cover opening shuffles, hands and deck order. Extend this coverage to the other private searches and hand or deck choices before sign-off. |
| Turn order and game end | Fixed a start-of-turn choice being replaced by Gain a Gig. Ready, draw and gain now wait until start effects finish. Gig victory is checked first. Deck-out occurs on a failed draw. Resolution stops once the result is decided, per 1.13, 1.14 and 8.6. |
| Sell and costs | Bootleg Black Sapphire Show keeps Sell for Turn available. Rule 5.8.2.3 and the explicit card FAQ govern this outcome despite the older conflicting sentence in 11.12.2.2. Discounts have a floor of one Eddie under 11.11.3. Free plays bypass discounts. The table supports choosing Eddie and eligible Legend sources for plays, QUICK plays, calls, activations, Go Solo, and defeat replacement. A separately paid effect play can request its own payment. A Legend spent for a separate activation cost is excluded from Eddie payment for that activation. |
| Crew deployment | Ordinary card plays take cards from hand. Crew deployment goes through Go Solo, which applies its own cost modifiers and puts the Legend on the field ready and without lag, per 11.29.1. |
| Fight and defeat | The fight comparison fixes the outcome. Defeats are applied before post-fight abilities resolve. Temporary fight effects are removed before those abilities run. Defeat replacements still occur in the fight, and the actual Maelstrom Zealots fixture verifies the order of both defeats. Broad checks cover zero power, ties, Gear, and automatic win/loss effects. Retain targeted coverage for last-known information and stacked replacement effects. |
| Gig adjustments and steals | The engine validates die faces, limits D20 selection and applies steal count and prevention. It transfers selected Gigs before firing steal effects. The batch can count per Gig or once, as authored on the card. Historical Gig values and source power now preserve Rogue's first qualifying steal when a die changes value or another copy enters. |
| Effect timing and targets | Conditions are evaluated at resolution under 10.16.1.1. An ability whose condition may change can enter the ordering prompt. When Lizzy Wizzy plays a Program, its own resolution now takes priority over already-pending effects. A fixture verifies Floor It draws before a pending Tetratronic Rippler searches. The transient Program zone and the exact timing of bottom-deck cleanup remain open. |
| Deck movement and Gear | Current top-of-deck effects use a one-card remainder. Existing bottom-deck handling groups attached Gear and uses the owner's deck. The generic multi-card top-deck rules in 11.16 need dedicated engine coverage before an authored card relies on them. |
| Catalog and errata | All 151 cards marked legal in Vault resolve to distinct engine definitions. Johnny Silverhand: Never Stop Fighting has no Sell Tag. Kiroshi Optics targets a friendly Unit or face-up Legend. The upstream card-authorship test flags a pre-existing Alt Cunningham wording difference. Compare the live definition and test the precise FAQ behavior before signing off card-by-card coverage. |

## Verification and release gate

- Vault regression tests cover the deployed worker adapter and the rebuilt engine. Payment fixtures check calling with a different source, Go Solo, a QUICK reaction, a defeat replacement, Alt Cunningham's separate activation and Program payments, and Rippler ordering and privacy. A browser game exercises payments through the actual desktop controls.
- The upstream reference suite was run before and after the patch. The revised run passed 2,444 tests. The failure list includes older Sell and fight assertions and tests that assume a conditional or already-consumed trigger always produces a specific prompt. It also includes the pre-existing Alt Cunningham authorship mismatch and a Shattered Memories animation assertion. The Reboot Optics source-name fallback was corrected and checked separately.
- Thirty-two seeded matches finished across both starters, all four candidate rivals and both seats. A Chromium run completed through the visible desktop controls after the engine rebuild and checked rematch and draft preservation.

### Post-pin FAQ coverage

The row numbers below refer to the 51 entries published after October 9 in the November 9 reader response, in response order. The matching card suites ran 342 tests, with 337 passes and five failures. Bootleg's two failures and Maelstrom Zealots' failure expect the superseded behavior. Rogue's cascade test expects a prompt that the revised first-time trigger logic can skip. The Modded Kusanagi fixture still needs an explicit comparison against the FAQ. Passing a card suite provides supporting evidence. Each open interaction still needs a targeted check.

| FAQ rows | Ruling | Evidence and follow-up |
| --- | --- | --- |
| 1, 3, 7, 8, 22, 51 | Gear tags do not transfer to the host | Matching Gear suites run. Verify tag-filtered targets with equipped Units and Legends. |
| 2, 4, 14, 25, 34, 47 | Six Programs are playable without a legal effect target | Direct Vault regression for each Program. |
| 5, 21, 40 | Bootleg preserves Sell for Turn. Fight losses still defeat Maelstrom Zealots and the Safety Override beneficiary | Direct Vault regressions for Bootleg and Maelstrom Zealots. Safety Override's real-card reference suite passed. |
| 6, 27 | Cyberpsychosis uses the relevant turn history. Kusanagi may leave before the pending defeat | Cyberpsychosis card suite passed. Verify both FAQ scenarios directly, including the Kusanagi ordering prompt. |
| 9, 10 | Floor It can target zero power. Gorilla Arms triggers once per qualifying batch | Related card suites passed. Add the exact zero-power and simultaneous two-Gig cases. |
| 11–13, 29, 32, 33 | Goro's bonus snapshots on resolution. Nadia reads the current Gig count. Panam uses the stated mixed target sets | Source and reference tests cover the component rules. Verify state changes after Goro's trigger, the Nadia count crossover, and both Panam zone combinations. |
| 15, 17, 18, 24, 26, 41, 50 | Played-turn attack permission, Adrenaline, and ready-target restrictions | Reference card suites passed. Verify both Johnny and next-attack interactions and the must-attack versus cannot-attack conflict. |
| 16, 28, 35, 39 | Jackie may replace a mass defeat. Muamar protects against fight defeat. Gear follows a defeated Legend to an applicable destination | Replacement and Gear movement have related tests. Verify mass defeat ordering and effect defeat during the Fight step. |
| 19, 20 | Lizzy's Program finishes before old pending effects and moves directly to the bottom of the deck | The older-trigger case reproduced and has a passing Vault fixture. The engine still uses trash during resolution. Verify the correct transient zone and when bottom-deck cleanup runs. |
| 23, 30, 46, 48, 49 | MaxTac's spent check, Fixer die exclusion, mandatory private search selection, printed cost, and the first Arasaka attack | Matching reference suites passed. Verify the Fixer and printed-cost edge cases and the private search projection through the Vault worker. |
| 31, 42–45 | Overwatch, Faceplate and Rippler timing across costs, attacks and attachment changes | Vault verifies a payment Rippler runs after a Program and the rival cannot see the search. Verify the moved Gear's queued effect and exact attack ordering. |
| 36–38 | Rogue uses the first qualifying steal across the turn and across copies | The retail patch and Vault regression check prior steals, later copies and changed die values. Re-run the Gorilla Arms cascade with final Eddie and Gig assertions after correcting the legacy prompt expectation. |

Switch to desktop design, UX and art after the known Program zone and cleanup gap is resolved, the open rulings have a passing regression or documented scope disposition, and worker tests cover private searches and nested choices from both seats. Repeat the seeded and desktop-control runs against that build.
