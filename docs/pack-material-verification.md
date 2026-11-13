# Campaign pack materials — verification

PR: https://github.com/LeviJohnsonNC/cyberpunk-tcg-vault/pull/92

Preview: https://cyberpunk-tcg-vault-git-codex-pa-d6eaf2-levijohnsonncs-projects.vercel.app/campaign-preview.html?materials

## Presentation

The featured card has a perspective pose, physical edge thickness, directional rim, narrow bloom, soft halo, contact shadow, tabletop spill and a short reflected image. Exact printing art remains unchanged. Common was implemented and rendered at laptop sizes before the other materials were introduced.

| Printing rarity | Material |
| --- | --- |
| Common | Quiet satin, cyan/amber environmental catches |
| Uncommon | Mint and silver edge finish |
| Rare | Warm metallic edge and short gold sweep |
| Epic | Violet/rose interference finish |
| Secret | Champagne pearl, subtle iridescence and corner catches |
| Iconic Other | Cyan/magenta dichroic separation |
| Iconic Legend | Gilded rim with restrained prismatic accents |
| Iconic Secret | Platinum/gold prism and the richest reveal |

The reveal sequence retains the physical flip and movement. Surface effects begin only after the face is exposed and its exact artwork loads. They last 480–990ms, overlap movement and settle to quiet static edges. Previously revealed cards do not replay discovery effects. The lineup uses lighter versions of the material edges; its selection outline and marker are independent of rarity.

## Rendered verification

Inspected actual Vercel preview UI through the connected Chrome browser:

- Common pose and lighting together at 1440×900 and 1366×768 before continuing with the material family.
- All eight rarities together at 1920×1080, with the same scale and camera; labels can be hidden.
- Actual flip, flight, material onset and resting states across all eight rarity fixtures.
- Afterlife, Rooftop and Arasaka environments.
- 1366×768, 1440×900, 1920×1080 desktop viewports.
- 390px and 320px phone viewports: no horizontal page overflow; the lineup scrolls independently and controls remain accessible.
- Repaired rectangular halo cutoffs found during the comparison.
- Repaired the reflected image transform and checked that the reflected image overlaps its masked frame.
- Final browser console error check returned no errors.

## Interaction and regression checks

- Nonsequential reveals and repeated clicks: one saved reveal per slot.
- Sealed slots have no rarity/material attributes, material styles or revealing accessible labels.
- Selecting a previously revealed card clears the discovery state; settled surface opacity is zero.
- Reloading a partially opened pack restores its revealed slots and exact printing without replaying discovery.
- Card inspection preserves authentic printing metadata.
- Enter and Space reveal cards; keyboard focus stays on the selected slot.
- Reduced-motion fixture exercises the production matchMedia branch and disables preview CSS animations. Reveals settle immediately with the correct static material and no in-flight/discovery state.
- Mute preference toggles correctly and revealing works with effects disabled; restored the initial enabled setting. Existing shared cue routing is unchanged.
- Seven-card fixture reaches bonus selection; choosing Kiroshi Optics reaches the Workbench with owned count increased from three to four.
- Five-card retry completes directly into the Workbench without a bonus offer.
- The fixture uses an isolated qa:pack-materials save scope and is included only in development/Vercel preview builds.

## Automated checks

Final application-code commit: 994901773144b226215990899a0e831f6bce68e0.

- npm run check passed: lint, 445 tests across 41 files, TypeScript and production build.
- git diff --check passed.
- Vercel build succeeded.
- The existing large-chunk build warning remains; no dependencies, shader libraries or production image assets were added.
- Reward generation, printing probabilities, inventory rules and campaign progression were not changed.

## Screenshots

Common, settled:

![Common presentation](screenshots/pack-material-common.jpg)

All eight materials, settled:

![Eight rarity materials](screenshots/pack-material-eight.jpg)

Use Reveal seven and Reveal Iconic Secret in the preview studio to watch the actual production reveal animations. The screenshots show their quieter resting state.
