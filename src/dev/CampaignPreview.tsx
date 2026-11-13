/** Preview/development-only fixtures. Isolated scope; never reads a user's Vault or grants real rewards. */
import { PackMaterialPreview } from './PackMaterialPreview';
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { CampaignMatchResult } from '../views/CampaignMatchResult';
import { BY_SLUG } from '../lib/data';
import type { CardView, PlayerView } from '../lib/play/protocol';
import { CampaignMode } from '../views/CampaignMode';
import { ENCOUNTERS, emptyProfile, generateReward, newCampaign, type CampaignRun } from '../lib/play/campaign';
import { updateCampaign } from '../lib/play/campaignStorage';
import type { StarterKey } from '../lib/starters';
import '../styles.css';
import '../views/play-mode.css';

const scope = 'qa:campaign-presentation';
function fixture(starter: StarterKey, state: string, contract: number): CampaignRun {
  // This seed exercises a real Iconic Secret pull through the production reward generator.
  const run = newCampaign(starter, 'visual-qa', state === 'chase pack' ? 'retail-pack-qa-12' : 'presentation-fixture-2026');
  const openingPack = state === 'pack' || state === 'chase pack' || state === 'material common';
  const count = state === 'contract' ? contract : state === 'retry' ? 0 : state === 'finale' || state === 'complete' ? 8 : state === 'act3' ? 6 : state === 'act2' ? 3 : state === 'recruit' ? 2 : state === 'start' ? 0 : 1;
  for (let index = 0; index < count; index++) {
    run.encounter = index;
    const reward = generateReward(run);
    for (const slug of reward.cards) run.inventory[slug] = (run.inventory[slug] ?? 0) + 1;
    if (!(openingPack && index === count - 1)) { reward.choice = reward.offers[0]; run.inventory[reward.choice] = (run.inventory[reward.choice] ?? 0) + 1; }
    run.rewards[index] = reward;
  }
  run.encounter = count;
  run.phase = count ? 'upgrading' : 'preparing';
  if (state === 'retry') run.attempts = 1;
  if (openingPack) { run.encounter = 0; run.phase = 'rewardPending'; }
  if (state === 'material common') {
    const card = BY_SLUG.get('mox-inciters')!;
    const printing = card.printings.find(p => p.set === 'Welcome to Night City — Retail' && p.rarity === 'Common')!;
    run.rewards[0].cards[0] = card.slug;
    run.rewards[0].printingIds![0] = printing.id;
    run.packLayout = { order: [0, 1, 2, 3, 4, 5, 6], revealedSlots: [] };
  }
  if (state === 'recruit') { run.encounter = 2; const reward = generateReward(run); for (const slug of reward.cards) run.inventory[slug] = (run.inventory[slug] ?? 0) + 1; run.rewards[2] = reward; run.phase = 'rewardPending'; run.revealed = 7; }
  if (state === 'finale' || state === 'complete') { run.encounter = 8; run.phase = state === 'complete' ? 'completed' : 'claimingFinish'; run.completedAt = Date.now(); }
  return run;
}
function ReportPreview({ contract, outcome, openPack }: { contract: number; outcome: 'win' | 'loss'; openPack: () => void }) {
  const encounter = ENCOUNTERS[contract];
  const win = outcome === 'win';
  const seat = { firstPlayer: true, zones: {}, eddies: 0, availableEddies: 0, gigCount: win ? 10 : 2, streetCred: 0 };
  const view: PlayerView = { players: { player: seat, rival: { ...seat, firstPlayer: false, gigCount: win ? 2 : 10 } },
    gamePhase: 'main', turnNumber: 14, activePlayerId: 'player', overtimeActive: false, gameEnded: true,
    winnerId: win ? 'player' : 'rival', winReason: 'gig_victory', stateID: 50, prompt: { status: 'waiting', availableMoves: [], choice: null } };
  const stuck = ['delamain-cab', 'floor-it'].flatMap((slug, index) => {
    const entry = BY_SLUG.get(slug);
    if (!entry) return [];
    const card: CardView = { instanceId: slug, definitionId: entry.id, cardName: entry.display, faceDown: false,
      spent: false, power: entry.power ?? 0, effectivePower: entry.power ?? 0, cost: entry.cost };
    return [{ card, copies: 1, turns: 9 - index * 3 }];
  });
  return <div className="play-mode campaign-mode"><CampaignMatchResult
    details={{ encounter: encounter.id, title: encounter.title, dialogue: true, continueLabel: 'Continue story', next: 'Next: The aftermath and your reward pack.' }}
    snapshot={{ view, matchId: 'preview', names: { player: 'You', rival: 'Rival' }, gigRolls: [], knownLegends: [], log: [], peeks: [],
      report: { turns: 14, played: 10, sold: 4, lost: { player: 0, rival: 3 }, stuck,
        gigs: Array.from({ length: 14 }, (_, i) => {
          const lead = i === 13 ? 10 : Math.floor(i / 2);
          const trail = i === 13 ? 2 : Math.floor((i + 2) / 4);
          return { turn: i + 1, player: win ? lead : trail, rival: win ? trail : lead };
        }) } }}
    busy={false} onContinue={openPack} /></div>;
}

