import { BY_SLUG, CARDS, fitsRam, ramLimits, type Card } from '../data';
import { validate } from '../decks';
import { rating, synergy } from '../autobuild';
import { STARTERS, starterAsDeck, type StarterKey } from '../starters';
import { isEngineSupported } from './engineCards';
import { rollCampaignPack, rollRetryPack } from './campaignPack';
import type { Deck } from '../store';
import type { StoredMatch } from './workerController';
import type { RivalSkill } from './protocol';
import recommended from '../../data/decks.json';
import { ARASAKA_HOUSE_LIST, HEIST_OPENING_RIVAL, REWARD_THEMES, RIVAL_TUNING } from './campaignBalance';

export const CAMPAIGN_VERSION = 1;
export const ENVIRONMENTS = [
  { id: 'booth', name: 'Afterlife Private Booth', description: 'Plum leather under a private neon light.' },
  { id: 'rooftop', name: 'Rainline Rooftop', description: 'Night City beyond the rain.' },
  { id: 'arasaka', name: 'Arasaka Night Suite', description: 'A cold view from the top floor.' },
] as const;
export type Environment = typeof ENVIRONMENTS[number]['id'];
export const ENCOUNTERS = [
  { id: 'first-call', title: 'First Call', brief: 'Another new crew is looking for the same seat.', rival: 'other-starter', skill: 'standard' },
  { id: 'chrome-debt', title: 'Chrome Debt', brief: 'Watch the Gear before it turns small threats into big ones.', rival: 'chrome-syndicate', skill: 'standard' },
  { id: 'dead-drop', title: 'Dead Drop', brief: 'Efficient bodies and a clean curve. Bring your first upgrades.', rival: 'heist-reloaded', skill: 'standard' },
  { id: 'night-drive', title: 'Night Drive', brief: 'The Nomads flood the field. Pick your trades.', rival: 'nomad-convoy', skill: 'standard' },
  { id: 'dead-air', title: 'Dead Air', brief: 'The Netrunners control the pace. Keep your economy moving.', rival: 'lowball-netrun-plus', skill: 'sharp' },
  { id: 'red-line', title: 'Red Line', brief: 'A heavy finisher waits at the end of this fight.', rival: 'smasher-surge', skill: 'sharp' },
  { id: 'mosh-pit', title: 'Mosh Pit', brief: 'Expect quick pressure. Leave room for early answers.', rival: 'mosh-pit', skill: 'sharp' },
  { id: 'hostile-takeover', title: 'Hostile Takeover', brief: 'They have answers of their own. Make every card count.', rival: 'streetkid-braindance', skill: 'sharp' },
  { id: 'last-call', title: 'Last Call', brief: 'Arasaka has the best table in the house. Take it.', rival: 'arasaka-nines', skill: 'masterful' },
] as const satisfies readonly { id: string; title: string; brief: string; rival: string; skill: RivalSkill }[];

export type EncounterId = typeof ENCOUNTERS[number]['id'];

export type CampaignPhase = 'preparing' | 'inMatch' | 'rewardPending' | 'retryReward' | 'upgrading' | 'claimingFinish' | 'completed';
export interface CampaignReward {
  id: string; cards: string[]; offers: string[]; choice?: string;
  /** Exact collectible printing per card slot. Older rewards have only gameplay slugs. */
  printingIds?: string[];
}
export type CampaignOutcome = 'win' | 'loss' | 'draw';
export interface CampaignAftermath {
  outcome: CampaignOutcome;
  beat: number;
  sceneSeen?: boolean;
}

