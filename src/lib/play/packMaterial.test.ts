import { describe, expect, it } from 'vitest';
import { CARDS } from '../data';
import { PACK_MATERIALS, PACK_RARITIES, packMaterial, packMaterialStyle } from './packMaterial';
import { packRarityLabel } from './campaignPack';

describe('pack printing materials', () => {
  it('covers every retail pack rarity with a distinct material, edge and surface', () => {
    const actual = new Set(CARDS.flatMap(c => c.printings.filter(p => p.set === 'Welcome to Night City — Retail').map(p => p.rarity)));
    expect(new Set(PACK_RARITIES)).toEqual(actual);
    for (const property of ['name', 'rim', 'sheen'] as const) expect(new Set(Object.values(PACK_MATERIALS).map(m => m[property])).size).toBe(8);
  });
  it('falls back to neutral satin for missing, invalid and prototype-key metadata', () => {
    for (const rarity of [undefined, '', 'Nova Rare', 'Unknown', 'constructor', '__proto__']) {
      expect(packMaterial(rarity)).toBe(PACK_MATERIALS.Common);
      expect(packMaterialStyle(rarity)).toEqual(packMaterialStyle('Common'));
    }
  });
  it('protects the printed face while keeping external light layers valid and finite', () => {
    for (const rarity of PACK_RARITIES) {
      const m = packMaterial(rarity);
      expect(m.surface).toBeLessThanOrEqual(.45);
      for (const opacity of [m.halo, m.bloom, m.spill, m.reflection]) {
        expect(opacity).toBeGreaterThanOrEqual(0);
        expect(opacity).toBeLessThanOrEqual(1);
      }
      expect(m.duration).toBeLessThanOrEqual(1000);
      expect(m.duration).toBeGreaterThan(0);
    }
  });
  it('identifies every Iconic subtype without confusing printing rarity with gameplay type', () => {
    expect(packRarityLabel('Iconic Other')).toBe('Iconic Other Rare');
    expect(packRarityLabel('Iconic Legend')).toBe('Iconic Legend Rare');
    expect(packRarityLabel('Iconic Secret')).toBe('Iconic Secret Rare');
    expect(packRarityLabel('Common')).toBe('Common');
  });
});
