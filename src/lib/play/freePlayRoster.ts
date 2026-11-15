import { BY_SLUG } from '../data';
import { communityCrewMatches } from '../communityPopularity';
import type { Deck } from '../store';
import { ENCOUNTERS, type EncounterId } from './campaign';
import { campaignChapters } from './campaignStory';
import { curatedOpponents } from './opponents';

export const rivalCategories = [
  { id: 'all', label: 'All' },
  { id: 'meta', label: 'Meta' },
  { id: 'budget', label: 'Budget' },
  { id: 'brew', label: 'Brew' },
] as const;
export type RivalCategory = (typeof rivalCategories)[number]['id'];

export const rivalSorts = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'popularity', label: 'Meta popularity' },
  { value: 'nameAsc', label: 'Name A–Z' },
  { value: 'nameDesc', label: 'Name Z–A' },
] as const;
export type RivalSort = (typeof rivalSorts)[number]['value'];

const featuredEncounters = ['dead-drop', 'chrome-debt', 'night-drive', 'dead-air', 'mosh-pit', 'red-line'] as const satisfies readonly EncounterId[];
const campaignRivals = new Map(featuredEncounters.map((encounter, order) => [
  String(ENCOUNTERS.find(item => item.id === encounter)!.rival),
  { encounter, alias: campaignChapters[encounter].rival, order },
]));

const freePlayPortraits: Readonly<Partial<Record<string, { alias: string; art: string }>>> = {
  'lowball-netrun': { alias: 'Patchbay', art: 'patchbay' },
  'ripperdoc-rampage': { alias: 'Kiln', art: 'kiln' },
  'arasaka-nines': { alias: 'Glasshouse', art: 'glasshouse' },
  'triple-fixers': { alias: 'Switchline', art: 'switchline' },
  'streetkid-braindance': { alias: 'Crossfade', art: 'crossfade' },
  'ganger-surge': { alias: 'Saint Static', art: 'saint-static' },
  'baby-girl-bbg': { alias: 'Aftercare', art: 'aftercare' },
  'smasher-river-viktor': { alias: 'Coil', art: 'coil' },
  'smasher-muamar-river': { alias: 'Torque', art: 'torque' },
  'smasher-saburo-streetkid': { alias: 'Heirloom', art: 'heirloom' },
  'smasher-padre-streetkid': { alias: 'Votive', art: 'votive' },
};

// Short matchup notes describe the exact Free Play lists.
const matchupNotes: Readonly<Record<string, string>> = {
  'lowball-netrun': 'Low Gigs make its Programs cheaper and keep the cards flowing. Pressure before it can build up answers.',
  'heist-reloaded': 'Cheap Gear builds a board quickly. Pressure early and save an answer for an equipped attacker.',
  'lowball-netrun-plus': 'Cheap Programs and min Gigs keep the cards flowing. Towerfall punishes a wide field when this rival trails on Street Cred.',
  'chrome-syndicate': 'River can drop cheap Gear at Quick speed. Account for an extra Gear when you pick your fights.',
  'ripperdoc-rampage': 'Large Yellow Units and Gear threaten multi-Gig steals. Save removal for the biggest bodies.',
  'smasher-surge': 'Heavy Units and efficient removal punish weak trades. Save an answer for Smasher and protect your key Units.',
  'mosh-pit': 'Rockerboys apply early pressure and scale with Gear. Limit the early board before the biggest attacks land.',
  'arasaka-nines': 'Saburo pushes large Arasaka attackers to the two-Gig breakpoint. Keep removal for those threats.',
  'triple-fixers': 'All three Fixers can Call during a fight. Watch for a surprise combat trick when they leave an Eddie open.',
  'streetkid-braindance': 'Removal Programs keep coming back through Streetkid. Make them spend answers before committing your best threat.',
  'nomad-convoy': 'Nomad Units build a wide board and return through We Gotta Live Together. Break up their Gear and early attackers.',
  'ganger-surge': 'Ganger Units apply early pressure while Blue Programs keep the board moving. Contest the first wave.',
  'baby-girl-bbg': 'Min Gigs fuel draw and cheaper Programs. Pressure before the removal engine takes over and watch for Towerfall.',
  'smasher-river-viktor': 'Viktor finds cheap Gear and River can deploy it mid-fight. Target the Gear carriers before Smasher arrives.',
  'smasher-muamar-river': 'River and Muamar turn cheap Gear into combat pressure. Leave room for a Quick-speed swing.',
  'smasher-saburo-streetkid': 'Streetkid recurs removal while Saburo powers up Arasaka attackers. Save a blocker or removal for a two-Gig swing.',
  'smasher-padre-streetkid': 'Padre adjusts Gigs and Streetkid recurs removal. Keep pressure on before their payoffs and Smasher arrive.',
};

export const freePlayRoster = curatedOpponents.map(opponent => ({
  ...opponent,
  portrait: campaignRivals.get(opponent.id) ?? freePlayPortraits[opponent.id],
  summary: matchupNotes[opponent.id] ?? opponent.deck.notes,
  crewMatches: communityCrewMatches(opponent.deck.legends),
}));

export function rivalMatchesSearch(rival: { deck: Deck; label: string; category: string; portrait?: { alias: string } }, search: string) {
  const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
  const text = [rival.deck.name, rival.label, rival.category, rival.portrait?.alias,
    ...rival.deck.legends.map(slug => BY_SLUG.get(slug)?.display)].join(' ');
  return normalize(text).includes(normalize(search));
}

export function browseRivals(search: string, category: RivalCategory, sort: RivalSort) {
  const matched = freePlayRoster.filter(rival => rivalMatchesSearch(rival, search));
  const counts = { all: matched.length, meta: 0, budget: 0, brew: 0 };
  for (const rival of matched) counts[rival.kind]++;
  const rows = matched.filter(rival => category === 'all' || rival.kind === category).sort((a, b) => {
    const byName = a.deck.name.localeCompare(b.deck.name);
    if (sort === 'nameAsc') return byName;
    if (sort === 'nameDesc') return -byName;
    if (sort === 'popularity') return b.crewMatches - a.crewMatches || byName;
    return (campaignRivals.get(a.id)?.order ?? featuredEncounters.length) - (campaignRivals.get(b.id)?.order ?? featuredEncounters.length);
  });
  return { rows, counts };
}
