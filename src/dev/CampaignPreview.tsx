/** Preview/development-only fixtures. Isolated scope; never reads a user's Vault or grants real rewards. */
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { CampaignMode } from '../views/CampaignMode';
import { ENCOUNTERS, emptyProfile, generateReward, newCampaign, type CampaignRun } from '../lib/play/campaign';
import { updateCampaign } from '../lib/play/campaignStorage';
import type { StarterKey } from '../lib/starters';
import '../styles.css';
import '../views/play-mode.css';

const scope = 'qa:campaign-presentation';
function fixture(starter: StarterKey, state: string, contract: number): CampaignRun {
  const run = newCampaign(starter, 'visual-qa', 'presentation-fixture-2026');
  const count = state === 'contract' ? contract : state === 'retry' ? 0 : state === 'finale' || state === 'complete' ? 8 : state === 'act3' ? 6 : state === 'act2' ? 3 : state === 'recruit' ? 2 : state === 'start' ? 0 : 1;
  for (let index = 0; index < count; index++) {
    run.encounter = index;
    const reward = generateReward(run);
    for (const slug of reward.cards) run.inventory[slug] = (run.inventory[slug] ?? 0) + 1;
    if (!(state === 'pack' && index === count - 1)) { reward.choice = reward.offers[0]; run.inventory[reward.choice] = (run.inventory[reward.choice] ?? 0) + 1; }
    run.rewards[index] = reward;
  }
  run.encounter = count;
  run.phase = count ? 'upgrading' : 'preparing';
  if (state === 'retry') run.attempts = 1;
  if (state === 'pack') { run.encounter = 0; run.phase = 'rewardPending'; }
  if (state === 'recruit') { run.encounter = 2; const reward = generateReward(run); for (const slug of reward.cards) run.inventory[slug] = (run.inventory[slug] ?? 0) + 1; run.rewards[2] = reward; run.phase = 'rewardPending'; run.revealed = 7; }
  if (state === 'finale' || state === 'complete') { run.encounter = 8; run.phase = state === 'complete' ? 'completed' : 'claimingFinish'; run.completedAt = Date.now(); }
  return run;
}
export function Preview() {
  const [key, setKey] = useState(0);
  const [starter, setStarter] = useState<StarterKey>('the-heist');
  const [error, setError] = useState('');
  const [contract, setContract] = useState(0);
  async function load(state: string) {
    try {
      const profile = { ...emptyProfile(), environments: ['booth', 'rooftop', 'arasaka'] as const, equipped: 'booth' as const };
      await updateCampaign(scope, () => ({ run: fixture(starter, state, contract), profile: { ...profile, environments: state === 'finale' ? [] : [...profile.environments] }, value: undefined }));
      setKey(value => value + 1); setError('');
    } catch (cause) { setError(String(cause)); }
  }
  return <><nav style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 8, background: 'var(--color-canvas-deep)', position: 'relative', zIndex: 2 }} aria-label="QA fixtures"><strong>Visual QA · Fixture data</strong><button className="btn quiet" onClick={() => setStarter(starter === 'the-heist' ? 'embracing-power' : 'the-heist')}>{starter}</button>{['start', 'retry', 'pack', 'recruit', 'workshop', 'act2', 'act3', 'finale', 'complete'].map(state => <button className="btn quiet" key={state} onClick={() => void load(state)}>{state}</button>)}<label>Contract <select value={contract} onChange={event => setContract(Number(event.target.value))}>
    {ENCOUNTERS.map((encounter, index) => <option key={encounter.id} value={index}>{index + 1}. {encounter.title}</option>)}
  </select></label><button className="btn quiet" onClick={() => void load('contract')}>Load contract</button><span role="status">{error}</span></nav><CampaignMode key={key} scope={scope} exit={() => setError('Free Play navigation requested.')} openInBuilder={() => setError('Deck Builder handoff requested.')} /></>;
}
if (import.meta.env.DEV || import.meta.env.VAULT_PLAY_PREVIEW) createRoot(document.getElementById('root')!).render(<Preview />);
