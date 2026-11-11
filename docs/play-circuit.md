# Afterlife Circuit

Six sequential contracts turn desktop practice into a personal progression loop. The Circuit board is the default setup view; Practice retains every existing opponent, import, mirror, own-deck and difficulty option. Opening an opponent from elsewhere still lands in Practice. The Circuit header returns to the board without discarding a live match.

## Release scope

- First Call / Heist Reloaded, Chrome Debt / Chrome Syndicate (Standard).
- Dead Air / Lowball Netrun+, Night Drive / Nomad Convoy (Sharp).
- Red Line / Smasher Surge (Sharp), Last Call / Arasaka 9s (Masterful).
- Every contract has permanent clear, bonus-objective and Masterful-win marks. The first clear opens the next job; the others give reasons to replay. Earlier contracts can be raised to Masterful. Rival lists and minimum skill are validated against the actual setup.
- Reputation ranks: Unlisted, Runner, Operator, Fixer, Headliner, Afterlife Legend. Thresholds: 0, 150, 400, 800, 1,400 and 2,400 REP. Ranks do not regress.
- Match REP: 75/100/125 for Standard/Sharp/Masterful wins, 25 for a completed loss or draw, zero for a concession. One-time clear/bonus/Masterful rewards: 100/50/75. Practice earns match REP, not contract marks. Restarting or replacing an unfinished match earns nothing.
- Five cosmetic table finishes, a six-seal collection and a recent-match journal. Lifetime counts and best win streak are retained; the journal shows the last 50 results. Cosmetics change presentation only.
- The result screen shows a saved receipt, promotion, new marks and unlocks before the expandable existing match report. Reduced motion removes the fill, seal and stamp entrances.

## Persistence and boundaries

IndexedDB `cptv.play-matches` version 2 adds `circuits`. Existing match/checkpoint stores migrate intact. Rewards, result receipt, checkpoint and summary share one strict read/write transaction. Concurrent tabs serialize, repeat resumes return the saved receipt, and a failed checkpoint write rolls back rewards. Cosmetic equips also read and update transactionally, so they cannot overwrite a concurrent match reward.

Progress is local to the browser and the existing Vault scope (signed-in user, local, or sample). The interface states that it is not cloud-synced and clearing browser data removes it. Switching accounts remounts Play Mode. A legacy match can finish without retroactive awards; its next rematch starts tracking. No competitive ranking, cloud leaderboard, expiry, streak-loss penalty, paid reward, altered card stats, or engine-rule changes.

## Verification

Automated coverage includes each objective, every real rival list, skill and unlock restrictions, one-time marks, no concession farming, repeat settlement, bounded history with lifetime totals, version-one database migration, scope isolation, simultaneous tab settlement, cosmetic/settlement races, rejected stale actions and failed-write rollback. Final build and browser verification are recorded after review.

## Art

`src/assets/play/afterlife-circuit.webp` is original generated key art, converted to WebP for the app (about 142 KB). Built-in image generation, prompt: wide cinematic fixer’s back room; dark chrome card trophy and physical challenge seals on worn plum leather, cream contract envelope, rain on smoked glass, hot-pink neon and faint cyan city lights. Right-side still life; left 55 percent quiet dark space for live UI text. Tactile materials, plum/pink/cream palette, no text or logos. The rank and contract seals are code-native SVG; all actual card art and names use the existing catalog.
