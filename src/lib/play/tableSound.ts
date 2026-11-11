/** Short synthesised sounds for things that happen on the table. No audio files. */
export type TableCue = 'draw' | 'play' | 'eddie' | 'hit' | 'defeat' | 'gig' | 'turn' | 'win' | 'lose' | 'equip' | 'program' | 'call' | 'attack' | 'select' | 'ready' | 'pack-open' | 'pack-reveal' | 'reward-lock' | 'act-arrival';

const TAU = Math.PI * 2;
const tone = (hz: number, t: number) => Math.sin(TAU * hz * t);
/** A note that starts at `at` seconds and rings out. */
const note = (hz: number, t: number, at: number, decay: number) => t < at ? 0 : tone(hz, t - at) * Math.exp(-decay * (t - at));
/** Phase of a pitch that falls from `from + floor` towards `floor`. */
const fall = (from: number, floor: number, rate: number, t: number) => TAU * (floor * t + from / rate * (1 - Math.exp(-rate * t)));

interface Recipe { seconds: number; gain: number; smooth: number; voice: (t: number, noise: number) => number }
const recipes: Record<TableCue, Recipe> = {
  // Foil tear, a glassy reveal, and a quiet lock-in. Shared mute and voice limits apply.
  'pack-open': { seconds: .55, gain: .4, smooth: .22, voice: (t, n) => n * Math.sin(Math.PI * t / .55) ** 2 * (1 + .35 * tone(43, t)) + note(196, t, .3, 12) * .6 },
  'pack-reveal': { seconds: .36, gain: .28, smooth: .5, voice: (t, n) => n * Math.exp(-24 * t) * .6 + note(880, t, .04, 14) * .6 + note(1320, t, .09, 16) * .3 },
  'reward-lock': { seconds: .4, gain: .35, smooth: .8, voice: (t, n) => note(180, t, 0, 30) + n * Math.exp(-70 * t) * .4 + note(659.25, t, .07, 12) * .6 + note(987.77, t, .12, 12) * .3 },
  'act-arrival': { seconds: 1.35, gain: .35, smooth: .9, voice: t => note(130.81, t, 0, 3) * .7 + note(261.63, t, .12, 4) * .6 + note(392, t, .25, 4) * .5 + note(523.25, t, .4, 4) * .4 },
  equip: { seconds: .28, gain: .5, smooth: .65, voice: (t, n) => note(1450, t, 0, 65) * .55 + note(2200, t, .055, 38) * .4 + n * Math.exp(-45 * t) * .3 },
  program: { seconds: .42, gain: .38, smooth: .3, voice: (t, n) => Math.sin(fall(-900, 1600, 6, t)) * Math.sin(Math.PI * t / .42) ** 2 * .4 + note(1568, t, .16, 20) * .4 + n * Math.exp(-18 * t) * .2 },
  call: { seconds: .72, gain: .38, smooth: .22, voice: (t, n) => note(196, t, 0, 6) * .8 + note(392, t, .07, 7) * .5 + note(587.33, t, .14, 6) * .35 + n * Math.exp(-12 * t) * .3 },
  attack: { seconds: .22, gain: .4, smooth: .15, voice: (t, n) => n * Math.sin(Math.PI * t / .22) ** 2 * 1.6 + Math.sin(fall(130, 70, 12, t)) * Math.exp(-22 * t) * .4 },
  select: { seconds: .065, gain: .18, smooth: .6, voice: (t, n) => tone(1250, t) * Math.exp(-100 * t) + n * Math.exp(-180 * t) * .3 },
  ready: { seconds: .24, gain: .22, smooth: .2, voice: (t, n) => n * Math.exp(-25 * t) + note(620, t, .06, 22) * .5 },
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
export function renderCue(cue: TableCue, sampleRate: number, variant = 0): Float32Array {
  const { seconds, gain, smooth, voice } = recipes[cue];
  const samples = new Float32Array(Math.ceil(seconds * sampleRate));
  let seed = 1759 + variant * 977, low = 0;
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

/** Resin dice on felt: size changes the body resonance; softer contacts have a shorter tail. */
export function renderDice(type: string, soft: boolean, launch: boolean, sampleRate: number): Float32Array {
  const sides = Math.max(4, Math.min(20, Number(type.slice(1)) || 6));
  const seconds = launch ? .19 : soft ? .1 : .24;
  const samples = new Float32Array(Math.ceil(sampleRate * seconds));
  let seed = 3397 + sides, low = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    low += .4 * ((seed / 2147483648 - 1) - low);
    let value = 0;
    for (const at of launch ? [0, .044, .105] : soft ? [0] : [0, .064, .112]) {
      const u = t - at;
      if (u < 0) continue;
      const weight = at === 0 ? 1 : .25;
      value += weight * (tone(260 - sides * 7, u) * Math.exp(-48 * u) * .6 + tone(1800 + sides * 21, u) * Math.exp(-105 * u) * .24 + low * Math.exp(-85 * u) * .5);
    }
    samples[i] = Math.tanh(value) * (launch ? .18 : soft ? .2 : .5) * Math.min(1, t * 1500, (seconds - t) * 100);
  }
  return samples;
}
