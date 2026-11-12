import type { StarterKey } from '../starters';
import type { EncounterId } from './campaign';

type Intel = { bio: string; tips: readonly string[] };

const dossiers: Record<EncounterId, Intel> = {
  'first-call': {
    bio: 'Moth bought a jacket with their first payout and rehearsed a victory speech in the mirror. They’ll get good fast if the Afterlife lets them live that long.',
    tips: [
      'Goro and the Arasaka crew hit harder once they have a board. Trade with their early Units before they can build one.',
      'Keep a blocker or an answer for the big attacker. An empty lane can cost you two Gigs.',
      'Take early Gigs while their heavier cards are still waiting for Eddies.',
    ],
  },
  'chrome-debt': {
    bio: 'Ledger used to price cyberware. Now she prices people. Win or lose, she has a line item ready for you.',
    tips: [
      'River Ward can play cheap Gear at Quick speed. Leave room for a power swing when you attack.',
      'Take out a Gear carrier before it stacks upgrades. Don’t spend your best answer on the first bare Unit.',
      'Pressure Gigs while Ledger is spending Eddies to build up a threat.',
    ],
  },
  'dead-drop': {
    bio: 'Latch delivers things that officially never left. They know every side door in Night City and how long it takes to get through each one.',
    tips: [
      'Latch plays efficient Units early and makes them harder to trade with using cheap Gear.',
      'Viktor can fetch Gear. Expect a replacement if you spend a whole turn answering one upgrade.',
      'Take clean trades and keep enough of a board to contest Gigs after the exchange.',
    ],
  },
  'night-drive': {
    bio: 'Switchback has brought whole convoys home through blackouts. She counts every person on the way out and again on the way back.',
    tips: [
      'The Nomads want several cheap Units on the field. Break up the convoy before the buffs start adding up.',
      'A spent Unit can be readied by Panam. Check what can still get back into the fight.',
      'Watch for We Gotta Live Together when they fall behind. Save an answer for the second wave.',
    ],
  },
  'dead-air': {
    bio: 'Hush can tell which chair you’re in from the noise on your line. They only speak when the silence is costing them information.',
    tips: [
      'Hush turns Braindance Programs into board pressure. Judy can help them keep finding more.',
      'Towerfall is more dangerous when Hush has less Street Cred. Think twice before committing your whole board.',
      'Keep a playable Unit in hand so you can rebuild after a big Program.',
    ],
  },
  'red-line': {
    bio: 'Brake collects the key when a room changes hands. The house pays him to bring it back, and he takes that personally.',
    tips: [
      'Brake has removal early and heavy Units late. Put pressure on their Gigs before they can afford the big bodies.',
      'Adam Smasher can defeat a Unit when he Goes Solo. Avoid leaving one Unit to do all the defending.',
      'Hold an answer for the first big finisher. Animals Wrecker can take two Gigs if it gets through.',
    ],
  },
  'mosh-pit': {
    bio: 'Feedback plays the late set, takes bets during the break, and remembers which table laughed when the speakers blew.',
    tips: [
      'Johnny lets a Rocker hit spent Units the turn it lands. Think about what you leave spent before passing.',
      'Trade with their first Rockers before the Gear makes those trades expensive.',
      'Kerry can draw off minimum and maximum Gig rolls. A bad roll can still refill their hand.',
    ],
  },
  'hostile-takeover': {
    bio: 'Splice sells clean edits of ugly nights. If you walk out alive, there’s usually a version where you didn’t.',
    tips: [
      'V: Streetkid can bring a Braindance Program back from the trash. The first removal spell may come around again.',
      'Make Splice spend answers on separate threats instead of building around one Unit.',
      'Keep something cheap in hand so you can take the initiative back after a trade.',
    ],
  },
  'last-call': {
    bio: 'Director Sato keeps a record of every favor he’s done. He has never once been surprised by the price of one.',
    tips: [
      'Sato uses blockers to buy time for Arasaka finishers. Make them spend resources before they can dictate the pace.',
      'Saburo can push a 9-power Arasaka attacker to 10. Check its attack power before you leave two Gigs exposed.',
      'Save your strongest answer for a closer like Goro or Adam Smasher.',
    ],
  },
};

const mothHeistTips = [
  'Moth builds up cheap Units with Gear. Trade with the carrier before the upgrades pile up.',
  'Viktor can fetch more Gear. Leave a blocker ready if Moth can suit up another attacker.',
  'Secondhand Bombus can redirect an attack. Clear the blocker or force it to spend before going for a Gig.',
];

export function campaignRivalIntel(encounter: EncounterId, starter: StarterKey): Intel {
  const dossier = dossiers[encounter];
  return encounter === 'first-call' && starter === 'embracing-power'
    ? { ...dossier, tips: mothHeistTips }
    : dossier;
}
