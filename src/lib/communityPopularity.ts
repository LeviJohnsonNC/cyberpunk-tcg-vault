import communityMeta from '../data/community-meta.json';

const crewCounts: Readonly<Record<string, number>> = communityMeta.crews;

export function communityCrewMatches(legends: readonly string[]) {
  return crewCounts[[...legends].sort().join('/')] ?? 0;
}

const count = new Intl.NumberFormat('en-CA').format(communityMeta.deckCount);
const asOf = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(communityMeta.asOf));

export const communityPopularityLabel = `Ranked by how often all three Legends appear together in ${count} public Constructed decks from the 30 days ending ${asOf}.`;
