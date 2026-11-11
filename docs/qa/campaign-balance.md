# Campaign encounter and reward calibration

New runs use balance version 2. Existing runs retain their saved opponent lists, original opponent skills, and original reward algorithm. Both player decks still start with the official retail list.

## Encounter decisions

| Table | Change |
| --- | --- |
| First Call | The Heist faces a fixed, lighter Embracing Power practice list. Embracing Power faces the retail Heist list. |
| Chrome Debt | Added cheap Gear hosts to make the opponent's strategy show up earlier. |
| Dead Drop | Replaced a late Unit with one removal Unit. |
| Night Drive | Trimmed the top end to a 40-card Nomad list and moved the first Sharp match here. |
| Dead Air | Kept the tested Lowball Netrun+ list and Sharp skill. |
| Red Line | Kept the Smasher and Steel Dragon threats, trimmed the list to 40, and reduced the concentration of removal. |
| Mosh Pit | Made the Rocker list less top-heavy and gave it more early bodies. |
| Hostile Takeover | Focused the Streetkid list on its cheaper threats and answers. |
| Last Call | Rebuilt the Arasaka house list around Saburo, Goro, and Smasher. Blockers and more playable Units make the late threats less dependent on a perfect draw. |

## Reward decisions

Packs reserve the three offers before drawing the seven grants. Ordinary choices cover two curated deck directions and a flexible option. The Heist can pursue Gear and efficient Units or Blue tempo and Gigs. Embracing Power can build around Arasaka or independent pressure and removal. Early packs include a cheap Unit or sellable card. Late choices favor answers, draw, and blockers. At each act break, the picker seeks one compatible Legend of each colour and keeps a main deck choice. The two themes continue to feed the granted cards even when the offer is a recruitment decision.

The pack tests cover 1,000 seeded eight-pack paths per starter, all offered cards, colour and RAM fit, copy caps, exact replay, and exhausted theme pools. Engine runs use legal earned decks and include no recruitment, modest edits, and two different recruiting styles.

## Engine results

The First Call comparison used Standard on both sides over 12 shuffles and both seats. The Heist won 4 of 24 against the retail Embracing Power rival and 11 of 24 against the lighter practice list. Embracing Power won 20 of 24 against the retail Heist rival.

The final route used six shuffles per starter in both seats. Tables 1–8 use seeds 0–5 with the balanced upgrade policy. Last Call uses fresh seeds 6–11 with four upgrade policies.

| Table | The Heist, balanced | Embracing Power, balanced |
| --- | ---: | ---: |
| First Call | 5/12 | 5/12 |
| Chrome Debt | 11/12 | 12/12 |
| Dead Drop | 12/12 | 10/12 |
| Night Drive | 10/12 | 10/12 |
| Dead Air | 4/12 | 7/12 |
| Red Line | 5/12 | 6/12 |
| Mosh Pit | 4/12 | 10/12 |
| Hostile Takeover | 6/12 | 5/12 |
| Last Call | 7/12 | 3/12 |

| Last Call upgrade policy | The Heist | Embracing Power |
| --- | ---: | ---: |
| One swap and modest offer | 4/12 | 6/12 |
| Balanced | 7/12 | 3/12 |
| Pressure with recruitment | 2/12 | 7/12 |
| Control with recruitment | 2/12 | 5/12 |
| **Edited decks combined** | **15/48** | **21/48** |
| Retail starter diagnostic, first three shuffles only | 2/6 | 2/6 |

All 300 final matches ended without a draw, rejected move, or stall. The median was 13 turns. The slowest bot decision was 3.3 seconds while parallel sweeps shared the test machine. The casual decks replaced a median of eight starter copies by the boss. The other upgrade policies replaced a median of roughly 16.

Both starters recorded wins with every upgrade policy, including one swap per pack and declining every recruit. The balanced path won 28/36 and 27/36 in act one, 19/36 and 23/36 in act two, then 10/24 and 15/24 in the two encounters before the boss. The first match remains less forgiving for the Sharp reference than the next two, and The Heist has a tougher matchup at Mosh Pit. The final sample is small, with two seats sharing each shuffle and several policies sharing reward seeds. Human play is still needed to judge the difficulty curve and how compelling the reward choices feel.

## Reproduce

Run from the repository root. The seed range and exact opponent skills are written to the report. Use a distinct output path for each sweep.

```sh
CAMPAIGN_SEEDS=6 CAMPAIGN_POLICIES=balanced CAMPAIGN_ENCOUNTERS=1,2,3,4,5,6,7,8 \
  node scripts/benchmark-campaign.mjs /tmp/campaign-route.json
CAMPAIGN_FIRST_SEED=6 CAMPAIGN_SEEDS=6 CAMPAIGN_POLICIES=casual,balanced,pressure,control CAMPAIGN_ENCOUNTERS=9 \
  node scripts/benchmark-campaign.mjs /tmp/campaign-finale.json
CAMPAIGN_FIRST_SEED=6 CAMPAIGN_SEEDS=3 CAMPAIGN_POLICIES=starter CAMPAIGN_ENCOUNTERS=9 \
  node scripts/benchmark-campaign.mjs /tmp/campaign-finale-starters.json
```

The reference plays Sharp. Each shuffle is tested in both seats. The balanced policy makes up to two composition-aware swaps per pack and declines recruitment. The casual policy chooses the lower-rated offer and makes up to one swap. Pressure and control choose legal recruits and make up to two swaps using their respective deck styles. `CAMPAIGN_BALANCE=legacy` replays the original content with the same test policies. To reproduce an equal-skill check, set both `CAMPAIGN_PLAYER_SKILL` and `CAMPAIGN_RIVAL_SKILL` to `standard`.
