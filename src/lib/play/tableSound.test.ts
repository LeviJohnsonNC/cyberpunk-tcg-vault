import { describe, expect, it } from 'vitest';
import { renderCue, tableCues } from './tableSound';

describe('table sound', () => {
  it.each(tableCues)('renders %s as a short, audible cue with clean edges', (cue) => {
    const samples = renderCue(cue, 44100);
    expect(samples.length).toBeGreaterThan(44100 * .05);
    expect(samples.length).toBeLessThan(44100 * 1.5);
    let peak = 0;
    for (const sample of samples) { expect(Number.isFinite(sample)).toBe(true); peak = Math.max(peak, Math.abs(sample)); }
    expect(peak).toBeGreaterThan(.05);
    expect(peak).toBeLessThanOrEqual(1);
    expect(Math.abs(samples[0])).toBeLessThan(.01);
    expect(Math.abs(samples.at(-1)!)).toBeLessThan(.02);
  });

  it('is the same every time', () => {
    expect(renderCue('hit', 22050)).toEqual(renderCue('hit', 22050));
  });
});

import { renderDice } from './tableSound';
describe('resin dice sounds', () => {
  it.each(['d4','d6','d8','d10','d12','d20'])('%s has finite, click-free launch and contact sounds', (die) => {
    for (const [soft,launch] of [[false,true],[false,false],[true,false]]) {
      const samples=renderDice(die,soft,launch,44100);
      expect(samples[0]).toBe(0);
      expect(Math.abs(samples.at(-1)!)).toBeLessThan(.01);
      expect(samples.every(n=>Number.isFinite(n)&&Math.abs(n)<=.5)).toBe(true);
      expect(samples.some(n=>Math.abs(n)>.03)).toBe(true);
    }
  });
  it('gives different sizes a different physical resonance', () => { expect(renderDice('d4',false,false,22050)).not.toEqual(renderDice('d20',false,false,22050)); });
});
