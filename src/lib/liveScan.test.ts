import { describe, expect, it } from 'vitest';
import { createScanGate, scanCrop, scanFrameChanged } from './liveScan';

const sample = (...pixels: number[]) => new Uint8ClampedArray(pixels);

describe('live scan capture', () => {
  it('crops the same portrait frame from portrait and landscape video', () => {
    expect(scanCrop(1000, 1500)).toEqual({ x: 200, y: 330, width: 600, height: 840 });
    expect(scanCrop(1500, 1000)).toEqual({ x: 450, y: 80, width: 600, height: 840 });
  });

  it('adds margin for titles and edges when capturing the recognition image', () => {
    expect(scanCrop(1500, 1000, 0.05)).toEqual({ x: 400, y: 30, width: 700, height: 940 });
  });

  it('waits for a stable, readable frame and restarts the hold after motion', () => {
    const ready = createScanGate();
    const first = sample(5, 150, 200, 40);
    const shifted = sample(180, 80, 20, 150);
    expect([ready(first), ready(first), ready(shifted), ready(shifted), ready(shifted), ready(shifted)])
      .toEqual([false, false, false, false, false, true]);
  });

  it('ignores featureless video and requires a meaningful change after a save', () => {
    const ready = createScanGate();
    const blank = sample(180, 180, 180, 180);
    expect(Array.from({ length: 6 }, () => ready(blank))).toEqual(Array(6).fill(false));
    const frame = sample(10, 160, 80, 200);
    expect(scanFrameChanged(frame, sample(12, 163, 85, 197))).toBe(false);
    expect(scanFrameChanged(frame, blank)).toBe(true);
  });

  it('captures after a bounded hold with moderate movement and keeps waiting on large changes', () => {
    const first = sample(30, 80, 150, 220);
    const moderate = sample(44, 66, 164, 206);
    const large = sample(220, 150, 80, 30);
    const sequence = (other: Uint8ClampedArray) => {
      const ready = createScanGate();
      return Array.from({ length: 12 }, (_, index) => ready(index % 2 ? other : first));
    };
    expect(sequence(moderate)).toEqual([...Array(11).fill(false), true]);
    expect(sequence(large)).toEqual(Array(12).fill(false));
  });
});
