import { type Ref, useState } from 'react';
import { CampaignRewardArt } from './CampaignRewardArt';
import { type CampaignPull } from '../lib/play/campaignPack';
import { packMaterial, packMaterialStyle } from '../lib/play/packMaterial';
import { BY_SLUG } from '../lib/data';
import { printingFoilFinish } from '../lib/printingFoil';
import './campaign-card-material.css';

export function CampaignFeaturedCard({ pull, buttonRef, discovery = false, inspect }: {
  pull: CampaignPull; buttonRef?: Ref<HTMLButtonElement>; discovery?: boolean; inspect: () => void;
}) {
  return <CampaignMaterialCard pull={pull} buttonRef={buttonRef} discovery={discovery} onPress={inspect} />;
}

export function CampaignMaterialCard({ pull, buttonRef, discovery = false, onPress, offer }: {
  pull: CampaignPull; buttonRef?: Ref<HTMLButtonElement>; discovery?: boolean; onPress: () => void;
  offer?: { selected: boolean; disabled: boolean; detailId?: string };
}) {
  const [ready, setReady] = useState<{ id?: string; src: string }>();
  const src = ready?.id === pull.printing?.id ? ready?.src : undefined;
  const name = BY_SLUG.get(pull.slug)?.display ?? pull.slug;
  const foil = offer && pull.printing && printingFoilFinish(pull.printing.id);
  return <div className={`${offer ? 'campaign-bonus-material' : 'campaign-tabletop-spotlight'} campaign-material-stage`}
    data-bonus-offer={!!offer || undefined} data-selected={offer?.selected || undefined} data-finish={foil || undefined}
    data-rarity={pull.printing?.rarity}
    data-material={packMaterial(pull.printing?.rarity).name} style={packMaterialStyle(pull.printing?.rarity)}
    data-art-ready={!!src || undefined} data-discovery={(offer ? offer.selected : discovery) || undefined}>
    <span className="campaign-material-halo" aria-hidden="true" />
    <span className="campaign-material-shadow" aria-hidden="true" />
    <span className="campaign-material-spill" aria-hidden="true" />
    {src && (!offer || offer.selected) && <span className="campaign-material-reflection" aria-hidden="true"><img src={src} alt="" decoding="async" referrerPolicy="no-referrer" /></span>}
    <button ref={buttonRef} type="button" className={offer ? 'campaign-bonus-pick' : 'campaign-tabletop-feature'} onClick={onPress}
      aria-pressed={offer?.selected} aria-describedby={offer?.detailId} disabled={offer?.disabled}
      aria-label={offer ? `Select ${name}` : `Inspect ${name}`}>
      <span className="campaign-tabletop-pose">
        <CampaignRewardArt foil={foil ? 'standard' : 'off'} pull={pull} alt="" exact showNameWhileLoading
          onReady={src => setReady({ id: pull.printing?.id, src })} />
        <span className="campaign-material-bloom" aria-hidden="true" />
        <span className="campaign-material-edge" aria-hidden="true" />
        <span className="campaign-material-sheen" aria-hidden="true" />
        <span className="campaign-material-glints" aria-hidden="true" />
        {offer?.selected && <span className="campaign-bonus-check" aria-hidden="true">✓</span>}
      </span>
    </button>
  </div>;
}