export function Preview() {
  const [key, setKey] = useState(0);
  const [starter, setStarter] = useState<StarterKey>('the-heist');
  const [error, setError] = useState('');
  const [contract, setContract] = useState(0);
  const [showReport, setShowReport] = useState<'win' | 'loss'>();
  async function load(state: string) {
    try {
      const profile = { ...emptyProfile(), environments: ['booth', 'rooftop', 'arasaka'] as const, equipped: 'booth' as const };
      await updateCampaign(scope, () => ({ run: fixture(starter, state, contract), profile: { ...profile, environments: state === 'finale' ? [] : [...profile.environments] }, value: undefined }));
      setKey(value => value + 1); setError(''); setShowReport(undefined);
    } catch (cause) { setError(String(cause)); }
  }
  return <><nav style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 8, background: 'var(--color-canvas-deep)', position: 'relative', zIndex: 2 }} aria-label="QA fixtures"><strong>Visual QA · Fixture data</strong><button className="btn quiet" onClick={() => setStarter(starter === 'the-heist' ? 'embracing-power' : 'the-heist')}>{starter}</button>{['start', 'retry', 'pack', 'chase pack', 'material common', 'recruit', 'workshop', 'act2', 'act3', 'finale', 'complete'].map(state => <button className="btn quiet" key={state} onClick={() => void load(state)}>{state}</button>)}<label>Contract <select value={contract} onChange={event => setContract(Number(event.target.value))}>
    {ENCOUNTERS.map((encounter, index) => <option key={encounter.id} value={index}>{index + 1}. {encounter.title}</option>)}
  </select></label><button className="btn quiet" onClick={() => void load('contract')}>Load contract</button><button className="btn quiet" onClick={() => setShowReport('win')}>Win report</button><button className="btn quiet" onClick={() => setShowReport('loss')}>Loss report</button><span role="status">{error}</span></nav>{showReport ? <ReportPreview key={`${contract}:${showReport}`} contract={contract} outcome={showReport} openPack={() => void load('chase pack')} /> : <CampaignMode key={key} scope={scope} exit={() => setError('Free Play navigation requested.')} openInBuilder={() => setError('Deck Builder handoff requested.')} />}</>;
}
if (import.meta.env.DEV || import.meta.env.VAULT_PLAY_PREVIEW) {
  const params = new URLSearchParams(location.search);
  const opener = params.has('opener');
  createRoot(document.getElementById('root')!).render(params.has('materials') ? <PackMaterialPreview /> : opener
    ? <CampaignMode scope="qa:campaign-opener" exit={() => location.assign('./campaign-preview.html')} openInBuilder={() => {}} />
    : <Preview />);
}
