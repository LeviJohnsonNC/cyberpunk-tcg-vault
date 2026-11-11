import type { StarterKey } from '../starters';
import type { RivalSkill } from './protocol';

/** The two deck directions each starter can pursue using campaign rewards. */
export const REWARD_THEMES: Record<StarterKey, readonly [ReadonlySet<string>, ReadonlySet<string>]> = {
  'the-heist': [
    // Efficient bodies and Gear for Viktor and V.
    new Set([
      'secondhand-bombus', 'augmented-negotiators', 'sketchy-ripper', 'maelstrom-goons',
      'psycho-squad', 'mt0d12-flathead', 'maxtac-suppression-team', 'jackie-welles-ride-or-die-choom',
      'dying-night-v-s-pistol', 'zetatech-faceplate', 'tetratronic-rippler', 'netwatch-netdriver',
      'viktor-vektor-you-might-feel-a-little-pinch', 'caliber-totentanz-s-top-dog', 'rita-wheeler-no-stupid-questions',
    ]),
    // Cheap Programs, Gig support, and answers for the Blue tempo plan.
    new Set([
      'floor-it', 'trust-no-one', 'afterparty-at-lizzie-s', 'reboot-optics', 'three-mouths-one-desire',
      'chrome-reverie', 'nocturne-op55-n1', 'pyramid-song', 'towerfall', 'the-heist', 'cyberpsychosis',
      'dexter-deshawn-one-last-chance', 'mox-inciters', 'maman-brigitte-spirit-of-death', 'placide-voodoo-sentinel',
    ]),
  ],
  'embracing-power': [
    // Arasaka bodies and the Programs that fund them.
    new Set([
      'field-operator', 'goro-takemura-losing-his-way', 'sandayu-oda-hanako-s-guardian', 'minotaur',
      'arasaka-emergency-radioport', 'industrial-assembly', 'satori-sword-of-saburo',
      'corporate-surveillance', 'all-is-lost', 'peace-offering', 'take-control', 'memory-relapse',
    ]),
    // Independent pressure and removal that work without an Arasaka payoff.
    new Set([
      'valentino-street-racer', 'la-llorona-ghost-of-the-past', 'tyger-s-whisper', 'riot-shield',
      'detonate', 'synapse-burnout', 'over-the-edge', 'maxtac-av', 'pepe-najarro-working-doubles',
      '6th-street-recruits', 'meredith-stout-stone-cold-corpo', 'nadia-fighting-through-grief',
      'johnny-silverhand-never-stop-fighting', 'don-t-fear-the-reaper', 'screw-lovelorn-fool',
    ]),
  ],
};

interface RivalTuning {
  /** Copy deltas against the public list. A zero-copy card is removed. */
  cards: Readonly<Record<string, number>>;
  skill?: RivalSkill;
}

/** First Call's fixed practice list for The Heist's route. */
export const HEIST_OPENING_RIVAL: RivalTuning = {
  cards: {
    'satori-sword-of-saburo': -2, 'mantis-blades': -2, 'maxtac-av': -1,
    'japantown-jonin': 2, 'swordwise-huscle': 1, 'riot-shield': 1, 'riding-nomad': 1,
  },
};

/** Campaign-only adjustments. Free Play still uses the original curated lists. */
export const RIVAL_TUNING: Readonly<Partial<Record<string, RivalTuning>>> = {
  // Give the Gear crew inexpensive hosts.
  'chrome-debt': {
    cards: {
      'sketchy-ripper': 1, 'secondhand-bombus': 2, 'alt-cunningham-mother-of-daemons': -1,
      'the-relic-experimental-biochip': -1, 'adrenaline-converter': -1,
    },
  },
  // Introduce a removal threat before the opponent skill increases.
  'dead-drop': {
    cards: {
      'heywood-ripperdoc': -1, 'maman-brigitte-spirit-of-death': 1,
    },
  },
  // The first Sharp rival has fewer dead expensive draws.
  'night-drive': {
    skill: 'sharp',
    cards: {
      'zetatech-berserk': -2, 'riding-nomad': -2, 'saul-bright-stormrider': -1,
      'don-t-fear-the-reaper': -1, 'we-gotta-live-together': -1,
    },
  },
  // Keep Smasher and Steel Dragon as the finishers with less stacked removal.
  'red-line': {
    cards: {
      'appetite-for-destruction': -1, 'trauma-team-operatives': -1, 'animals-wrecker': -1,
      'yorinobu-arasaka-steel-dragon': -1, 'carnage-at-the-colosseum': -2, 'bonnie-and-clyde': -2,
      '6th-street-recruits': -1, 'kerry-eurodyne-the-last-rockerboy': 2, 'swordwise-huscle': 1,
      'satori-sword-of-saburo': -1, 'viktor-vektor-you-might-feel-a-little-pinch': 1,
    },
  },
  // Lower the top end so the Rocker crew puts bodies on the table earlier.
  'mosh-pit': {
    cards: {
      'trauma-team-operatives': -2, 'bootleg-black-sapphire-show': -2, 'johnny-silverhand-never-stop-fighting': -1,
      'sketchy-ripper': 1, 'secondhand-bombus': 2, 'jackie-welles-ride-or-die-choom': -2,
      'gorilla-arms': -1, 'maelstrom-goons': 2,
    },
  },
  // Concentrate the toolbox without cutting its cheap answers.
  'hostile-takeover': {
    cards: {
      'yorinobu-arasaka-steel-dragon': -2, 'carnage-at-the-colosseum': -1, 'chrome-fang': -2,
      'nadia-fighting-through-grief': -1, 'maelstrom-zealots': -1,
    },
  },
};

/** Goro and Adam give the house two Go Solo threats. Saburo backs the Arasaka Units. */
export const ARASAKA_HOUSE_LIST = {
  legends: ['saburo-arasaka-stubborn-patriarch', 'goro-takemura-hands-unclean', 'adam-smasher-ender-of-legends'],
  cards: {
    'screw-lovelorn-fool': 2, 'meredith-stout-stone-cold-corpo': 3, '6th-street-recruits': 2,
    'la-llorona-ghost-of-the-past': 2, 'valentino-street-racer': 3, 'sandayu-oda-hanako-s-guardian': 2,
    minotaur: 2, 'field-operator': 2, 'industrial-assembly': 3, 'mantis-blades': 3,
    'satori-sword-of-saburo': 3, 'arasaka-emergency-radioport': 2, 'over-the-edge': 2,
    'all-is-lost': 2, detonate: 2, 'corporate-surveillance': 2, 'nadia-fighting-through-grief': 1,
    'goro-takemura-losing-his-way': 2,
  },
};
