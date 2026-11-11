# Design system: Afterlife

The Vault's visual language. It's named for the Afterlife, the Night City merc bar: a night-market bulletin with gig-poster energy at the top of each screen and the clarity of a modern collection tracker in the working areas.

**Reference implementation:** the Price Book (`src/views/PriceBook.tsx` + `src/views/pricebook.css`). When in doubt, match it.

**Status:** every screen uses Afterlife (Collection, Price Book, Deck Builder, Meta Intel, Add Cards, card drawer, sign-in). The old 2077 yellow layer and its fonts have been removed. There are no legacy tokens left.

## Where things live

| File | Contains |
| --- | --- |
| `src/theme.css` | All tokens + self-hosted font imports |
| `src/styles.css` | App shell and shared classes (panels, buttons, chips, inputs, tables, tags, drawer, deck-builder and meta pieces, toasts) |
| `src/components/ui.tsx` + `ui.css` | Shared Afterlife components: `Masthead`, `MetricStrip`, `ConfirmDialog` |
| `src/components/DeleteCollection.tsx` | Destructive flow pattern (button + confirm + backup) |
| `src/views/pricebook.css` | Price Book-only pieces (marquee, holdings grid, rail) |

## Core rules

1. **One expressive focal point per screen.** Poster typography, clipped corners, halftone and angular accents go in a small number of high-impact places (a masthead, a marquee). Working surfaces such as tables, forms and rails stay quiet and legible.
2. **Give type distinct jobs.** Condensed display type for mastheads and headline numbers. Readable sans for interface copy. Mono for short metadata and numeric alignment. Never set paragraphs in display or mono.
3. **Make color carry meaning.** Pink signals emphasis and active state. Cream groups headline metrics. Price-basis and rarity colors always sit next to a text label, never color alone. Keep contrast and keyboard focus clear.
4. **Protect the information hierarchy.** The page's main job must be easy to scan. Use shared tokens and components for new UI. Decoration must support the hierarchy, not compete with it.
5. **Check the real states.** Before calling UI work done, review laptop (≈1280px) and phone (≈390px) widths, long names, missing card art, loading and empty states, and keyboard-only use.

## Tokens

All tokens live in **`src/theme.css`** (imported first by `src/styles.css`). Never hardcode a hex value in a component. Add a semantic token instead.

### Color

| Token | Value | Job |
| --- | --- | --- |
| `--color-canvas` | `#17101B` | Page background |
| `--color-canvas-deep` | `#110B14` | Header band, inset wells, inputs |
| `--color-surface` | `#201625` | Panels (holdings, rail) |
| `--color-surface-raised` | `#2A1C30` | Hover rows, skeletons |
| `--color-divider` | `#4A3248` | Borders, rules, bar tracks |
| `--color-text` | `#FFF0E6` | Primary text |
| `--color-text-muted` | `#C9AABF` | Secondary text, column headers |
| `--color-text-faint` | `#8E7488` | Tertiary metadata (printing IDs, units) |
| `--color-accent` | `#FF8CBB` | Emphasis, active nav, position totals, focus ring |
| `--color-accent-deep` | `#C4568A` | Marquee shading, strip shadow, rail border |
| `--color-accent-ink` | `#1B0F1D` | Text on pink |
| `--color-ticket` | `#F6DCA9` | Headline-metric tickets (valuation strip, "Most valuable" tag) |
| `--color-ticket-ink` / `--color-ticket-muted` | `#24161F` / `#6E5545` | Text on cream |
| `--color-basis-market` | `#A5F0C2` | Price basis: Market |
| `--color-basis-proxy` | `#FBE1A0` | Price basis: Beta proxy |
| `--color-basis-low` | `#FFA98F` | Price basis: Low listing |
| `--color-danger` | `#FF6B86` | Destructive actions, validation errors, "missing" markers |
| `--color-success` | `#A5F0C2` | Positive confirmation (legal deck, fully owned, toasts) |
| `--color-rarity-epic` / `-rare` / `-top` | `#E5B2FF` / `#9FD8FF` / `#FBE1A0` | Rarity chips (Epic, Rare, Secret/Iconic/Nova) |
| `--color-card-yellow` / `-blue` / `-red` / `-green` | | Card-colour bars and pips |

