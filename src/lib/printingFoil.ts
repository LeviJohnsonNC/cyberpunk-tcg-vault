import { PRINTING_INDEX } from './data';
import { printingVariant } from './cardPrintingVariants';

export type FoilMode = 'compact' | 'standard' | 'inspection' | 'off';
export type FoilFinish = 'iconic' | 'nova';

export function printingFoilFinish(printingId: string): FoilFinish | undefined {
  const printing = PRINTING_INDEX.get(printingId)?.printing;
  if (!printing) return;
  const variant = printingVariant(printing);
  if (variant === 'Iconic') return 'iconic';
  if (variant === 'Nova') return 'nova';
}
