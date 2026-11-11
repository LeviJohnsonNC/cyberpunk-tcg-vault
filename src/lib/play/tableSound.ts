/** Short synthesised sounds for things that happen on the table. No audio files. */
export type TableCue = 'draw' | 'play' | 'eddie' | 'hit' | 'defeat' | 'gig' | 'turn' | 'win' | 'lose';

const TAU = Math.PI * 2;
const tone = (hz: number, t: number) => Math.sin(TAU * hz * t);
/** A note that starts at `at` seconds and rings out. */
const note = (hz: number, t: number, at: number, decay: number) => t < at ? 0 : tone(hz, t - at) * Math.exp(-decay * (t - at));
/** Phase of a pitch that falls from `from + floor` towards `floor`. */
const fall = (from: number, floor: number, rate: number, t: number) => TAU * (floor * t + from / rate * (1 - Math.exp(-rate * t)));

interface Recipe { seconds: number; gain: number; smooth: number; voice: (t: number, noise: number) => number }
const recipes: Record<TableCue, Recipe> = {
  // A card sliding off the deck.
  draw: { seconds: .12, gain: .5, smooth: .22, voice: (t, n) => n * Math.sin(Math.PI * t / .12) ** 2 * 1.6 },
  // A card set down on the mat.
  play: { seconds: .17, gain: .7, smooth: .5, voice: (t, n) => tone(150, t) * Math.exp(-38 * t) * .8 + n * Math.exp(-70 * t) * .9 },
  // A chip pushed across.
  eddie: { seconds: .15, gain: .45, smooth: .9, voice: (t, n) => (tone(2100, t) + tone(3150, t) * .6) * Math.exp(-46 * t) * .5 + n * Math.exp(-210 * t) * .3 },
  // An attack connecting.
  hit: { seconds: .3, gain: .9, smooth: .55, voice: (t, n) => Math.sin(fall(120, 46, 9, t)) * Math.exp(-13 * t) + n * Math.exp(-30 * t) * .8 },
  // A card breaking.
  defeat: { seconds: .46, gain: .7, smooth: .3, voice: (t, n) => Math.sin(fall(280, 58, 6, t)) * Math.exp(-7 * t) * .7 + n * Math.exp(-11 * t) * .9 },
  // A Gig changing hands.
  gig: { seconds: .26, gain: .45, smooth: 1, voice: (t) => note(660, t, 0, 22) * .7 + note(990, t, .09, 16) },
  // Your turn.
  turn: { seconds: .55, gain: .4, smooth: 1, voice: (t) => note(523.25, t, 0, 7) + note(783.99, t, .12, 6) },
  win: { seconds: 1.2, gain: .42, smooth: 1,
    voice: (t) => [523.25, 659.25, 783.99, 1046.5].reduce((sum, hz, i) => sum + note(hz, t, i * .13, 4.5) + note(hz * 2, t, i * .13, 9) * .25, 0) * .6 },
  lose: { seconds: 1.05, gain: .42, smooth: 1,
    voice: (t) => [440, 349.23, 293.66].reduce((sum, hz, i) => sum + note(hz, t, i * .2, 4) + note(hz * 1.006, t, i * .2, 4) * .6, 0) * .5 },
};

/** Renders one cue to mono samples in [-1, 1], with no click at either end. */
export function renderCue(cue: TableCue, sampleRate: number): Float32Array {
  const { seconds, gain, smooth, voice } = recipes[cue];
  const samples = new Float32Array(Math.ceil(seconds * sampleRate));
  let seed = 1759, low = 0;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    // One-pole low-pass keeps the noise from sounding like static.
    low += smooth * ((seed / 2147483648 - 1) - low);
    const t = i / sampleRate;
    const edge = Math.min(1, t * 700, (seconds - t) * 90);
    samples[i] = Math.max(-1, Math.min(1, voice(t, low) * gain * edge));
  }
  return samples;
}

export const tableCues = Object.keys(recipes) as TableCue[];
