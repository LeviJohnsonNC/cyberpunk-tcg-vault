import type { StarterKey } from '../starters';
import type { EncounterId } from './campaign';
import type { MatchFrame } from './protocol';
import { vaultCard } from './cardDisplay';
import { zoneCards } from './matchView';

type Tactics = {
  playstyle: { label: string; summary: string };
  threat: string;
  counterplay: string;
};

type Intel = { bio: string } & Tactics;

const dossiers: Record<EncounterId, Intel> = {
  'first-call': {
    bio: 'Moth bought a jacket with their first payout and rehearsed a victory speech in the mirror. They’ll get good fast if the Afterlife lets them live that long.',
    playstyle: { label: 'Arasaka buildup', summary: 'Early Units buy time for heavier Arasaka attackers.' },
    threat: 'Goro can Go Solo as a ready attacker, then serve as a blocker when ready again.',
    counterplay: 'Trade with early Units, take Gigs while their crew builds up, and keep a blocker for the big swing.',
  },
  'chrome-debt': {
    bio: 'Ledger used to price cyberware. Now she prices people. Win or lose, she has a line item ready for you.',
    playstyle: { label: 'Gear investment', summary: 'Ledger builds up inexpensive Units with Gear while your Gigs are exposed.' },
    threat: 'River Ward can spend to play Gear costing 2 or less for free at Quick speed.',
    counterplay: 'Pressure Gigs while Ledger equips, then take out the Gear carrier before the upgrades stack up.',
  },
  'dead-drop': {
    bio: 'Latch delivers things that officially never left. They know every side door in Night City and how long it takes to get through each one.',
    playstyle: { label: 'Early pressure', summary: 'Efficient Units backed by inexpensive Gear.' },
    threat: 'Viktor can find up to two Gear cards costing 2 or less, giving Latch a chance to reload after a trade.',
    counterplay: 'Take clean trades and keep enough Units in play to contest Gigs.',
  },
  'night-drive': {
    bio: 'Switchback has brought whole convoys home through blackouts. She counts every person on the way out and again on the way back.',
    playstyle: { label: 'Convoy buildup', summary: 'Cheap Units spread across the field and get stronger as the convoy grows.' },
    threat: 'Panam can move her Gear to an unequipped Unit and ready it for another action.',
    counterplay: 'Break up the convoy early and save an answer for the Units brought back by We Gotta Live Together.',
  },
  'dead-air': {
    bio: 'Hush can tell which chair you’re in from the noise on your line. They only speak when the silence is costing them information.',
    playstyle: { label: 'Braindance control', summary: 'Braindance Programs help Judy boost a Unit while Hush controls the field.' },
    threat: 'When Hush trails in Street Cred, Towerfall can weaken the whole field on your side and bottom-deck Units reduced to 0 power.',
    counterplay: 'Keep a playable Unit in hand so you can rebuild after a big Program.',
  },
  'red-line': {
    bio: 'Brake collects the key when a room changes hands. The house pays him to bring it back, and he takes that personally.',
    playstyle: { label: 'Heavy finishers', summary: 'Early removal clears a path for expensive Units that can take several Gigs.' },
    threat: 'Adam Smasher can Go Solo, defeat a rival Unit on entry, and attack that turn.',
    counterplay: 'Pressure Gigs early, spread your defense across several Units, and keep an answer for the first finisher.',
  },
  'mosh-pit': {
    bio: 'Feedback plays the late set, takes bets during the break, and remembers which table laughed when the speakers blew.',
    playstyle: { label: 'Rocker rush', summary: 'Rockers and Gear press early while Kerry draws on min or max Gig rolls.' },
    threat: 'Johnny can send a fresh Unit after a spent target and give it +2 power if it’s a Rocker.',
    counterplay: 'Trade with the first Rockers before Gear lands and leave fewer easy spent targets when you pass.',
  },
  'hostile-takeover': {
    bio: 'Splice sells clean edits of ugly nights. If you walk out alive, there’s usually a version where you didn’t.',
    playstyle: { label: 'Recycled answers', summary: 'Splice trades resources and uses Braindance Programs to regain the initiative.' },
    threat: 'V: Streetkid can recover a Braindance Program from the trash when called.',
    counterplay: 'Force answers on separate threats and hold a cheap Unit to regain the field after a trade.',
  },
  'last-call': {
    bio: 'Director Sato keeps a record of every favor he’s done. He has never once been surprised by the price of one.',
    playstyle: { label: 'Arasaka endgame', summary: 'Blockers buy Sato time for high-power Arasaka finishers.' },
    threat: 'Saburo can push a 9-power Arasaka attacker to 10, enough to steal an extra Gig.',
    counterplay: 'Make Sato spend resources early and keep your strongest answer for a closer like Goro or Adam Smasher.',
  },
};

const mothHeistTactics: Tactics = {
  playstyle: { label: 'Gear tempo', summary: 'Moth builds up cheap Units with Gear. The longer a carrier sticks around, the harder it is to trade with.' },
  threat: 'Viktor can reload on cheap Gear, and Secondhand Bombus can redirect an attack when ready.',
  counterplay: 'Trade before upgrades pile up and force the blocker to spend before attacking Gigs.',
};

export function campaignRivalIntel(encounter: EncounterId, starter: StarterKey): Intel {
  const dossier = dossiers[encounter];
  return encounter === 'first-call' && starter === 'embracing-power' ? { ...dossier, ...mothHeistTactics } : dossier;
}

/** Use the displayed player-filtered frame. Never use deck order to infer a slot. */
export function knownRivalLegendSlugs(frame: Pick<MatchFrame, 'view' | 'knownLegends'>): string[] {
  const rival = frame.view.players.rival;
  const slots = new Set(zoneCards(rival, 'legendArea').map(card => card.instanceId));
  const publicCards = Object.values(rival.zones).flatMap(zone => Array.isArray(zone) ? zone.filter(card => !card.faceDown) : []);
  const remembered = frame.knownLegends.filter(card => slots.has(card.instanceId));
  const cards = [...publicCards, ...remembered].flatMap(card => {
    const definition = vaultCard(card);
    return definition?.type === 'Legend' ? [definition.slug] : [];
  });
  return [...new Set(cards)].sort();
}
