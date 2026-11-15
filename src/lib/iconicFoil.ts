import { PRINTING_INDEX } from './data';

export type FoilMode = 'compact' | 'standard' | 'inspection' | 'off';

const iconicRarities = new Set(['Iconic Legend', 'Iconic Other', 'Iconic Secret']);

export function isIconicPrinting(printingId: string): boolean {
  const printing = PRINTING_INDEX.get(printingId)?.printing;
  return !!printing && iconicRarities.has(printing.rarity);
}
