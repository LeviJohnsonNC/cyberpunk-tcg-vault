export const showdownMeta = {
  window: 'Nov 14–20, 2026',
  source: 'https://nikiva-dev.github.io/night-city-meta/',
  entries: 681,
  topEight: 302,
  winners: 39,
  coverage: 23.2,
  families: [
    { name: 'RYY', colors: 'Red / Yellow / Yellow', entries: 206, topEight: 86, wins: 10 },
    { name: 'BBG', colors: 'Blue / Blue / Green', entries: 138, topEight: 65, wins: 5 },
    { name: 'RRG', colors: 'Red / Red / Green', entries: 110, topEight: 62, wins: 11 },
    { name: 'GGR', colors: 'Green / Green / Red', entries: 61, topEight: 25, wins: 5 },
    { name: 'RRY', colors: 'Red / Red / Yellow', entries: 34, topEight: 16, wins: 3 },
  ],
};

// Curated crews in the report's field chart, keyed by sorted Legend slugs.
const crewEntries: Readonly<Partial<Record<string, number>>> = {
  'alt-cunningham-soulkiller-architect/hanako-arasaka-daughter-of-the-emperor/jackie-welles-pour-one-out-for-me': 113,
  'adam-smasher-ender-of-legends/river-ward-detective-on-the-hunt/viktor-vektor-sit-down-and-relax': 87,
  'adam-smasher-ender-of-legends/muamar-reyes-el-capita-n/river-ward-detective-on-the-hunt': 60,
  'adam-smasher-ender-of-legends/padre-man-of-the-cross/v-streetkid': 48,
  'adam-smasher-ender-of-legends/saburo-arasaka-stubborn-patriarch/v-streetkid': 45,
  'jackie-welles-mama-s-favorite/padre-man-of-the-cross/v-streetkid': 16,
  'adam-smasher-ender-of-legends/dum-dum-maelstrom-triggerman/v-streetkid': 8,
};

export function showdownCrewEntries(legends: readonly string[]) {
  return crewEntries[[...legends].sort().join('/')];
}
