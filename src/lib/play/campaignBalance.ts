import type { StarterKey } from '../starters';
import type { DeckStrategyProfile } from '../../../vendor/cyberpunk-engine/engine.mjs';
import type { CampaignRivalPlan, RivalSkill } from './protocol';

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
  plan?: CampaignRivalPlan;
}

/** Moth’s tuned Embracing Power list for The Heist’s route. */
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

/** Campaign v3 lists are pinned when a run starts. V2 still uses the lists above. */
export const MOTH_PRACTICE_DELTAS: Record<StarterKey, Readonly<Record<string, number>>> = {
  'the-heist': {
    'corporate-surveillance': -2, 'corpo-security': -2, 'ruthless-lowlife': -1,
    'japantown-jonin': 1, 'riding-nomad': 1, 'sandevistan': -1,
    'riot-shield': 2, 'arasaka-emergency-radioport': 1, 'maxtac-av': 1,
  },
  'embracing-power': {
    'floor-it': -1, 'evelyn-parker-scheming-siren': -1, 'kiroshi-optics': -1,
    'heywood-ripperdoc': 1, 'tetratronic-rippler': 1, 'dying-night-v-s-pistol': 1,
  },
};

export const ROGUELIKE_RIVAL_DELTAS: Readonly<Partial<Record<string, RivalTuning>>> = {
  'chrome-debt': {
    skill: 'sharp',
    plan: 'chrome-debt-v3',
    cards: {
      'secondhand-bombus': 1, 'augmented-negotiators': 3, 'dexter-deshawn-one-last-chance': 3,
      'safety-override': 2, 'reboot-optics': 1, 'offduty-malfini': -1, 'maxtac-suppression-team': 1,
      'alt-cunningham-mother-of-daemons': -1, 'placide-voodoo-sentinel': -1,
      'adrenaline-converter': -1, 'viktor-vektor-drop-your-illusions': -2, 'the-heist': -2, 'sketchy-ripper': -3,
    },
  },
  'dead-drop': {
    skill: 'sharp',
    plan: 'dead-drop-v3',
    cards: {
      'dexter-deshawn-one-last-chance': 1, 'augmented-negotiators': 3, 'secondhand-bombus': 2,
      'pyramid-song': 2, 'nocturne-op55-n1': 1, 'kiroshi-optics': -1,
      'mandibular-upgrade': -1, 'tetratronic-rippler': -2, 'heywood-ripperdoc': -1,
      'jackie-welles-ride-or-die-choom': -1, 'reboot-optics': -1, 'afterparty-at-lizzie-s': -1,
      'offduty-malfini': -1,
    },
  },
  'last-call': {
    plan: 'last-call-v3',
    cards: {
      'la-llorona-ghost-of-the-past': 1, 'goro-takemura-losing-his-way': 1,
      'valentino-guerrera': 3, 'emergency-atlus': 2, 'maxtac-av': 2,
      '6th-street-recruits': 1, 'detonate': 1, 'over-the-edge': 1, 'industrial-assembly': -1,
      'field-operator': -2, 'arasaka-emergency-radioport': -2, 'corporate-surveillance': -2,
      'screw-lovelorn-fool': -2, 'sandayu-oda-hanako-s-guardian': -1, 'nadia-fighting-through-grief': -1,
      'valentino-street-racer': -1,
    },
  },
};


/** Ledger uses cheap Gear to pressure Gigs and Red interaction to defend her carriers. */
export const LEDGER_GEAR_LIST = {
  legends: ['river-ward-detective-on-the-hunt', 'viktor-vektor-sit-down-and-relax', 'v-streetkid'],
  cards: {
    'maelstrom-goons': 3, 'dexter-deshawn-one-last-chance': 3, 'viktor-vektor-you-might-feel-a-little-pinch': 3,
    'gilded-mato-n': 2, 'meredith-stout-stone-cold-corpo': 3, 'ruthless-lowlife': 1, 'la-llorona-ghost-of-the-past': 2,
    'kerry-eurodyne-the-last-rockerboy': 2, 'mantis-blades': 3, 'satori-sword-of-saburo': 2, 'zetatech-faceplate': 3,
    'kiroshi-optics': 2, detonate: 2, 'industrial-assembly': 2, 'safety-override': 1, 'the-heist': 2,
    'augmented-negotiators': 2, 'offduty-malfini': 1, 'gorilla-arms': 1,
  },
};

export const CAMPAIGN_RIVAL_PLANS: Readonly<Record<CampaignRivalPlan, DeckStrategyProfile>> = {
  'chrome-debt-v3': {
    deckId: 'chrome-debt-v3',
    plan: 'Develop a Gear carrier early and turn a cheap attachment into a winning attack.',
    coreCards: ['Zetatech Faceplate', 'Gorilla Arms', 'Dexter DeShawn', 'Safety Override'],
    curveSellCards: ['The Heist', 'Tetratronic Rippler', 'Kiroshi Optics'],
    pacing: 'develop-first',
    mulligan: { cheapUnitCost: 3, minCheapUnits: 1, minSellable: 1 },
    gearHostTypes: { 'Zetatech Faceplate': 'unit', 'Gorilla Arms': 'unit', 'Tetratronic Rippler': 'unit' },
    gearHosts: { 'Gorilla Arms': ['Psycho Squad'], 'Zetatech Faceplate': ['Dexter DeShawn', 'Psycho Squad'] },
  },
  'dead-drop-v3': {
    deckId: 'dead-drop-v3',
    plan: 'Play a cheap attacker, then remove defenders and take Gigs while the rival rebuilds.',
    coreCards: ['Dexter DeShawn', 'Pyramid Song', 'Maman Brigitte', 'Zetatech Faceplate'],
    mulligan: { cheapUnitCost: 3, minCheapUnits: 1, minSellable: 1 },
    gearHostTypes: { 'Zetatech Faceplate': 'unit', 'Dying Night': 'unit' },
    gearHosts: { 'Zetatech Faceplate': ['Dexter DeShawn', 'Psycho Squad'] },
  },
  'last-call-v3': {
    deckId: 'last-call-v3',
    plan: 'Protect Gigs and build an Arasaka board, then clear a blocker for a multi-Gig attack.',
    coreCards: ['La Llorona', 'Meredith Stout', 'Goro Takemura', 'MaxTac AV', 'Satori', 'Mantis Blades'],
    curveSellCards: ['Detonate', 'All is Lost', 'Industrial Assembly'],
    pacing: 'develop-first',
    mulligan: { cheapUnitCost: 3, minCheapUnits: 1, minSellable: 1,
      congestionNames: ['Minotaur', 'Sandayu Oda'], congestionMinCopies: 2 },
    gearHostTypes: { 'Mantis Blades': 'unit', 'Satori': 'unit' },
    gearHosts: { 'Mantis Blades': ['Minotaur', 'Adam Smasher', 'Goro Takemura'], Satori: ['Minotaur', 'Adam Smasher', 'Goro Takemura'] },
    blockDirectStealsAtLeast: 1,
    preferSecond: true,
    developLegends: true,
    planCombatSetup: true,
  },
};
