import { BY_SLUG } from '../lib/data';
import { CardImg } from '../components/bits';
import { isIconicPrinting, type FoilMode } from '../lib/iconicFoil';
import { PrintingArt } from '../components/PrintingArt';
import type { CampaignPull } from '../lib/play/campaignPack';

export function CampaignRewardArt({ pull, alt, exact = false, showNameWhileLoading = false, foil = 'compact', onReady }: { pull: CampaignPull; alt: string; exact?: boolean; showNameWhileLoading?: boolean; foil?: FoilMode; onReady?: (src: string) => void }) {
  const { slug, printing } = pull;
  const surface = !!printing && isIconicPrinting(printing.id) && foil !== 'off';
  const standardArt = <CardImg slug={slug} alt={alt} priority />;
  return <span className="campaign-reward-art" data-rarity={printing?.rarity} data-iconic-surface={surface || undefined}>
    {printing ? <PrintingArt foil={foil} slug={slug} printingId={printing.id} alt={alt} onReady={onReady} inline placeholder={showNameWhileLoading ? BY_SLUG.get(slug)?.display ?? slug : undefined} fallback={exact || printing.rarity.startsWith('Iconic ') ? undefined : standardArt} /> : standardArt}
  </span>;
}
