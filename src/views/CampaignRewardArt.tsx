import { CardImg } from '../components/bits';
import { PrintingArt } from '../components/PrintingArt';
import type { CampaignPull } from '../lib/play/campaignPack';

export function CampaignRewardArt({ pull, alt }: { pull: CampaignPull; alt: string }) {
  const { slug, printing } = pull;
  const standardArt = <CardImg slug={slug} alt={alt} priority />;
  return <span className="campaign-reward-art" data-rarity={printing?.rarity}>
    {printing ? <PrintingArt slug={slug} printingId={printing.id} alt={alt} inline fallback={printing.rarity.startsWith('Iconic ') ? undefined : standardArt} /> : standardArt}
  </span>;
}
