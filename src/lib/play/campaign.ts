import { BY_SLUG, CARDS, fitsRam, ramLimits } from '../data';
import { validate } from '../decks';
import { rating, synergy } from '../autobuild';
import { STARTERS, starterAsDeck, type StarterKey } from '../starters';
import { isEngineSupported } from './engineCards';
import type { Deck } from '../store';
import type { StoredMatch } from './workerController';
import type { RivalSkill } from './protocol';
import recommended from '../../data/decks.json';

export const CAMPAIGN_VERSION = 1;
export const ENVIRONMENTS = [
  { id: 'booth', name: 'Afterlife Private Booth', description: 'Plum leather under a private neon light.' },
  { id: 'rooftop', name: 'Rainline Rooftop', description: 'Night City beyond the rain.' },
  { id: 'arasaka', name: 'Arasaka Night Suite', description: 'A cold view from the top floor.' },
] as const;
export type Environment = typeof ENVIRONMENTS[number]['id'];
export const ENCOUNTERS: { id: string; title: string; brief: string; rival: string; skill: RivalSkill }[] = [
  { id: 'first-call', title: 'First Call', brief: 'Another new crew is looking for the same seat.', rival: 'other-starter', skill: 'standard' },
  { id: 'chrome-debt', title: 'Chrome Debt', brief: 'Watch the Gear before it turns small threats into big ones.', rival: 'chrome-syndicate', skill: 'standard' },
  { id: 'dead-drop', title: 'Dead Drop', brief: 'Efficient bodies and a clean curve. Bring your first upgrades.', rival: 'heist-reloaded', skill: 'standard' },
  { id: 'night-drive', title: 'Night Drive', brief: 'The Nomads flood the field. Pick your trades.', rival: 'nomad-convoy', skill: 'standard' },
  { id: 'dead-air', title: 'Dead Air', brief: 'The Netrunners control the pace. Keep your economy moving.', rival: 'lowball-netrun-plus', skill: 'sharp' },
  { id: 'red-line', title: 'Red Line', brief: 'A heavy finisher waits at the end of this fight.', rival: 'smasher-surge', skill: 'sharp' },
  { id: 'mosh-pit', title: 'Mosh Pit', brief: 'Expect quick pressure. Leave room for early answers.', rival: 'mosh-pit', skill: 'sharp' },
  { id: 'hostile-takeover', title: 'Hostile Takeover', brief: 'They have answers of their own. Make every card count.', rival: 'streetkid-braindance', skill: 'sharp' },
  { id: 'last-call', title: 'Last Call', brief: 'Arasaka has the best table in the house. Take it.', rival: 'arasaka-nines', skill: 'masterful' },
];

export type CampaignPhase = 'preparing' | 'inMatch' | 'rewardPending' | 'upgrading' | 'claimingFinish' | 'completed';
export interface CampaignReward { id: string; cards: string[]; offers: string[]; choice?: string; }
export interface CampaignRun {
  version: 1; id: string; starter: StarterKey; seed: string; revision: number; phase: CampaignPhase;
  encounter: number; attempts: number; inventory: Record<string, number>; deck: Deck; lastLegal: Deck;
  rewards: Record<number, CampaignReward>; opponents: Deck[]; match?: StoredMatch; completedAt?: number; revealed?: number;
}
export interface CampaignArchive { id: string; starter: StarterKey; cleared: number; completed: boolean; endedAt: number; deck: Deck; }
export interface CampaignProfile { version: 1; completions: Record<StarterKey, number>; environments: Environment[]; equipped?: Environment; history?: CampaignArchive[]; }
export const emptyProfile = (): CampaignProfile => ({ version: 1, completions: { 'the-heist': 0, 'embracing-power': 0 }, environments: [] });

export function makeStarterDeck(key: StarterKey): Deck {
  const starter = STARTERS.find(item => item.key === key);
  if (!starter) throw new Error('Choose an official starter deck.');
  const { legends, cards } = starterAsDeck(starter);
  return { id: `campaign:${key}`, name: starter.name, legends, cards, sideboard: {}, notes: '', updatedAt: '' };
}

export function newCampaign(starter: StarterKey, id: string, seed: string): CampaignRun {
  const deck = makeStarterDeck(starter);
  const run: CampaignRun = { version: 1, id, seed, starter, revision: 0, phase: 'preparing', encounter: 0, attempts: 0,
    inventory: { ...deck.cards, ...Object.fromEntries(deck.legends.map(slug => [slug, 1])) },
    deck, lastLegal: structuredClone(deck), rewards: {}, opponents: [] };
  run.opponents = ENCOUNTERS.map((_, encounter) => structuredClone(encounterDeck({ ...run, encounter })));
  return run;
}

export function campaignDeckIssues(run: CampaignRun, deck: Deck): string[] {
  const issues = [...validate(deck).issues];
  if (Object.keys(deck.sideboard).some(slug => deck.sideboard[slug] > 0)) issues.push('Campaign sideboards are not available.');
  const starter = STARTERS.find(item => item.key === run.starter)!;
  const colours = starter.colors;
  const initial = starter.legends.map(slug => BY_SLUG.get(slug)!.color);
  const chosen = deck.legends.map(slug => BY_SLUG.get(slug)?.color);
  if (colours.some(color => chosen.filter(item => item === color).length !== initial.filter(item => item === color).length)) issues.push('Keep the starter crew colour distribution.');
  const used: Record<string, number> = { ...deck.cards };
  for (const legend of deck.legends) used[legend] = (used[legend] ?? 0) + 1;
  for (const [slug, qty] of Object.entries(used)) {
    if (!colours.includes(BY_SLUG.get(slug)?.color ?? '')) issues.push(`${slug} is outside the starter colours.`);
    if (qty > (run.inventory[slug] ?? 0)) issues.push(`You have only ${run.inventory[slug] ?? 0} copies of ${BY_SLUG.get(slug)?.display ?? slug}.`);
    if (!isEngineSupported(slug)) issues.push(`${slug} is not supported in Play Mode.`);
  }
  return [...new Set(issues)];
}

