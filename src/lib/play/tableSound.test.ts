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
