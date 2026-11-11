import { describe, it, expect, vi, afterEach } from 'vitest';
import { connectMusic, MusicEnvelope, setRoomMotion, silentSignal, subscribeMusic } from './musicSignal';
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
  it('finds kick accents in a compressed bass-heavy track', () => {
    const meter = new MusicEnvelope();
    for (let t = 0; t < 4000; t += 33) meter.sample([.73,.73,0,0,0,0,0,0], t);
    expect(meter.sample([.81,.81,0,0,0,0,0,0], 4030).pulse).toBeGreaterThan(.35);
  });
  it('keeps the room toggle independent of playback and disposes subscribers', () => {
    let calls = 0;
    const off = subscribeMusic(() => { calls++; });
    setRoomMotion(false); expect(calls).toBe(2);
    off(); setRoomMotion(true); expect(calls).toBe(2);
    expect(silentSignal().bands.every(n => n === 0)).toBe(true);
  });
});


// Exercise real graph lifecycle against media events, without needing a browser audio device.
describe('music graph lifecycle', () => {
  afterEach(() => vi.unstubAllGlobals());
  function harness() {
    const element = Object.assign(new EventTarget(), { paused: true, ended: false, muted: false, volume: .45, readyState: 4 });
    const document = Object.assign(new EventTarget(), { hidden: false });
    const motion = Object.assign(new EventTarget(), { matches: false });
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const analyser = { connect: vi.fn(), disconnect: vi.fn(), fftSize: 2048, smoothingTimeConstant: 0, frequencyBinCount: 1024, getByteFrequencyData: (data: Uint8Array) => data.fill(200) };
    const gain = { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() } };
    const context = Object.assign(new EventTarget(), { state: 'running', sampleRate: 44100, currentTime: 0, destination: {}, createAnalyser: () => analyser, createGain: () => gain, createMediaElementSource: vi.fn(() => source), resume: vi.fn(async () => {}), close: vi.fn(async () => {}) });
    const frames = new Map<number, FrameRequestCallback>(); let serial = 0;
    vi.stubGlobal('AudioContext', function () { return context; });
    vi.stubGlobal('document', document); vi.stubGlobal('matchMedia', () => motion);
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.set(++serial, fn); return serial; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    const graph = connectMusic(element as HTMLAudioElement);
    const tick = () => { const entry = frames.entries().next().value!; frames.delete(entry[0]); entry[1](1000); };
    return { element, document, motion, source, analyser, gain, context, frames, graph, tick };
  }
  it('analyses playback, settles instantly on pause, and tears down its graph/listeners', async () => {
    const h = harness();
    let signal = silentSignal(); const off = subscribeMusic(value => { signal = value; });
    expect(h.frames.size).toBe(0);
    await h.graph.resume(); expect(h.context.resume).toHaveBeenCalledOnce();
    h.element.paused = false; h.element.dispatchEvent(new Event('playing')); h.tick();
    expect(signal.active).toBe(true); expect(signal.bass).toBeGreaterThan(.5);
    h.element.paused = true; h.element.dispatchEvent(new Event('pause'));
    expect(h.frames.size).toBe(0); expect(signal.active).toBe(false); expect(signal.pulse).toBe(0);
    h.graph.dispose();
    h.element.paused = false; h.element.dispatchEvent(new Event('playing'));
    expect(h.frames.size).toBe(0); expect(h.context.createMediaElementSource).toHaveBeenCalledOnce();
    expect(h.source.disconnect).toHaveBeenCalledOnce(); expect(h.context.close).toHaveBeenCalledOnce(); off();
  });
  it('suspends visual work for reduced motion, hidden tabs, buffering and mute', () => {
    const h = harness();
    h.element.paused = false; h.element.dispatchEvent(new Event('playing')); expect(h.frames.size).toBe(1);
    h.motion.matches = true; h.motion.dispatchEvent(new Event('change')); expect(h.frames.size).toBe(0);
    h.motion.matches = false; h.motion.dispatchEvent(new Event('change')); expect(h.frames.size).toBe(1);
    h.document.hidden = true; h.document.dispatchEvent(new Event('visibilitychange')); expect(h.frames.size).toBe(0);
    h.document.hidden = false; h.document.dispatchEvent(new Event('visibilitychange')); expect(h.frames.size).toBe(1);
    h.element.readyState = 2; h.element.dispatchEvent(new Event('waiting')); expect(h.frames.size).toBe(0);
    h.element.readyState = 4; h.element.dispatchEvent(new Event('playing')); expect(h.frames.size).toBe(1);
    h.element.volume = 0; h.element.dispatchEvent(new Event('volumechange')); expect(h.frames.size).toBe(0);
    h.graph.dispose();
  });
});
