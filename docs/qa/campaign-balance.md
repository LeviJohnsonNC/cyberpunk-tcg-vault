# Campaign encounter and reward calibration

## Roguelike calibration

Balance version 4 gives Ledger a Yellow/Red Gear deck. River and Viktor still support inexpensive Gear. Cheap carriers, Meredith, and Detonate give Ledger more ways to contest the field against both starters. Ledger uses the Sharp profile from version 3. Earlier campaigns keep their pinned rival decks.

The benchmark's `boss-ready` policy builds from legal earned inventory while keeping the original Legends. It makes up to three substitutions per pack and favors playable threats and matchup answers, including Safety Override and Rita Wheeler for The Heist and Detonate and Meredith Stout for Embracing Power. It plays the same Sharp reference as the untouched starter policy. Set `CAMPAIGN_TRACE=1` to record the reference deck and composition, plus each actor's plays and visible targets.

| Encounter | The Heist starter | The Heist edited | Embracing Power starter | Embracing Power edited |
| --- | ---: | ---: | ---: | ---: |
| First Call | 7/10 | 7/10 | 9/10 | 9/10 |
| Chrome Debt | 2/10 | 2/10 | 4/10 | 4/10 |
| Last Call, two simulated retry packs for edited decks | 2/12 | 4/12 | 5/12 | 10/12 |

The opening sweep uses version 4 and seeds 76–85. The finale sweep uses version 3 and seeds 76–87, with the same Last Call deck, AI, and reward stream in version 4. Each row uses the production player seat and pairs the shuffles across policies. Chrome Debt's version 3 reference on seeds 76–85 was 7/10 and 5/10 for the untouched and edited Heist decks, and 5/10 and 8/10 for the untouched and edited Embracing Power decks. All reported games finished without an engine error or stall.

Several Sato variants tried early Eddie sales, different Gear hosts, and changes to removal, ramp, and finishers. Results varied with the route and shuffle. On seeds 66–71, Sato's current list and plan yielded 4/12 starter wins and 8/12 edited wins with win packs alone. Prioritizing early Eddie sales narrowed that upgrade advantage in exploratory trials. The benchmark shows that earned edits can help, but the boss still misses the target of fewer than 10% starter wins and around 30–45% edited wins on both routes. Human play is pending.

```sh
CAMPAIGN_BALANCE=v4 CAMPAIGN_FIRST_SEED=76 CAMPAIGN_SEEDS=10 CAMPAIGN_SEATS=player \
  CAMPAIGN_POLICIES=starter,boss-ready CAMPAIGN_ENCOUNTERS=1,2 \
  node scripts/benchmark-campaign.mjs /tmp/campaign-v4-opening.json
CAMPAIGN_BALANCE=v3 CAMPAIGN_FIRST_SEED=76 CAMPAIGN_SEEDS=12 CAMPAIGN_SEATS=player \
  CAMPAIGN_POLICIES=starter,boss-ready CAMPAIGN_ENCOUNTERS=9 CAMPAIGN_RETRY_PACKS=2 \
  node scripts/benchmark-campaign.mjs /tmp/campaign-v3-boss.json
```

### Last Call defense

The replay traces showed that an equipped MaxTac AV or Go Solo attacker could take two Gigs in one attack. Sato's new profile can recognize that breakpoint on a visible attacker and target the Gear with Detonate during the reaction window. The check covers the selected Gear and the same choice with the opponent's concealed cards rearranged.

The new profile is selected when a new campaign reaches Last Call. Existing campaigns use their original profile. The broader defensive evaluation and several rebuilt lists gave inconsistent results between seed ranges. For example, the Sandevistan list cut Embracing Power's upgraded wins from 8/10 to 7/10 on seeds 102–111 and raised The Heist's starter wins from 2/10 to 5/10.

Replacing both copies of All Is Lost with Take Control raised untouched Embracing Power from 2/10 to 6/10 wins on those same seeds. The retained version uses the existing deck and a targeted Detonate reaction.

```sh
CAMPAIGN_BALANCE=v5 CAMPAIGN_FIRST_SEED=102 CAMPAIGN_SEEDS=16 CAMPAIGN_SEATS=player \
  CAMPAIGN_POLICIES=starter,boss-ready CAMPAIGN_ENCOUNTERS=9 CAMPAIGN_RETRY_PACKS=2 \
  node scripts/benchmark-campaign.mjs /tmp/campaign-v5-boss.json
```

