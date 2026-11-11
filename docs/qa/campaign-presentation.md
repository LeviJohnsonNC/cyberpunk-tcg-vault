# Campaign presentation verification

Scope: pack opening, act arrivals, victory recap, room unlock presentation, and understanding/editing the latest pack. Encounter balance, rewards, engine and AI remain as tuned in PR #57.

## Automated evidence

- `npm run check`: lint, 391 tests in 37 files, TypeScript and production build pass. Existing lint fast-refresh warnings and bundle-size warning remain.
- Six new presentation tests cover nonmutating edit previews, legal/illegal and inventory-limited swaps, same-colour Legend replacement, recap derivation, latest-pack choice isolation and durable/stale act acknowledgement. Atomic save tests confirm inventory conservation.
- The sound suite exercises every cue, including pack open/reveal, choice lock and act arrival, through the shared mute/volume/voice-limiting implementation.
- The QA fixture page builds only for development/Vercel preview. Production build excludes `campaign-preview.html`.

## Browser evidence

The preview fixture page uses a dedicated `qa:campaign-presentation` scope, real starters and deterministic generated packs. It cannot read or modify a user's Vault. This tests real UI/storage flows without claiming to have won nine matches.

- Opened a sealed pack, refreshed at 1/7 and resumed that same reveal position. Reveal all reached 7/7; the eighth-card choice led to the workshop without modifying the 40-card deck.
- Compared an addition and a one-for-one swap; before/after counts and average cost changed correctly. Confirmed the swap, refreshed and verified the saved quantity. Confirmed same-colour recruitment and undid it.
- Both starters show their actual colour-appropriate recruitment offers and rules.
- Act II survives refresh before acknowledgement; after Review my new cards, refresh stays in the workshop. Act III hands off to an actual engine match with its opening hand and first decision intact.
- Victory shows actual fixture crew, nine clears and 64 earned cards. An unchanged starter honestly reports zero added main-deck copies. Room preview Escape returns focus to its trigger; claiming/equipping survives refresh.
- Muting effects persists through refresh.
- Initial inspection at 1280×800 and 1440×900 CSS pixels, and 125% browser zoom (1024×640 CSS pixels). Fixed inherited poster borders/tilts and tightened the comparison dialog after this inspection.

## Practical limits

- This is a presentation/interaction QA pass, not a full human campaign playthrough or new proof of balance. Complete runs with both starters and subjective pacing/audio feedback remain useful release feedback.
- Reduced-motion, hidden-tab and Room motion behavior are implemented in CSS/subscriptions and reviewed in source. OS preference switching and simulated offline/storage-failure conditions were not manually exercised in this browser pass; existing storage error paths remain in place.
- Artwork uses the existing nonblocking card-back fallback. The three new room images total about 362 KB, and full pack manifests preload after the sealed view mounts. No animation or image-load promise gates progression.
