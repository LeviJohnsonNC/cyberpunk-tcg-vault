import { describe, expect, it } from 'vitest';
import { diceThrowFrame, diceThrowImpacts, layoutDiceThrow, pointerRelease, releaseOnField } from './diceThrow';
import { ROLL_SETTLE } from './diceTiming';

const field = { left: 40, top: 300, width: 1200, height: 190 };

describe('Gig die throws', () => {
  it('uses the last part of the gesture and drops gently after a pause', () => {
    const samples = [{ x: 50, y: 600, time: 0 }, { x: 680, y: 400, time: 500 }, { x: 640, y: 390, time: 540 }];
    expect(pointerRelease(samples, { x: 600, y: 380, time: 580 })).toEqual({ x: 600, y: 380, vx: -1000, vy: -250 });
    expect(pointerRelease(samples, { x: 640, y: 390, time: 800 })).toEqual({ x: 640, y: 390, vx: 0, vy: 0 });
  });

  it('launches from the drop point and sends a hard left flick farther than a soft right pull', () => {
    const release = { x: 640, y: 395, vx: -1400, vy: 0 };
    const left = layoutDiceThrow(releaseOnField(release, field), field, 60);
    const right = layoutDiceThrow(releaseOnField({ ...release, vx: 240 }, field), field, 60);
    expect(diceThrowFrame(left, 0).point).toEqual({ x: 640, y: 395 });
    const fast = diceThrowFrame(left, 100), slow = diceThrowFrame(right, 100);
    expect(640 - fast.point.x).toBeGreaterThan(4 * (slow.point.x - 640));
    expect(slow.point.x).toBeGreaterThan(640);
    expect(fast.lift).toBeGreaterThan(slow.lift);
    expect(fast.tilt.y).toBeGreaterThan(0);
    expect(slow.tilt.y).toBeLessThan(0);
  });

  it('rebounds inside the field, then holds still at the settle frame', () => {
    const nearWall = layoutDiceThrow({ x: .08, y: .5, vx: -2000, vy: -1300 }, field, 60);
    expect(diceThrowFrame(nearWall, 30).point.x).toBeLessThan(nearWall.origin.x);
    expect(diceThrowFrame(nearWall, 120).point.x).toBeGreaterThan(diceThrowFrame(nearWall, 30).point.x);
    for (let ms = 0; ms <= ROLL_SETTLE; ms += 5) {
      const { point } = diceThrowFrame(nearWall, ms);
      expect(point.x).toBeGreaterThanOrEqual(field.left);
      expect(point.x).toBeLessThanOrEqual(field.left + field.width);
      expect(point.y).toBeGreaterThanOrEqual(field.top);
      expect(point.y).toBeLessThanOrEqual(field.top + field.height);
    }
    const landed = diceThrowFrame(nearWall, ROLL_SETTLE);
    expect(landed.lift).toBe(0);
    expect(Math.hypot(landed.tilt.x, landed.tilt.y, landed.tilt.z)).toBe(0);
    expect(diceThrowFrame(nearWall, ROLL_SETTLE + 150)).toEqual(landed);
  });

  it('places spark bursts at touchdown and scales down the second bounce and soft throws', () => {
    const hard = layoutDiceThrow({ x: .5, y: .5, vx: -2100, vy: 0 }, field, 60);
    const soft = layoutDiceThrow({ x: .5, y: .5, vx: 200, vy: 0 }, field, 60);
    const [first, second] = diceThrowImpacts(hard);
    const [softFirst] = diceThrowImpacts(soft);
    expect(first.time).toBeLessThan(second.time);
    expect(second.time).toBeLessThan(ROLL_SETTLE);
    expect(first.strength).toBeGreaterThan(second.strength);
    expect(first.strength).toBeGreaterThan(softFirst.strength);
    for (const [throwing, impact] of [[hard, first], [hard, second], [soft, softFirst]] as const) {
      expect(diceThrowFrame(throwing, impact.time - 12).lift).toBeGreaterThan(0);
      expect(diceThrowFrame(throwing, impact.time).lift).toBeCloseTo(0);
    }
  });
});
