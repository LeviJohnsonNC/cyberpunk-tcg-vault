# Play Mode tactical clarity

This pass changes presentation and inspection only. Legal action forms, engine commands, AI decisions, RNG, authoritative match checkpoints and presentation skipping are unchanged.

## Shipped behavior

- The inspector pairs larger art with readable printed rules, current cost/power, damage, attached Gear and engine-projected effects. Gear expands to its own rules. Current abilities are shown separately from printed text.
- Power equations are displayed only when the visible base, Gear and projected modifiers reproduce the engine's current value. Otherwise known contributions and the authoritative total are shown without guessing missing modifier sources.
- Hover/focus previews choose a position clear of the hand, decision controls and eligible targets. A landscape arrangement fits shorter laptop screens. If neither fits, Details/I remains available.
- Payment receipts show effective cost, the chosen Eddie/Legend sources and the balance after payment. Reserved Legend spend costs are explicit. Copy states that card entry, subsequent costs and effects can change the final balance.
- Combat participants, current power and the current stage stay visible during mandatory effects. Participants can be inspected without losing the selection. Public choice narration identifies visible sources; hidden sources stay hidden.
- Player-wide effects have an Effects disclosure with the affected side, source and duration. This uses the engine's existing filtered projection, rather than inferring effects from card text.

## Verification

`npm run check`: 340 tests in 30 files pass, including the production build/typecheck. Lint has the existing warnings; Vite retains the existing large-chunk warning. New cases cover additive/multiplicative power, the zero floor, unprojected modifiers, concealed cards, reserved Legend costs, pool Eddies, forced paid plays, unchanged submitted commands, preview collision avoidance and combat-plus-choice rendering.

Browser playthrough on the Vercel preview used Heist Reloaded against Sharp Heist Reloaded:

- Paid 1 for Floor It and 3 for Dexter; receipt sources and post-payment balances matched the board.
- Refreshed before confirming Floor It: the selected card and payment survived, without committing the move.
- Equipped Tetratronic Rippler: Dexter inspection showed `Base 4 + 1 Gear = 5`.
- Attacked into a rival with Mandibular Upgrade: combat remained visible while choosing trigger order, adjusting a Gig and placing the Gear's revealed card. The rival blocked and combat completed.
- Inspected the attacker during a mandatory choice, closed with Escape, and continued that choice. Closing ordinary inspection returned focus to its trigger.
- Resized to 390 × 844: the desktop-only gate remained intact, with no horizontal overflow; returning to desktop recovered the match.

- Verified Reboot Optics in the table-wide Effects disclosure: affected side, duration and expandable source rules are present.
- Inspected Psycho Squad with Mandibular Upgrade: its current Blocker ability and the attached Gear's rules are readable together. Zero-power Gear does not show a meaningless `+0` badge.
- At 1024 × 768, the 860px inspector fits completely, including its close control. The hover preview switches to a 440 × 330 landscape layout with readable rules. DOM bounds confirm that it does not overlap the hand or command controls.
- At 2048 × 1010, the portrait preview also clears the hand and command controls. `I` opens inspection; Escape closes it and returns focus to the same card. The temporary viewport override was reset after testing.

Screenshots: [card inspection](qa/tactical-inspection.png), [table effects](qa/tactical-effects.png), [small laptop preview](qa/tactical-laptop.png).

These checks do not claim exhaustive card/rules coverage or signed-in/Safari testing. Engine mechanics and random outcomes are outside this presentation pass; their existing regression tests remain in the full check.