export interface CampaignRun {
  version: 1; id: string; starter: StarterKey; seed: string; revision: number; phase: CampaignPhase;
  encounter: number; attempts: number; inventory: Record<string, number>; deck: Deck; lastLegal: Deck;
  /** Absent on runs started before the balance pass. */
  balanceVersion?: 2;
  /** Presentation-only acknowledgement. Older runs can show their current act once. */
  briefedAct?: number;
  aftermath?: CampaignAftermath;
  latestRetry?: CampaignReward;
  retryPacks?: number;
  defeats?: number;
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
  const run: CampaignRun = { version: 1, id, seed, starter, revision: 0, phase: 'preparing', encounter: 0, attempts: 0, balanceVersion: 2,
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
  if (info.rival === 'other-starter') {
    const rival = makeStarterDeck(run.starter === 'the-heist' ? 'embracing-power' : 'the-heist');
    if (run.balanceVersion === 2 && run.starter === 'the-heist') {
      rival.name = 'Embracing Power · Practice List';
      applyCopyDeltas(rival.cards, HEIST_OPENING_RIVAL.cards);
    }
    return rival;
  }
  if (run.balanceVersion === 2 && info.id === 'last-call') {
    return { id: 'campaign-rival:arasaka-nines', name: 'Arasaka 9s · House List',
      legends: [...ARASAKA_HOUSE_LIST.legends], cards: { ...ARASAKA_HOUSE_LIST.cards },
      sideboard: {}, notes: 'Hold the board with blockers and Arasaka Units, then close with Goro or Smasher.', updatedAt: '' };
  }
  const item = recommended.find(deck => deck.id === info.rival);
  if (!item) throw new Error('This opponent is not available.');
  const cards = Object.fromEntries(Object.entries(item.cards).filter((entry): entry is [string, number] => typeof entry[1] === 'number'));
  if (run.encounter === 8) {
    // The public Arasaka 9s concept is top-heavy. This fixed campaign variant keeps
    // its signature 9-power finishers while giving the boss early plays and sellables.
    Object.assign(cards, { minotaur: 2, 'yorinobu-arasaka-steel-dragon': 2, 'sandayu-oda-hanako-s-guardian': 1,
      'emergency-atlus': 1, 'field-operator': 2, 'valentino-street-racer': 1, 'meredith-stout-stone-cold-corpo': 2,
      'all-is-lost': 3, detonate: 2, 'take-control': 2, 'peace-offering': 1 });
  }
  if (run.balanceVersion === 2) applyCopyDeltas(cards, RIVAL_TUNING[info.id]?.cards);
  return { id: `campaign-rival:${item.id}`, name: run.encounter === 8 ? 'Arasaka 9s · House List' : item.name, legends: [...item.legends], cards, sideboard: {}, notes: item.summary, updatedAt: '' };
}

function applyCopyDeltas(cards: Record<string, number>, deltas?: Readonly<Record<string, number>>) {
  for (const [slug, delta] of Object.entries(deltas ?? {})) {
    const count = (cards[slug] ?? 0) + delta;
    if (count === 0) delete cards[slug];
    else cards[slug] = count;
  }
}

export function encounterSkill(run: CampaignRun): RivalSkill {
  const info = ENCOUNTERS[run.encounter];
  return (run.balanceVersion === 2 ? RIVAL_TUNING[info.id]?.skill : undefined) ?? info.skill;
}

// Rewards have their own seed. A loss changes match shuffle, never the pack waiting behind it.
function hash(value: string) { let state = 2166136261; for (const letter of value) state = Math.imul(state ^ letter.charCodeAt(0), 16777619); return state >>> 0; }
function rewardRandom(seed: string) {
  let state = hash(seed) || 1;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function shuffled<T>(array: T[], seed: string): T[] {
  const random = rewardRandom(seed);
  const out = [...array];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function compatibleRewards(run: CampaignRun, colours: readonly string[]) {
  const limits = ramLimits(run.deck.legends);
  return CARDS.filter(card => card.type !== 'Legend' && card.legal === 'legal' && isEngineSupported(card.slug)
    && colours.includes(card.color) && fitsRam(card, limits));
}

export function generateReward(run: CampaignRun): CampaignReward {
  const seed = `${run.seed}:reward:${run.encounter}:v${run.balanceVersion ?? 1}`;
  const colours = STARTERS.find(item => item.key === run.starter)!.colors;
  const compatible = compatibleRewards(run, colours);
  const eligible = compatible.filter(card => (run.inventory[card.slug] ?? 0) < 3);
  const recruits = recruitCandidates(run, colours);
  const offers = run.encounter === ENCOUNTERS.length - 1 ? [] : rewardOffers(run, eligible, compatible, recruits, seed);
  const pulls = rollCampaignPack(rewardRandom(`${seed}:retail`), new Set(eligible.map(card => card.slug)), offers);
  return { id: `${run.id}:${run.encounter}`, cards: pulls.map(pull => pull.slug),
    printingIds: pulls.map(pull => pull.printing.id), offers };
}

const isRecruitment = (run: CampaignRun) => run.encounter === 2 || run.encounter === 5;

function recruitCandidates(run: CampaignRun, colours: readonly string[]) {
  if (!isRecruitment(run)) return [];
  const names = new Set(run.deck.legends.map(slug => BY_SLUG.get(slug)?.name));
  return CARDS.filter(card => card.type === 'Legend' && card.legal === 'legal' && isEngineSupported(card.slug)
    && colours.includes(card.color) && !names.has(card.name) && !run.inventory[card.slug]
    && run.deck.legends.some(slug => BY_SLUG.get(slug)?.color === card.color && (BY_SLUG.get(slug)?.ram ?? 0) <= (card.ram ?? 0)));
}

function rewardOffers(run: CampaignRun, eligible: Card[], compatible: Card[], recruits: Card[], seed: string) {
  const themes = REWARD_THEMES[run.starter];
  const selected = new Set<string>();
  const slugOrder = (a: Card, b: Card) => a.slug.localeCompare(b.slug, 'en');
  const sorted = [...compatible].sort(slugOrder);
  const canUseCopy = new Set(eligible.map(card => card.slug));
  const early = run.encounter < 3;
  const late = run.encounter >= 6;
  const economy = (card: Card) => (card.cost ?? 9) <= 3 && (card.sellable || card.type === 'Unit');
  const answer = (card: Card) => rating(card.slug).roles.some(role => role === 'removal' || role === 'blocker' || role === 'draw');
  const score = (card: Card) => rating(card.slug).power + synergy(card, run.deck.legends) * .5
    + (early ? economy(card) ? 2 : (card.cost ?? 0) >= 6 ? -2 : 0 : 0)
    + (late && answer(card) ? 1 : 0)
    + ((run.deck.cards[card.slug] ?? 0) > 0 ? .5 : 0);

  const scores = new Map(sorted.map(card => [card.slug, score(card)]));

  // Each themed slot first tries its authored pool, then broadens to a compatible role.
  function pick(label: string, preference: (card: Card) => boolean, fallback: (card: Card) => boolean) {
    const remaining = sorted.filter(card => !selected.has(card.slug));
    const eligible = remaining.filter(card => canUseCopy.has(card.slug));
    const available = shuffled(eligible.length ? eligible : remaining, `${seed}:${label}:rank`)
      .sort((a, b) => scores.get(b.slug)! - scores.get(a.slug)!);
    const pool = [available.filter(preference), available.filter(fallback), available].find(cards => cards.length > 0) ?? [];
    const card = shuffled(pool.slice(0, 4), `${seed}:${label}:pick`)[0];
    if (!card) throw new Error('There are too few eligible campaign rewards. Your campaign progress is still saved.');
    selected.add(card.slug);
    return card.slug;
  }

  const offers: string[] = [];
  if (isRecruitment(run)) {
    const ordered = shuffled([...recruits].sort(slugOrder), `${seed}:recruit`);
    const first = ordered[0];
    if (first) offers.push(first.slug);
    const second = ordered.find(card => card.color !== first?.color) ?? ordered[1];
    if (second) offers.push(second.slug);
  } else {
    for (const [index, theme] of themes.entries()) {
      offers.push(pick(`offer-theme-${index}`, card => theme.has(card.slug), early ? economy : answer));
    }
  }
  while (offers.length < 3) offers.push(pick(`offer-flex-${offers.length}`, early ? economy : answer, economy));

  return offers;
}

export function pendingCampaignPack(run: CampaignRun) {
  if (run.phase === 'rewardPending') return run.rewards[run.encounter];
  if (run.phase === 'retryReward') return run.latestRetry;
}

export function campaignClearedCount(run: CampaignRun) {
  if (run.phase === 'claimingFinish' || run.phase === 'completed') return ENCOUNTERS.length;
  return run.encounter + Number(run.phase === 'rewardPending');
}

export function settleCampaignMatch(run: CampaignRun, profile: CampaignProfile, match: StoredMatch, winner: string | null, conceded = false) {
  if (run.phase !== 'inMatch' || !match.summary.ended || run.match?.summary.matchId !== match.summary.matchId) return { run, profile };
  const next = { ...run, match, revision: run.revision + 1, attempts: run.attempts + 1, revealed: 0 };
  if (conceded) return { run: { ...next, phase: 'preparing' as const }, profile };

  const outcome = winner === 'player' ? 'win' : winner === null ? 'draw' : 'loss';
  const aftermath = { outcome, beat: 0 } satisfies CampaignAftermath;
  const inventory = { ...run.inventory };
  function addPack(cards: readonly string[]) {
    for (const slug of cards) inventory[slug] = (inventory[slug] ?? 0) + 1;
  }

  if (outcome !== 'win') {
    const colours = STARTERS.find(item => item.key === run.starter)!.colors;
    const eligible = compatibleRewards(run, colours);
    // Keep every pre-sealed victory offer claimable even after many retries.
    const reserved = new Set(run.rewards[run.encounter]?.offers);
    const compatible = new Set(eligible.filter(card => !reserved.has(card.slug)).map(card => card.slug));
    const pulls = rollRetryPack(rewardRandom(`${run.seed}:retry:${run.encounter}:${next.attempts}`), compatible, inventory);
    const reward = { id: `${run.id}:retry:${match.summary.matchId}`, cards: pulls.map(pull => pull.slug),
      printingIds: pulls.map(pull => pull.printing.id), offers: [] };
    addPack(reward.cards);
    return { run: { ...next, inventory, aftermath, phase: 'retryReward' as const, latestRetry: reward,
      retryPacks: (run.retryPacks ?? 0) + 1, defeats: (run.defeats ?? 0) + Number(outcome === 'loss') }, profile };
  }

  const reward = run.rewards[run.encounter] ?? generateReward(run);
  addPack(reward.cards);
  const won = { ...next, inventory, aftermath, phase: 'rewardPending' as const, latestRetry: undefined,
    rewards: { ...run.rewards, [run.encounter]: reward } };
  if (run.encounter === ENCOUNTERS.length - 1) {
    return { run: { ...won, completedAt: Date.now() },
      profile: { ...profile, completions: { ...profile.completions, [run.starter]: profile.completions[run.starter] + 1 } } };
  }
  return { run: won, profile };
}