export function encounterDeck(run: CampaignRun): Deck {
  if (run.opponents?.[run.encounter]) return structuredClone(run.opponents[run.encounter]);
  const info = ENCOUNTERS[run.encounter];
  if (!info) throw new Error('The campaign is complete.');
  if (info.rival === 'other-starter') return makeStarterDeck(run.starter === 'the-heist' ? 'embracing-power' : 'the-heist');
  const item = recommended.find(deck => deck.id === info.rival);
  if (!item) throw new Error('This opponent is not available.');
  return { id: `campaign-rival:${item.id}`, name: item.name, legends: [...item.legends], cards: Object.fromEntries(Object.entries(item.cards).filter((entry): entry is [string, number] => typeof entry[1] === 'number')), sideboard: {}, notes: item.summary, updatedAt: '' };
}

// Rewards have their own seed. A loss changes match shuffle, never the pack waiting behind it.
function hash(value: string) { let state = 2166136261; for (const letter of value) state = Math.imul(state ^ letter.charCodeAt(0), 16777619); return state >>> 0; }
function shuffled<T>(array: T[], seed: string): T[] {
  let state = hash(seed) || 1;
  const out = [...array];
  for (let i = out.length - 1; i > 0; i--) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    const j = (state >>> 0) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function generateReward(run: CampaignRun): CampaignReward {
  const seed = `${run.seed}:reward:${run.encounter}:v1`;
  const limits = ramLimits(run.deck.legends);
  const colours = STARTERS.find(item => item.key === run.starter)!.colors;
  const eligible = CARDS.filter(card => card.type !== 'Legend' && card.legal === 'legal' && isEngineSupported(card.slug)
    && colours.includes(card.color) && fitsRam(card, limits) && (run.inventory[card.slug] ?? 0) < 3);
  const ranked = shuffled(eligible, seed).sort((a, b) =>
    (rating(b.slug).power + synergy(b, run.deck.legends)) - (rating(a.slug).power + synergy(a, run.deck.legends)));
  // Two deliberate role/synergy picks and five varied draws, with no duplicate identities.
  const cards = [...ranked.slice(0, 2), ...shuffled(ranked.slice(2), `${seed}:cards`).slice(0, 5)].map(card => card.slug);
  const remaining = ranked.filter(card => !cards.includes(card.slug));
  const offerPool = shuffled(remaining.slice(0, 20), `${seed}:offers`);
  // Distinct card types give the player a meaningful direction when the pool supports it.
  const mainOffers: string[] = [];
  for (const type of shuffled(['Unit', 'Gear', 'Program'], `${seed}:roles`)) {
    const candidate = offerPool.find(card => card.type === type && !mainOffers.includes(card.slug));
    if (candidate) mainOffers.push(candidate.slug);
  }
  for (const card of offerPool) if (mainOffers.length < 3 && !mainOffers.includes(card.slug)) mainOffers.push(card.slug);
  let offers = mainOffers;
  if ([2, 5].includes(run.encounter)) {
    const names = new Set(run.deck.legends.map(slug => BY_SLUG.get(slug)?.name));
    const recruits = CARDS.filter(card => card.type === 'Legend' && card.legal === 'legal' && isEngineSupported(card.slug)
      && colours.includes(card.color) && !names.has(card.name) && !run.inventory[card.slug]
      && run.deck.legends.some(slug => BY_SLUG.get(slug)?.color === card.color && (BY_SLUG.get(slug)?.ram ?? 0) <= (card.ram ?? 0)));
    offers = [...shuffled(recruits, `${seed}:legends`).slice(0, 2).map(card => card.slug), remaining[0].slug];
  }
  if (cards.length !== 7 || offers.length !== 3 || new Set([...cards, ...offers]).size !== 10)
    throw new Error('This reward pool cannot make a valid pack. Your victory remains saved.');
  return { id: `${run.id}:${run.encounter}`, cards, offers };
}

export function grantVictory(run: CampaignRun, profile: CampaignProfile, match: StoredMatch, winner: string | null) {
  if (run.phase !== 'inMatch' || !match.summary.ended) return { run, profile };
  const next = { ...run, match, revision: run.revision + 1, attempts: run.attempts + 1, revealed: 0 };
  if (winner !== 'player') return { run: { ...next, phase: 'preparing' as const }, profile };
  if (run.encounter === ENCOUNTERS.length - 1) {
    return { run: { ...next, phase: 'claimingFinish' as const, completedAt: Date.now() },
      profile: { ...profile, completions: { ...profile.completions, [run.starter]: profile.completions[run.starter] + 1 } } };
  }
  const reward = run.rewards[run.encounter] ?? generateReward(run);
  const inventory = { ...run.inventory };
  for (const slug of reward.cards) inventory[slug] = (inventory[slug] ?? 0) + 1;
  return { run: { ...next, inventory, phase: 'rewardPending' as const,
    rewards: { ...run.rewards, [run.encounter]: reward } }, profile };
}