Contrast: primary and muted text on canvas or surface clear WCAG AA. Accent pink on canvas clears AA for UI text. On the pink marquee, names use `--color-accent-ink` and copy over the skyline uses `--color-text`.

### Type

| Token | Family | Role |
| --- | --- | --- |
| `--font-display` | Barlow Condensed 600–800 (800 italic for mastheads) | Mastheads, section titles, headline numbers |
| `--font-ui` | Inter 400–600 | All interface copy, card names, buttons |
| `--font-mono` | IBM Plex Mono 400–500 | Eyebrows, column headers, printing IDs, prices (with `font-variant-numeric: tabular-nums`) |

Fonts are self-hosted via `@fontsource` packages (imported in `theme.css`), so there are no third-party font requests.

### Shape and space

- `--cut-sm` (10px), `--cut-lg` (26px): clipped corners via `clip-path`. Use `--cut-lg` only on the focal element.
- `--radius-sm` (3px): chips, inputs, buttons.
- `--space-1`…`--space-6`: 4, 8, 12, 16, 24, 32px.
- `--focus-ring`: two-tone ring (canvas gap + pink). Applied globally on `:focus-visible`. Don't remove it.

## Component patterns

| Pattern | Where | Notes |
| --- | --- | --- |
| **Masthead** | `<Masthead>` (`ui.tsx`) | The screen's focal point. Mono pink eyebrow (`THE AFTERLIFE / <SECTION>`) with skewed mark; italic 800 condensed title, skewX(-4deg); pink end mark; mono subline with pink `◆` separators. `size="hero"` (Price Book only, ends in `!`) or `size="compact"` (every other screen, ends in a pink `.`). Optional page actions sit on the right. One per screen. |
| **Metric strip** | `<MetricStrip>` (`ui.tsx`) | Cream ticket band of 2 to 4 headline metrics. Phones: 3 items stack, 4 items go 2×2. |
| **Confirm dialog** | `<ConfirmDialog>` (`ui.tsx`) | Native `<dialog>`: focus trap, Esc and backdrop cancel, Cancel focused first. `tone="danger"` gives a red top rule and title. Use for every destructive action; offer an undo path (e.g. a backup download). |
| **Panel** | `.panel`, `.panel.hot`, `.panel-title` | Quiet surface. `.hot` adds a cream top rule for the primary panel on a screen. Titles in condensed display caps; `.aside` for mono metadata on the right. |
| **Buttons** | `.btn` (primary pink), `.btn.quiet` (neutral), `.btn.ghost` (pink outline), `.btn.danger` / `.btn.danger-ghost` | One primary per area. Destructive actions are always danger-ghost until confirmed. |
| **Marquee** | `.pb-marquee` | Clipped corners, pink gradient, conic sunburst, halftone mask, SVG skyline, tilted card in a cream frame, cream ticket label. Fed by real data; has loading, empty and missing-art states. |
| **Ticket** | `.pb-ticket` | Small cream label, mono caps, rotate(-2deg), hard ink shadow. |
| **Metric strip** | `.pb-strip` (a `<dl>`) | Cream band, dashed dividers, label + context line on the left, display number on the right. Stacks vertically on phones. |
| **Data table** | `.pb-rows` / `.pb-row` | CSS grid with explicit ARIA table roles. Identity cell = thumbnail + name + subtitle + printing ID. Numbers right-aligned, mono, tabular. Position totals in pink. |
| **Tags** | `.pb-tag.basis-*`, `.pb-rarity.r-*` | Outlined mono chips; colour + text label together. |
| **Breakdown rail** | `.pb-rail` / `.pb-breakdown` | Label ×count, bar, value. Dashed separators. Explanations in a `<details>` disclosure, not tooltips. |
| **App header** | `.appbar`, `.brand-badge`, `.navlink[aria-current]` | Plum-black band; skewed pink badge; active section gets a 3px pink underline. |
| **View tabs** | `ViewTabs` and `.al-view-tabs` in shared UI | A pink selected state and a consistent focus ring for peer views. Arrow keys, Home and End switch tabs. |
| **Action feedback** | `.al-action-feedback` | Put the result beside the action, including the destination or updated quantity when it matters. Use text and colour together. |
| **Binder pockets** | `CollectionBinder` + `collection.css` | Full card artwork in quiet, aligned sleeves. The printing, owned count, and value sit below the image. The cream result strip anchors both Binder and List. |

