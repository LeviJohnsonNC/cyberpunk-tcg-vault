# Cyberpunk TCG Vault

## Scope and workflow

- This repository, `LeviJohnsonNC/cyberpunk-tcg-vault`, is the only codebase in scope. The production site is [cyberpunkvault.com](https://www.cyberpunkvault.com).
- Verify current behavior against the relevant branch, pull request, or deployment before making claims. Identify what you inspected when behavior differs across them.
- Make changes on a branch. Ask Levi before merging or taking production actions such as deploying to production, changing production configuration, or writing to production data.

## Setup and verification

- Run `npm ci` to install dependencies and `npm run check` before handing off a change. The check runs lint, tests, and the production build. Report any checks you could not complete.
- For a local-only preview, run `VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run dev`. Local development can otherwise pick up the Supabase settings in `.env.production`. Use local-only mode, the demo collection, or staging to exercise flows that write data.
- Visually verify UI changes in the browser at the relevant device sizes. For the collection tools and other responsive screens, check laptop (about 1280 px wide) and phone (about 390 px wide). For Campaign, test launch and resume on both a laptop and a phone. Free Play still shows its desktop-only message on a phone.

## Design and game rules

- Follow the [Afterlife design guide](docs/design-system.md). Reuse shared components and theme tokens, and use the Price Book as the guide's reference implementation.
- When changing gameplay, card interactions, or deck legality, verify the behavior against the [official Cyberpunk TCG Comprehensive Rules](https://cyberpunktcg.com/comprehensive-rules) and any applicable official rulings or errata. Cite the relevant rule or ruling in the pull request.
