# Fixer: a Cyberpunk TCG toolkit

Repo: `cyberpunk-tcg-vault`. A Night City-styled collection tracker, price book (USD or CAD) and deck builder for the **Cyberpunk Trading Card Game** (WeirdCo × CD PROJEKT RED, set *Welcome to Night City*).

- **Collection:** the full card database (152 cards, every printing) with search, sort and filters (colour, type, rarity, cost, sell tag) and one-click quantity edits.
- **Price book:** TCGplayer market prices in USD or CAD (toggle in the header), with value by rarity and colour, a price-confidence flag on every card, trade-binder extras and CSV export.
- **Deck builder:** pick a three-Legend crew and see per-colour RAM limits enforced live. It checks 40-50 card decks, the 3-copy cap and the 7-card sideboard, and shows the cost curve, sellable count, which cards you own versus need, and the CAD cost to finish the deck.
- **Meta intel:** a rules primer, early popularity data, 12 curated decks across all four colours with a "decks I can build" filter (all / 80%+ owned / fully owned), and **Built from your vault**: an instant, deterministic auto-builder that tries every Legend crew you own and returns the best three legal decks, with optional steering (colours, style, must-include cards) and priced upgrade suggestions. Signed-in users can **Refine with AI**: a language model tunes one build against your full pool and explains the game plan, mulligan and swaps. The model only proposes; the server repairs and re-validates its list, so the result is always legal and built from cards you own. Prices always come from our data, never the model.
- **Music:** an optional soundtrack player (never autoplays). Tracks live in `public/music/`, listed in `src/lib/playlist.ts`.
- **Demo mode:** try everything with a sample collection, no sign-in, nothing saved.
- **Feedback:** an in-app form (stored in Supabase) plus a How it works page.
- **Upgrade planner:** from the Deck Builder, a Meta Intel auto-build or a freshly logged starter, see up to three legal upgrade options (Strongest, Fewest changes, Best value) for a $0, $10, $25 or custom budget in USD or CAD: cuts, adds, owned vs to-buy copies, the price basis and the cost to finish the deck. Lock cards to keep them. Read-only, no sign-in or AI needed.
- **Starter decks:** "I own The Heist / Embracing Power" logs the whole box (3 Legends + 40 cards, Retail or Beta printing) in one step, from the official WeirdCo decklists.
- **Add cards:** type to search, or upload photos. A vision model proposes matches and you confirm before anything is saved.
- **Accounts:** email magic-link login through Supabase, with per-user collections and decks protected by row-level security. Without Supabase configured, the app runs in local mode (browser storage).

