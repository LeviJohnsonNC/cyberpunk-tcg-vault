# Play Mode rules audit

**Status: design gate held.** This audit found and fixed rules discrepancies. It establishes a reproducible baseline for the next rules pass.

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
| Sell and costs | Bootleg Black Sapphire Show keeps Sell for Turn available. Rule 5.8.2.3 and the explicit card FAQ govern this outcome despite the older conflicting sentence in 11.12.2.2. Discounts have a floor of one Eddie under 11.11.3. The free-play path bypasses discounts. Manual payment selection is a remaining Play Mode control gap. |
| Fight and defeat | The fight comparison fixes the outcome. Defeats are applied before post-fight abilities resolve. Temporary fight effects are removed before those abilities run. Defeat replacements still occur in the fight, and the actual Maelstrom Zealots fixture verifies the order of both defeats. Broad checks cover zero power, ties, Gear, and automatic win/loss effects. Retain targeted coverage for last-known information and stacked replacement effects. |
| Gig adjustments and steals | The engine validates die faces, limits D20 selection and applies steal count and prevention. It transfers selected Gigs before firing steal effects. The batch can count per Gig or once, as authored on the card. Historical Gig values and source power now preserve Rogue's first qualifying steal when a die changes value or another copy enters. |
| Effect timing and targets | Conditions are evaluated at resolution under 10.16.1.1. An ability whose condition may change can enter the ordering prompt. Existing coverage checks stacked trigger keywords, legal Gear targets and self-redirect prevention. Audit target availability, paid activations and timing across remaining post-pin FAQ cases. |
| Deck movement and Gear | Current top-of-deck effects use a one-card remainder. Existing bottom-deck handling groups attached Gear and uses the owner's deck. The generic multi-card top-deck rules in 11.16 need dedicated engine coverage before an authored card relies on them. |
| Catalog and errata | All 151 cards marked legal in Vault resolve to distinct engine definitions. Johnny Silverhand: Never Stop Fighting has no Sell Tag. Kiroshi Optics targets a friendly Unit or face-up Legend. The upstream card-authorship test flags a pre-existing Alt Cunningham wording difference. Compare the live definition and test the precise FAQ behavior before signing off card-by-card coverage. |

## Verification and release gate

- Vault regression tests cover the deployed worker adapter and the rebuilt engine, including effect selling, combat timing, deck-out, and a real private peek.
- The upstream reference suite was run before and after the patch. The revised run passed 2,444 tests. The failure list includes older Sell and fight assertions and tests that assume a conditional or already-consumed trigger always produces a specific prompt. It also includes the pre-existing Alt Cunningham authorship mismatch and a Shattered Memories animation assertion. The Reboot Optics source-name fallback was corrected and checked separately.
- Thirty-two seeded matches finished across both starters, all four candidate rivals and both seats. A Chromium run completed through the visible desktop controls after the engine rebuild and checked rematch and draft preservation.

Keep design work gated until the remaining mechanical choices are available, the latest card FAQ cases have a traceable verification matrix, and the remaining high-risk timing and privacy cases have executable checks. A complete match demonstrates playability. Rules sign-off requires evidence at the interaction level.
