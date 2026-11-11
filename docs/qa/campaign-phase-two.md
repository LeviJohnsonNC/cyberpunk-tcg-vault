# Campaign phase two: progression integrity

Phase two uses the campaign foundation merged in PR #55. This pass closes its persistence and recovery gate; encounter strength, reward appeal, and final presentation remain phase three.

## Evidence

- The exact two official starters and all nine pinned opponent decks pass shared deck and engine-support validation.
- The reward feasibility test generates eight complete, stable packs across 1,000 seeded paths per starter. It checks distinct identities, colour compatibility, and inventory caps, including paths that select recruit offers and paths that decline them.
- Full progression tests for **both** starters reopen the stored run at every non-match phase over nine encounters. They exercise partial reveal, complete reveal, stale revision rejection, one-time choice, saved temporarily invalid deck and last-legal restoration, main-deck swaps, Legend recruitment, final entitlement, and Free Play summary isolation. These tests use terminal match fixtures to isolate the progression store; they do not simulate nine human wins.
- A worker integration test starts a real engine match, reloads its exact checkpoint, concedes, confirms no award or inventory change, and retries with the same fixed pack and a new match ID. A stale command from the old match cannot replace the retry.
- An IndexedDB write failure test confirms the previous run remains intact and a subsequent legal write succeeds. Campaign mutations serialize through one transaction with revision checks.
- The campaign screen now blocks a second action immediately, prevents a focus refresh from painting over an active save, and sends the player to a page reload if the match worker has stopped.

## Remaining release work

These tests demonstrate the persistence and admission paths; they do not establish an actual player win rate, a satisfying reward curve, or human usability. Phase three owns match calibration with both starters and multiple earned-deck trajectories, full interactive playthroughs, visual review at desktop sizes and zoom, accessibility and missing-art states, and final art/sound polish. The local Chromium binary could not launch in this environment (`socket() failed: Operation not permitted`), so this pass has no new screenshot-based visual result.