## Responsive behaviour

- **≥1100px:** masthead and marquee side by side; holdings about 70%, rail about 30% and sticky.
- **<1100px:** marquee stacks under the masthead; rail stacks under holdings.
- **<760px:** metric strip stacks. Table rows reflow into a two-column card: the identity on the left, and total / basis / quantity on the right. Rarity and unit price move into a compact metadata line under the name. Card identity, quantity, total and pricing basis are always visible, with no horizontal page scroll.
- **761–1100px header:** brand and status on one row. The navigation rail below brings the active section into view.
- **≤760px shell:** compact Vault header with a menu for account, currency, music and feedback. Vault, Prices, Add, Decks and Intel stay in a labeled bottom bar. The shell reserves space for the bottom safe area and yields the bar when a text field or modal has focus.
- **Collection:** Binder uses five columns at wide desktop widths, four on laptops and two on phones. Filters move from a rail to a dialog sheet below 1120px. In the phone List, secondary columns hide so art, name, owned and value fit.
- **Deck Builder:** the status strip stays visible while browsing. On laptops the deck pane sits beside the pool and can scroll independently when the list is long. At 1000px and below, Find cards and Deck switch between the two panes of the same draft.
- Page height follows content. The laptop Deck Builder keeps its sticky deck pane within the available viewport.
- Motion respects `prefers-reduced-motion`.

## States checklist (every screen)

- Loading (cloud sync in progress): skeleton rows, `aria-busy`
- Empty: plain-language message plus the next action
- Missing art: text fallback, never a broken image
- Long names: wrap or line-clamp; never overflow the layout
- Keyboard: every interactive element reachable, with a visible focus ring

## Play Mode

Play Mode is the one screen where the cards are the interface. The table is the focal point, so it takes the expressive budget: no masthead, a slim title row, and everything else in service of reading the board.

**Layout** (`PlayTable.tsx`, `PlayMat.tsx`, `play-table.css`). Two crews face each other across the Gigs. From the top: the rival bench (piles, a hand of card backs, Eddies, Legends), the rival field, both Gig areas, the command bar, your field, then your bench with the hand between your crew and your piles. One measure, `--play-card-width`, sizes the whole table from the viewport so both fields, the Gigs and the hand stay in view without page scroll at laptop heights. Rows never scroll: a crowded field or hand overlaps its cards. Cards show art, not captions; the name lives in the accessible label, the hover close-up and the missing-art fallback.

**Command bar.** One fixed-height strip under the Gigs says whose turn it is, what is happening and what to do: the idle prompt and End turn, the decision tray, the combat line, or the caption for the move being shown. It never changes height. A decision that needs more room opens downward over your field. The action log and the complete action list are header panels.

**Motion** (`useTableMotion.ts`, planned by `lib/play/matchMotion.ts`). React renders each resting layout; the motion layer plays the journey between two of them and always ends on what React rendered. Cards, dice and Eddies travel between zones: draws flip out of the deck, plays land on the field, a rival card from hand is presented at the centre before it lands, cards that leave go to the pile they went to, and a stolen Gig slides across. The plan reads only the two filtered views and the public beat, so motion can never show hidden information. Positions are measured from layout offsets, so hover lifts and fan angles never disturb a flight. All of it is skipped under `prefers-reduced-motion`; the table then cuts between states.

**Combat.** The attacker steps toward its target and a live beam joins them. The command bar states the fight: attacker power, defender power or the Gigs under attack. When the attack connects, the attacker lunges, the hit lands on the defender, blocker or Gig area, and a defeated card breaks before it goes to Trash. Outcome numbers rise from the card or zone they changed.

