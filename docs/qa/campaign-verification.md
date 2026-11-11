# Campaign verification — 11 November 2026

## Automated coverage

- `npm run check`: lint, TypeScript production build, and the full Vitest suite.
- Both official starter snapshots pass deck and engine validation. All nine pinned rival lists pass.
- 1,000 deterministic reward paths per starter traverse eight packs with seven unique main-deck identities and three distinct legal offers, without exceeding earned-copy limits.
- IndexedDB tests cover cross-tab revision conflicts, pack reveal and claim, final reward, old finish entitlements, scoped storage, archived runs, and a real worker match checkpoint/resume.
- The engine sweep uses a Sharp reference player and campaign rivals at their configured skills. The simulated upgrade policy chooses a non-Legend offer and makes up to three legal rating-based substitutions after each pack. It is a proxy for mechanical balance, not a human win rate or proof of optimal deck building.

## Original balance observations

The [phase-three calibration](campaign-balance.md) covers the current content. The results below record the original campaign.

The [ten-seed final sweep](campaign-benchmark.json) tested both starters with an untouched deck and the three-swap policy at encounters 1 and 9. The same shuffle seed is used across the two upgrade policies. The reference won 28/40 openings and 22/40 finales; all 80 games ended without a rejected command or stall. By path:

| Starter | Policy | First Call | Last Call |
| --- | --- | ---: | ---: |
| The Heist | Unchanged | 7/10 | 2/10 |
| The Heist | Three swaps after each pack | 7/10 | 6/10 |
| Embracing Power | Unchanged | 7/10 | 6/10 |
| Embracing Power | Three swaps after each pack | 7/10 | 8/10 |

These cells are small and the bot is better than many new players. The tuned Arasaka House List is markedly tougher against The Heist, but Embracing Power's upgraded path remains favored in this proxy. That is a balance item for human playtests, not a reason to claim a guaranteed difficulty curve. The [all-encounter smoke sweep](campaign-all-encounters.json) ran both starters through all nine tables with one seed each; all 18 matches ended without engine errors. The earlier [provisional stage sweep](campaign-benchmark-stages.json) predates the final boss and offer tuning and is retained only as a historical baseline.

## Reproduce the original sweep

At commit `5077edc`, run `CAMPAIGN_SEEDS=10 CAMPAIGN_POLICIES=starter,three-swaps CAMPAIGN_ENCOUNTERS=1,9 node scripts/benchmark-campaign.mjs /tmp/campaign-original.json`. The committed JSON reports include seed, starter, policy, opponent, winner, turn count, and any error.

## Remaining release checks

- The Vercel branch preview is protected by account authentication. The automated browser in this workspace could reach the deployment, but not the rendered campaign. Laptop visual inspection and a human full-run playtest remain necessary before calling this release polished or tuning final difficulty from human experience.
- Campaign runs, match checkpoints, packs, and rooms are saved per Vault in this browser's IndexedDB. They are not cloud-synced or transferred between devices. Clearing browser storage removes them.
