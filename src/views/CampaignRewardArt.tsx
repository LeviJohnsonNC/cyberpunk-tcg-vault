import { BY_SLUG } from '../lib/data';
import { CardImg } from '../components/bits';
import { PrintingArt } from '../components/PrintingArt';
import type { CampaignPull } from '../lib/play/campaignPack';

export function CampaignRewardArt({ pull, alt, exact = false, showNameWhileLoading = false }: { pull: CampaignPull; alt: string; exact?: boolean; showNameWhileLoading?: boolean }) {
  const { slug, printing } = pull;
  const standardArt = <CardImg slug={slug} alt={alt} priority />;
  return <span className="campaign-reward-art" data-rarity={printing?.rarity}>
    {printing ? <PrintingArt slug={slug} printingId={printing.id} alt={alt} inline placeholder={showNameWhileLoading ? BY_SLUG.get(slug)?.display ?? slug : undefined} fallback={exact || printing.rarity.startsWith('Iconic ') ? undefined : standardArt} /> : standardArt}
  </span>;
}
