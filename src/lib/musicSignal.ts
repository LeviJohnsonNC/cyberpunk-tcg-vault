/** Music-only analysis. Nothing here reads a microphone or changes game state. */
export interface MusicSignal { bass: number; air: number; pulse: number; bands: number[]; active: boolean; room: boolean }
export const silentSignal = (): MusicSignal => ({ bass: 0, air: 0, pulse: 0, bands: Array(8).fill(0), active: false, room: true });
const listeners = new Set<(signal: MusicSignal) => void>();
let current = silentSignal();
export function subscribeMusic(listener: (signal: MusicSignal) => void) { listeners.add(listener); listener(current); return () => { listeners.delete(listener); }; }
function publish(signal: MusicSignal) { current = { ...signal, room: current.room }; listeners.forEach((fn) => fn(current)); }
export function setRoomMotion(room: boolean) { current = { ...current, room }; listeners.forEach((fn) => fn(current)); }

/** Adaptive bass onset, a refractory period, and slow release: no fixed-tempo fake pulsing. */
export class MusicEnvelope {
  private average = .15;
  private previous = 0;
  private lastBeat = -1000;
  private lastTime = 0;
  private pulse = 0;
  sample(bands: number[], now: number) {
    const dt = Math.min(100, Math.max(0, now - this.lastTime)); this.lastTime = now;
    const bass = Math.max(0, Math.min(1, (bands[0] + bands[1]) / 2));
    this.average += (bass - this.average) * (1 - Math.exp(-dt / 1000));
    const onset = bass > .18 && bass > this.average + .025 && bass - this.previous > .025 && now - this.lastBeat > 280;
    this.pulse *= Math.exp(-dt / 240);
    if (onset) { this.pulse = Math.min(1, .35 + (bass - this.average) * 2); this.lastBeat = now; }
    this.previous = bass;
    return { bass, air: (bands[5] + bands[6] + bands[7]) / 3, pulse: this.pulse, bands, active: true, room: true };
  }
}

let duck: ((seconds: number) => void) | undefined;
export function duckMusic(seconds = .4) { duck?.(seconds); }

/** Create only from a play gesture. The media element is connected exactly once for its lifetime. */
export function connectMusic(element: HTMLAudioElement) {
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048; analyser.smoothingTimeConstant = .55;
  const gain = context.createGain();
  const source = context.createMediaElementSource(element);
  source.connect(analyser); analyser.connect(gain); gain.connect(context.destination);
  const bytes = new Uint8Array(analyser.frequencyBinCount);
  const edges = [40, 90, 180, 360, 720, 1400, 3000, 6500, 14000];
  let envelope = new MusicEnvelope(), frame = 0, last = 0;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const hush = (seconds: number) => {
    if (element.paused || context.state !== 'running') return;
    const t = context.currentTime;
    gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(.78, t + .035);
    gain.gain.setTargetAtTime(1, t + seconds, .16);
  };
  duck = hush;
  function tick(now: number) {
    if (now - last >= 32) {
      last = now; analyser.getByteFrequencyData(bytes);
      const bands = edges.slice(0, -1).map((low, i) => {
        const start = Math.max(1, Math.floor(low * analyser.fftSize / context.sampleRate));
        const end = Math.min(bytes.length, Math.ceil(edges[i + 1] * analyser.fftSize / context.sampleRate));
        let sum = 0; for (let j = start; j < end; j++) sum += bytes[j] / 255;
        return Math.max(0, (sum / Math.max(1, end - start) - .12) / .88);
      });
      publish(envelope.sample(bands, now));
    }
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame); frame = 0;
    envelope = new MusicEnvelope();
    publish(silentSignal());
    if (!element.paused && element.readyState >= 3 && !element.ended && !element.muted && element.volume > 0 && !document.hidden && !motion.matches && context.state === 'running') frame = requestAnimationFrame(tick);
  }
  const events = ['playing', 'pause', 'ended', 'emptied', 'waiting', 'volumechange'] as const;
  events.forEach((name) => element.addEventListener(name, sync));
  document.addEventListener('visibilitychange', sync); motion.addEventListener('change', sync);
  context.addEventListener('statechange', sync);
  return {
    resume: () => context.resume(),
    dispose() {
      cancelAnimationFrame(frame); events.forEach((name) => element.removeEventListener(name, sync));
      document.removeEventListener('visibilitychange', sync); motion.removeEventListener('change', sync);
      context.removeEventListener('statechange', sync); if (duck === hush) duck = undefined;
      source.disconnect(); analyser.disconnect(); gain.disconnect(); void context.close().catch(() => {}); publish(silentSignal());
    },
  };
}