> Unofficial fan project. Not affiliated with WeirdCo or CD PROJEKT RED. Card data and images come from the official Cyberpunk TCG card database (netdeck.gg). Prices come from TCGplayer via the [tcgcsv.com](https://tcgcsv.com) daily mirror.

## Stack

| Piece | Tech |
| --- | --- |
| Front end | React 19 + Vite + TypeScript, hand-rolled CSS on shared tokens (`src/theme.css`, see `docs/design-system.md`) |
| Auth + data | Supabase (Postgres + RLS) |
| Photo scan | Vercel serverless function (`api/scan.ts`) → OpenRouter vision model |
| Card + price data | `scripts/sync-data.mjs`, run daily by GitHub Actions and committed to `src/data/` |

## Run locally

```bash
npm install
npm run dev            # http://localhost:5173 (uses .env.production values for Supabase if no .env.local)
node scripts/sync-data.mjs   # refresh cards + prices + FX
```

To test photo scanning locally, use `vercel dev` with the server env vars below.

## Deploy (one-time setup)

### 1. Supabase
1. Create a project at supabase.com.
2. **SQL Editor → New query**: paste [`supabase/schema.sql`](supabase/schema.sql) and run it. Existing projects upgrade by running the files in [`supabase/migrations/`](supabase/migrations) in order (`002_ai_usage.sql` adds the AI refinement counter; `003_global_caps_feedback.sql` adds site-wide AI caps and the feedback table; `004_move_copies.sql` adds the atomic `move_copies` function used to assign a printing to copies. Until 004 runs, moving copies in cloud mode shows a "needs migration 004" message and changes nothing).
3. **Authentication → URL Configuration**: set **Site URL** to your Vercel URL (e.g. `https://cyberpunk-tcg-vault.vercel.app`), and add the same URL under **Redirect URLs**.
4. *(Optional) Google sign-in:* create an OAuth client in Google Cloud (see "Google sign-in" below), then **Authentication → Sign In / Providers → Google**: enable it and paste the Client ID and Secret. The "Continue with Google" button appears automatically once the provider is on.
5. Copy the **publishable/anon key** into `.env.production` (`VITE_SUPABASE_ANON_KEY`). It's public by design. Keep the secret/service-role key out of git.

### 2. Vercel
1. **Add New → Project → Import** this GitHub repo. The framework preset (Vite) is detected from `vercel.json`.
2. **Settings → Environment Variables** (Production + Preview):

| Name | Value | Notes |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | `sk-or-…` | Required for photo scan. Server-only. |
| `SUPABASE_URL` | `https://<ref>.supabase.co` | |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret key | Verifies logins and counts scans. Server-only. |
| `OPENROUTER_MODEL` | `google/gemini-2.5-flash` | Optional. Any OpenRouter vision model. |
| `SCAN_DAILY_LIMIT` | `25` | Optional. Scans per user per day. |
| `DECK_MODEL` | `anthropic/claude-sonnet-5.5` | Optional. OpenRouter model for AI deck refinement. |
| `DECK_DAILY_LIMIT` | `3` | Optional. AI refinements per user per day (about $0.02 each on the default model). |
| `UNLIMITED_EMAILS` | `you@example.com` | Optional. Comma-separated accounts that skip all AI limits. Keep it out of git. |
| `REFINE_GLOBAL_DAILY_LIMIT` | `40` | Optional. Site-wide AI refinements per day, so traffic spikes can't drain your OpenRouter credit. |
| `SCAN_GLOBAL_DAILY_LIMIT` | `300` | Optional. Site-wide photo scans per day. |

3. Deploy. Pushes to `main` redeploy automatically, including the daily data-sync commits.
4. *(Optional)* **Analytics → Enable** to turn on Vercel Web Analytics (the app already includes the script).

### 3. GitHub Actions
`.github/workflows/sync-data.yml` refreshes cards, prices and the USD→CAD rate daily. Make sure **Settings → Actions → General → Workflow permissions** is set to **Read and write** so the bot can commit.

## Google sign-in

1. Google Cloud Console → **APIs & Services → OAuth consent screen**: set up an External app (name, support email). Scopes: `openid`, `email`, `profile` only. Then **Publish app**: these basic scopes need no Google review, and while the app is left in Testing, only listed test users can sign in.
2. **Credentials → Create credentials → OAuth client ID → Web application**
   - Authorized JavaScript origins: `https://cyberpunk-tcg-vault.vercel.app`
   - Authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`
3. Paste the Client ID and Client Secret into Supabase → Authentication → Providers → Google, and enable it.

## How pricing works

Two separate questions, two functions in `src/lib/data.ts`:

**What is a copy I own worth?** (`valueHolding`, used by Collection, the card drawer and the Price Book)
- **Market**: TCGplayer's market price for that exact printing.
- **Beta proxy**: a Retail printing with only a higher listing (or none) is valued at its verified Beta twin's market price. Twins are the same card, rarity and collector number in the paired set (e.g. The Heist Retail #011 and Beta #β011), derived by the generator. The UI names the source printing.
- **Low listing**: no market price for that printing, so its own cheapest listing.
- **Unpriced**: none of the above. Promos, event and Nova Rare printings never borrow another printing's price. Totals show the priced subtotal plus the number of unpriced copies.

**What would one playable copy cost to buy?** (`acquireQuote`, used by the Deck Builder, Meta Intel, auto-build suggestions, Refine and the Upgrade Planner)
- The cheapest direct quote on a named printing: any market price beats any listing. The estimate names the printing, its basis and the TCGplayer link. Valuation proxies never count.
- Partial estimates read like "$12.40 USD + 2 unpriced copies". "Nothing to buy" only means zero missing copies, and incomplete estimates never rank as cheapest to finish.

Feed rules (`scripts/price-build.mjs`): a printing is matched to a TCGplayer row by set and collector number. If two different rows (e.g. Normal and Foil) share that key, the catalog has no finish data to choose with, so the printing stays unpriced and the sync logs it. Mid price is not used. USD is converted to CAD with the daily rate from open.er-api.com.

## Data model

- `collection_items`: one row per user × printing (`card_slug`, `printing_id`, `qty`, `note`)
- `decks`: legends (`text[]`), cards and sideboard (`jsonb` slug → qty), and `is_public`
- `scan_usage`: per-user daily scan counter, written only by the server function
- `ai_usage`: per-user, per-feature daily AI counter (`bump_ai_usage`), written only by the server function
- `ai_global_usage`: site-wide daily AI counter per feature (`bump_ai_global`), server only
- `feedback`: in-app feedback; anyone can insert, nobody can read through the API (use the Table Editor)

## Project layout

```
docs/design-system.md    Afterlife design language (read before UI changes)
CLAUDE.md                agent instructions
api/scan.ts              photo-scan function (auth, rate limit, OpenRouter, fuzzy match)
api/refine-deck.ts       AI deck refinement (auth, limit, OpenRouter, repair + validate)
api/_deckrules.ts        server copy of the deck rules and the repair step
api/_aiguard.ts          site-wide daily AI caps and the unlimited-accounts check
api/_cards.ts            generated card-name list for the scanner
api/_carddata.ts         generated card stats and text for the server (scripts/gen-api-data.mjs)
scripts/sync-data.mjs    card DB + TCGplayer + FX sync
scripts/decks_src.py     recommended deck lists + legality checks (writes src/data/decks.json)
scripts/deck_notes.json  recommended deck write-ups and sources
src/curated/             hand-curated card ratings for the auto-builder
src/data/*.json          generated card, price and deck data
src/lib/                 data helpers, Supabase client, store (local and cloud)
src/views/               Collection, PriceBook, DeckBuilder, MetaIntel, AddCards
supabase/schema.sql      tables, RLS policies, AI counters, feedback
supabase/migrations/     upgrades for existing projects
public/imports/          sample collection (one-click import)
```
