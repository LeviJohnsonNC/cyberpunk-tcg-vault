# Cyberpunk TCG engine

This generated browser module pins [TheCardGoat/tcg-engines](https://github.com/TheCardGoat/tcg-engines/tree/6de59de1c203827edc1bc6faa1bc6184cd126a5f) and bundles its Cyberpunk runtime, card catalog, and greedy strategy. The accompanying MIT notices cover the upstream engine and bundled dependencies.

The hidden-information patch hides both seats' face-down Legends and assigns fresh instance IDs when their pre-game crews are shuffled. `entry.ts` supplies the strategy with a filtered view and legal prompt. Vault owns the worker lifecycle, deck validation, and player-facing snapshots in `src/lib/play`. The retail-rules patch updates the pinned engine for confirmed October rules changes. The manual-payments patch exposes legal costs and sources to the player. See the [audit](../../docs/play-rules-audit.md) for the source versions, coverage, and release gates.

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
