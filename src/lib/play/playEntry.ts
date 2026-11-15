import { lastPlayMode, playDestination } from '../playNavigation';
import { readCampaign } from './campaignStorage';
import { readCircuitProgress, readMatchSummary } from './matchStorage';

export async function readPlayEntry(scope: string) {
  const [{ run, profile }, circuit, saved] = await Promise.all([
    readCampaign(scope), readCircuitProgress(scope), readMatchSummary(scope),
  ]);
  const campaign = Boolean(run || profile.history?.length || profile.environments?.length
    || Object.values(profile.completions ?? {}).some(count => count > 0));
  const free = Boolean(saved || circuit.matches > 0 || circuit.rep > 0 || circuit.wins > 0
    || circuit.losses > 0 || circuit.draws > 0 || circuit.history?.length
    || Object.values(circuit.contracts ?? {}).some(marks => marks.length > 0));
  const mode = playDestination({ campaign, free, activeMatch: Boolean(saved && !saved.ended) }, lastPlayMode(scope));
  return { mode, saved };
}
