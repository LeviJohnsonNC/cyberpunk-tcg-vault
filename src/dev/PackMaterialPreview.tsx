/** Preview-only test bench: production components and isolated, deterministic rewards. */
import { useEffect, useState } from 'react';
import { CARDS } from '../lib/data';
import { newCampaign, emptyProfile } from '../lib/play/campaign';
import { updateCampaign } from '../lib/play/campaignStorage';
import { PACK_RARITIES } from '../lib/play/packMaterial';
import { type CampaignPull } from '../lib/play/campaignPack';
import { CampaignMode } from '../views/CampaignMode';
import { CampaignFeaturedCard } from '../views/CampaignFeaturedCard';
import './pack-material-preview.css';
import { installMaterialMotionFixture, setMaterialReducedMotion } from './materialMotionFixture';

export const materialRarities = PACK_RARITIES;
const representatives: Record<string, string> = { Common: 'mox-inciters', Uncommon: 't-bug-amateur-philosopher', Rare: 'v-corporate-exile' };
export const materialPulls: CampaignPull[] = materialRarities.map(rarity => {
  const candidates = CARDS.flatMap(card => card.printings.filter(p => p.set === 'Welcome to Night City — Retail' && p.rarity === rarity).map(printing => ({ slug: card.slug, printing })));
  return candidates.find(p => p.slug === representatives[rarity]) ?? candidates[0];
});
const scope = 'qa:pack-materials';

export function PackMaterialPreview() {
  useEffect(installMaterialMotionFixture, []);
  const [reduced, setReduced] = useState(false);
  const [mode, setMode] = useState<'compare' | 'pack'>('compare');
  const [labels, setLabels] = useState(true);
  const [columns, setColumns] = useState(4);
  const [key, setKey] = useState(0);
  const [error, setError] = useState('');
  const [inspect, setInspect] = useState<CampaignPull>();
  const [act, setAct] = useState(1);
  async function load(kind: 'seven' | 'iconic' | 'retry') {
    const run = newCampaign('the-heist', `materials-${kind}`, 'material-verification');
    run.encounter = (act - 1) * 3;
    const pulls = kind === 'retry' ? materialPulls.slice(0, 5) : kind === 'iconic' ? [materialPulls[7], ...materialPulls.slice(0, 6)] : materialPulls.slice(0, 7);
    const reward = { id: `materials-${kind}`, cards: pulls.map(p => p.slug), printingIds: pulls.map(p => p.printing!.id), offers: kind === 'retry' ? [] : ['floor-it', 'kiroshi-optics', 'delamain-cab'] };
    run.phase = kind === 'retry' ? 'retryReward' : 'rewardPending';
    if (kind === 'retry') { run.latestRetry = reward; run.aftermath = { outcome: 'loss', beat: 1, sceneSeen: true }; }
    else run.rewards[run.encounter] = reward;
    for (const slug of reward.cards) run.inventory[slug] = (run.inventory[slug] ?? 0) + 1;
    run.packLayout = { order: pulls.map((_, i) => i), revealedSlots: [] };
    try {
      await updateCampaign(scope, () => ({ run, profile: emptyProfile(), value: undefined }));
      setMode('pack'); setKey(k => k + 1); setError('');
    } catch (cause) { setError(String(cause)); }
  }
  return <div className="pack-material-preview" data-reduced={reduced || undefined}>
    <nav aria-label="Material verification" className="material-preview-tools">
      <strong>Rarity studio · Test rewards only</strong>
      <button className="btn quiet" onClick={() => setMode('compare')}>Compare eight</button>
      <button className="btn quiet" onClick={() => void load('seven')}>Reveal seven</button>
      <button className="btn quiet" onClick={() => void load('iconic')}>Reveal Iconic Secret</button>
      <button className="btn quiet" onClick={() => void load('retry')}>Five-card retry</button>
      <button className="btn quiet" onClick={() => setMode('pack')}>Resume saved pack</button>
      <label>Room <select value={act} onChange={e => setAct(Number(e.target.value))}><option value="1">Afterlife</option><option value="2">Rooftop</option><option value="3">Arasaka</option></select></label>
      {mode === 'compare' && <><button className="btn quiet" onClick={() => setLabels(v => !v)}>{labels ? 'Hide labels' : 'Show labels'}</button>
        <button className="btn quiet" onClick={() => setColumns(v => v === 4 ? 8 : 4)}>{columns === 4 ? 'Eight across' : 'Four across'}</button></>}
      <label><input type="checkbox" checked={reduced} onChange={e => { setReduced(e.target.checked); setMaterialReducedMotion(e.target.checked); }} /> Reduced motion</label>
      <span role="status">{error}</span>
    </nav>
    {mode === 'compare' ? <main className="campaign-mode campaign-tabletop material-comparison" data-act={act} data-columns={columns} data-labels={labels}>
      <h1>Eight printings. Eight materials.</h1>
      <p>Same camera, scale and lighting. Select a card to inspect its authentic printing. Use the reveal fixtures to compare the actual animations.</p>
      <div className="material-comparison-grid">{materialPulls.map((pull, i) => <article key={pull.printing!.id}>
        <CampaignFeaturedCard pull={pull} inspect={() => setInspect(pull)} />
        <strong className="material-comparison-label">{materialRarities[i]}</strong>
      </article>)}</div>
      {inspect && <div role="dialog" aria-modal="true" aria-label="Printing inspection" className="material-preview-inspect">
        <button className="btn" onClick={() => setInspect(undefined)}>Close inspection</button>
        <CampaignFeaturedCard pull={inspect} inspect={() => setInspect(undefined)} />
      </div>}
    </main> : <CampaignMode key={key} scope={scope} exit={() => setMode('compare')} openInBuilder={() => {}} />}
  </div>;
}