### Last Call opening trials

The benchmark records the rival's field count, power, Gigs, and Eddie cards before passing on each of its first three turns. It also reports turn order and the reason the game ended. These fields help show whether a list reaches the board early and where a win-rate change comes from.

With the existing list, the early development trial sold spare Programs to enable a Unit, prioritized a second Unit when the reference had caught up on board, and kept the existing Detonate response. Sato finished his third turn with at least two Units or Go Solo Legends in 71 of 72 trial games, up from 57 of 72. The two seed ranges expose the trade-off.

| Seeds | Sato's opening | The Heist starter | The Heist edited | Embracing Power starter | Embracing Power edited |
| --- | --- | ---: | ---: | ---: | ---: |
| 118–127 | Current | 6/10 | 5/10 | 4/10 | 7/10 |
| 118–127 | Earlier development | 5/10 | 4/10 | 3/10 | 7/10 |
| 128–135 | Current | 5/8 | 5/8 | 5/8 | 4/8 |
| 128–135 | Earlier development | 4/8 | 2/8 | 2/8 | 0/8 |
| 136–145 | Current | 4/10 | 3/10 | 8/10 | 8/10 |

These games use the Sharp reference in the production player seat. Edited decks use eight win packs and two simulated House packs. The candidate made Sato's field more consistent, but reduced the benefit of upgrading. Selling a spare Program only when it enabled the first Unit yielded the same outcomes as the current plan on seeds 118–135. Shortening the development priority to the first two turns and requiring more Units in the mulligan also failed to give both routes a reliable upgrade advantage. The live encounter continues to use its existing deck and AI.

Two removal-heavy Sato lists used Yorinobu, Bonnie and Clyde, and Carnage at the Colosseum. The Yellow variant added Viktor and Gear. The Green variant kept Saburo and added more MaxTac AVs. On seeds 128–135, both gave untouched Embracing Power 5/8 wins and edited Embracing Power 4/8. Against the current deck on those seeds, the pressure and control policies yielded 3/8 and 1/8 wins on The Heist and 5/8 and 2/8 on Embracing Power. The boss-ready policy with win packs alone yielded 4/8 and 5/8. This sample puts the effect of deck construction and retry packs in the same range as several rival changes. Comparing earned decks with several distinct game plans is part of judging the next Last Call candidate.

```sh
CAMPAIGN_BALANCE=v5 CAMPAIGN_FIRST_SEED=118 CAMPAIGN_SEEDS=28 CAMPAIGN_SEATS=player \
  CAMPAIGN_POLICIES=starter,boss-ready CAMPAIGN_ENCOUNTERS=9 CAMPAIGN_RETRY_PACKS=2 \
  node scripts/benchmark-campaign.mjs /tmp/campaign-v5-opening-baseline.json
```

### Version 2 calibration

Both player decks start with the official retail list. Each run saves its opponent decks when it starts. The rest of this document records the earlier version 2 pass.

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
CAMPAIGN_BALANCE=v2 CAMPAIGN_SEEDS=6 CAMPAIGN_POLICIES=balanced CAMPAIGN_ENCOUNTERS=1,2,3,4,5,6,7,8 \
  node scripts/benchmark-campaign.mjs /tmp/campaign-route.json
CAMPAIGN_BALANCE=v2 CAMPAIGN_FIRST_SEED=6 CAMPAIGN_SEEDS=6 CAMPAIGN_POLICIES=casual,balanced,pressure,control CAMPAIGN_ENCOUNTERS=9 \
  node scripts/benchmark-campaign.mjs /tmp/campaign-finale.json
CAMPAIGN_BALANCE=v2 CAMPAIGN_FIRST_SEED=6 CAMPAIGN_SEEDS=3 CAMPAIGN_POLICIES=starter CAMPAIGN_ENCOUNTERS=9 \
  node scripts/benchmark-campaign.mjs /tmp/campaign-finale-starters.json
```

The reference plays Sharp. Each shuffle is tested in both seats. The balanced policy makes up to two composition-aware swaps per pack and declines recruitment. The casual policy chooses the lower-rated offer and makes up to one swap. Pressure and control choose legal recruits and make up to two swaps using their respective deck styles. `CAMPAIGN_BALANCE=legacy` replays the original content with the same test policies. To reproduce an equal-skill check, set both `CAMPAIGN_PLAYER_SKILL` and `CAMPAIGN_RIVAL_SKILL` to `standard`.