**Payment.** Every payment opens filled in (`suggestPayment`: ready Eddies, then face-down Legends, then face-up ones) so an ordinary play is one confirmation, and focus lands on the confirm button. The suggestion never overrides a payment the player has touched, and the sources stay selectable on the mat.

**Sound** (`useTableSound.ts`, cues in `lib/play/tableSound.ts`). Short synthesised cues, no audio files. They are fired by the motion that shows each event, so a sound lands with its card, and are called off when that motion is skipped. One Sound toggle in the header; off until the player turns it on.

**Start and end.** A new match names the two crews before the first hand is dealt. The result waits for the last hit to land, then covers the table with the outcome and a report (`PlayResult.tsx`, `lib/play/matchReport.ts`): Gigs by turn, cards played and sold, Units lost, and cards that sat in hand for three or more turns. The report is built only from the player's own view. Chart lines are named and valued in the legend, never told apart by colour alone.

**Rival skill.** The setup screen offers Standard, Sharp and Masterful. All three play from what a player could see; say so wherever skill is described.

**Pacing.** `beatDuration` gives each public move enough time for its movement to land, and long sequences speed up without dropping below a readable pace. Skip always jumps to the current decision.

## Play Mode interactions

Click a card for legal contextual actions, drag it to a highlighted destination, or use the complete action-list fallback (All actions in the header). Card art enlarges on hover; a visible inspection control and the I key open details. Inspection never reveals a concealed identity.

All paths use the same action forms and engine commands. Spatial gestures express intent, not new rules. Ambiguous Legend entries offer ordinary play and Go solo separately. Payment sources are chosen explicitly from ready Eddies and eligible Legends. Only the active decision step highlights targets; do not combine unrelated host, payment, and effect targets.

Ordinary decisions use a single line in the command bar. Revealed cards, branching effects, ordering and placement reviews expand the tray downward without moving the table. Cancel before committing; after commitment, only clear unsubmitted selections or decline where the engine permits it. Ready/Spent state follows engine results.

Keep the hand reachable, use stable slots, respect reduced motion, and preserve valid pending selections after refresh. Motion must explain a state change; nothing moves for decoration. Hover previews yield to dragging and decisions. Keyboard focus follows user actions and never jumps away from the table.

Rival move pacing uses transient, read-only frames built from the player's filtered view at each public move. Save the authoritative final checkpoint before presenting the sequence. Skip, changing motion preferences, returning from a hidden tab, and refresh all return to the current decision without rerunning moves or RNG. Do not store the presentation queue in the match checkpoint or copy future logs, peeks or cards into earlier frames.

Combat keeps a persistent source-to-defender arrow and distinct Attacking/Defending labels. The command bar owns the Your response / Pass reaction control. Show only responses offered by the current engine prompt; mandatory choices must finish before passing. Arrows follow visible cards, reveal off-screen combatants horizontally, and yield to readable labels and controls. Public outcome feedback distinguishes power, Gigs, Street Cred and available currency; never infer a defeat from a generic move to Trash.

### Afterhours audio and room

The music deck is Afterhours Radio: plum hardware, a cream station label, pink transport, a real music spectrum, and readable track titles. Music starts only on an explicit play gesture; pause preserves position. Music volume and table-effects volume are independent and remembered. Existing mute choices win; new visitors hear restrained effects after their first table gesture. Ten concurrent effects maximum, short repeat suppression, a master compressor, and light music ducking keep busy turns controlled. Match audio stays independent of reduced-motion preferences.

`musicSignal.ts` analyses only the site's music element, never microphone/system audio. Its adaptive bass-onset envelope drives `ReactiveRoom` at at most 30 updates/second, outside React state. The room's photograph breathes slightly; edge lighting changes shape and soft rings follow bass transients. The mat and hit targets never move with music. Room motion has its own persistent switch and yields completely to reduced motion. Pause, mute, buffering, hidden tabs and silence stop or settle the visual response. No fixed-tempo loop pretends to be the music.
