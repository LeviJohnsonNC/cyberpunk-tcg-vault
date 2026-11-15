import type { Printing } from './data';

const VARIANTS = ['Regular', 'Iconic', 'Nova', 'Judge', 'Promo'] as const;
export type PrintingVariant = typeof VARIANTS[number];

// These Judge stamps are cataloged in their event sets.
const JUDGE_STAMPS = new Set([
  '5cc2112c-10b6-4491-963d-8b517244aaee', // Maman Brigitte, Night City Brawl #037
  '36d42759-0199-47f0-835b-ee6616842e49', // Sandevistan, Night City Showdown #005
]);

export function printingVariant(printing: Printing): PrintingVariant {
  if (printing.set === 'Judge Promos' || JUDGE_STAMPS.has(printing.id)) return 'Judge';
  if (printing.rarity.startsWith('Iconic ')) return 'Iconic';
  if (printing.rarity === 'Nova Rare') return 'Nova';
  if (printing.set === 'Set 1 Promos' || printing.set.startsWith('Box Toppers — ')) return 'Promo';
  return 'Regular';
}

export function printingVariants(printings: Printing[]): PrintingVariant[] {
  const variants = new Set(printings.map(printingVariant));
  return VARIANTS.filter((variant) => variants.has(variant));
}

function edition(printing: Printing): 'Retail' | 'Beta' | undefined {
  if (/\bRetail\b/.test(printing.set)) return 'Retail';
  if (/\bBeta\b/.test(printing.set)) return 'Beta';
}

export function printingForVariant(printings: Printing[], variant: PrintingVariant, current: Printing, previousId?: string): Printing | undefined {
  const candidates = printings.filter((printing) => printingVariant(printing) === variant);
  const currentEdition = edition(current);
  return candidates.find((printing) => printing.id === previousId)
    ?? candidates.find((printing) => printing.set === current.set)
    ?? (currentEdition && candidates.find((printing) => edition(printing) === currentEdition))
    ?? candidates.find((printing) => edition(printing) === 'Retail')
    ?? candidates[0];
}
