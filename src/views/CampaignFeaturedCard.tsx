import { type Ref, useState } from 'react';
import { CampaignRewardArt } from './CampaignRewardArt';
import { type CampaignPull } from '../lib/play/campaignPack';
import { packMaterial, packMaterialStyle } from '../lib/play/packMaterial';
import { BY_SLUG } from '../lib/data';
import './campaign-card-material.css';

/** Shared with the preview comparison: the real stage, never a screenshot approximation. */
export function CampaignFeaturedCard({ pull, buttonRef, discovery = false, inspect }: {
  pull: CampaignPull; buttonRef?: Ref<HTMLButtonElement>; discovery?: boolean; inspect: () => void;
}) {
  const [ready, setReady] = useState<{ id?: string; src: string }>();
  const src = ready?.id === pull.printing?.id ? ready?.src : undefined;
  return <div className="campaign-tabletop-spotlight campaign-material-stage" data-rarity={pull.printing?.rarity}
    data-material={packMaterial(pull.printing?.rarity).name} style={packMaterialStyle(pull.printing?.rarity)}
    data-art-ready={!!src || undefined} data-discovery={discovery || undefined}>
    <span className="campaign-material-halo" aria-hidden="true" />
    <span className="campaign-material-shadow" aria-hidden="true" />
    <span className="campaign-material-spill" aria-hidden="true" />
    {src && <span className="campaign-material-reflection" aria-hidden="true"><img src={src} alt="" /></span>}
    <button ref={buttonRef} type="button" className="campaign-tabletop-feature" onClick={inspect}
      aria-label={`Inspect ${BY_SLUG.get(pull.slug)?.display ?? pull.slug}`}>
      <span className="campaign-tabletop-pose">
        <CampaignRewardArt pull={pull} alt="" exact showNameWhileLoading onReady={src => setReady({ id: pull.printing?.id, src })} />
        <span className="campaign-material-bloom" aria-hidden="true" />
        <span className="campaign-material-edge" aria-hidden="true" />
        <span className="campaign-material-sheen" aria-hidden="true" />
        <span className="campaign-material-glints" aria-hidden="true" />
      </span>
    </button>
  </div>;
}
