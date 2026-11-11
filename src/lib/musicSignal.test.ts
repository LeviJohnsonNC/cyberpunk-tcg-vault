import { describe, it, expect } from 'vitest';
import { MusicEnvelope, setRoomMotion, silentSignal, subscribeMusic } from './musicSignal';
describe('music-reactive envelope', () => {
  it('stays still through silence and detects a bass onset, rather than inventing a tempo', () => {
    const meter = new MusicEnvelope();
    for (let t = 0; t < 2000; t += 33) expect(meter.sample(Array(8).fill(0), t).pulse).toBe(0);
    const hit = meter.sample([.9,.8,.3,.2,.1,0,0,0], 2010);
    expect(hit.pulse).toBeGreaterThan(.4);
    expect(hit.pulse).toBeLessThanOrEqual(1);
    let tail = hit;
    for (let t = 2043; t < 5000; t += 33) tail = meter.sample(Array(8).fill(0), t);
    expect(tail.pulse).toBeLessThan(.001);
  });
  it('does not strobe on sustained bass and leaves room between transients', () => {
    const meter = new MusicEnvelope();
    const loud = [.8,.8,0,0,0,0,0,0];
    const first = meter.sample(loud, 500).pulse;
    meter.sample(Array(8).fill(0), 533);
    expect(meter.sample(loud, 566).pulse).toBeLessThan(first);
    const values = Array.from({length:90},(_,i)=>meter.sample(loud,600+i*33).pulse);
    expect(values.at(-1)).toBeLessThan(.001);
  });
  it('keeps the room toggle independent of playback and disposes subscribers', () => {
    let calls = 0;
    const off = subscribeMusic(() => { calls++; });
    setRoomMotion(false); expect(calls).toBe(2);
    off(); setRoomMotion(true); expect(calls).toBe(2);
    expect(silentSignal().bands.every(n => n === 0)).toBe(true);
  });
});
