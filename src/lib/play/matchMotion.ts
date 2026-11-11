import type { CardView, MatchBeat, PlayerView, Seat } from './protocol';

const seats = ['player', 'rival'] as const;
/** Zones whose cards are drawn individually on the table. */
const tableZones = ['field', 'legendArea', 'resolvingProgram', 'eddieArea', 'gigArea', 'fixerArea'];
/** Where a card that left the table is headed, as a table anchor. */
const pileAnchors: Record<string, string> = { trash: 'trash', deck: 'deck', hand: 'hand' };

export interface TableAccent { kind: 'land' | 'legend' | 'cash'; cardId: string; seat: Seat }

/** Small rewards for actual public changes, never for mounting or inspecting a saved table. */
export function tableAccents(before: PlayerView | undefined, after: PlayerView): TableAccent[] {
  if (!before || before.gamePhase !== 'main' || after.gamePhase !== 'main' || after.gameEnded) return [];
  const accents: TableAccent[] = [];
  for (const seat of seats) {
    const old = new Map(shown(before, seat).map((card) => [card.instanceId, card]));
    for (const card of shown(after, seat)) {
      const previous = old.get(card.instanceId);
      if (card.zone === 'eddieArea' && previous?.zone !== 'eddieArea') {
        // Only one cash pulse per seat, even when an effect sells several cards.
        if (!accents.some((accent) => accent.kind === 'cash' && accent.seat === seat)) accents.push({ kind: 'cash', cardId: card.instanceId, seat });
      } else if (card.definitionId && !card.faceDown) {
        if (card.zone === 'legendArea' && previous?.faceDown) accents.push({ kind: 'legend', cardId: card.instanceId, seat });
        else if (['field', 'resolvingProgram'].includes(card.zone ?? '') && previous?.zone !== card.zone) {
          accents.push({ kind: 'land', cardId: card.instanceId, seat });
        }
      }
    }
  }
  // A mass summon should still leave the board readable.
  return accents.sort((a, b) => Number(b.kind === 'legend') - Number(a.kind === 'legend')).slice(0, 4);
}

export interface Strike {
  attackerId: string;
  /** A Unit that takes the hit. */
  targetId?: string;
  /** A Gig area that takes the hit when no Unit stands in the way. */
  targetZone?: string;
}

export interface MotionPlan {
  /** The attacker lunges and lands a hit as this frame arrives. */
  strike?: Strike;
  /** Cards that break before they leave the table. */
  defeated: string[];
  /** Rival cards presented at the centre of the table before they land. */
  showcase: string[];
  /** Anchor (`trash:rival`, `hand:rival`, `deck:player`) for each card that left the table. */
  destinations: Record<string, string>;
}

function shown(view: PlayerView, seat: Seat) {
  const zones = view.players[seat].zones;
  const drawn = seat === 'player' ? [...tableZones, 'hand'] : tableZones;
  return drawn.flatMap((zone) => Array.isArray(zones[zone]) ? zones[zone] as CardView[] : []);
}

function ownerOf(view: PlayerView | undefined, id: string): Seat | undefined {
  return view && seats.find((seat) => Object.values(view.players[seat].zones)
    .some((zone) => Array.isArray(zone) && zone.some((card) => card.instanceId === id)));
}

/**
 * Turns one public state change into movement on the table. It reads only the
 * two filtered views and the public beat, so it can never show hidden cards.
 */
export function planMotion(before: PlayerView | undefined, after: PlayerView,
  beat?: Pick<MatchBeat, 'changes' | 'source' | 'seat'>): MotionPlan {
  const plan: MotionPlan = { defeated: [], showcase: [], destinations: {} };
  if (!before) return plan;

  for (const seat of seats) {
    const remaining = new Set(shown(after, seat).map((card) => card.instanceId));
    for (const card of shown(before, seat)) {
      if (remaining.has(card.instanceId) || ownerOf(after, card.instanceId) === (seat === 'player' ? 'rival' : 'player')) continue;
      const zones = Object.entries(after.players[seat].zones);
      const next = zones.find(([, cards]) => Array.isArray(cards) && cards.some((item) => item.instanceId === card.instanceId))?.[0];
      // A card the viewer can no longer see went to a hidden pile: the rival's hand, or the owner's deck.
      const anchor = next ? pileAnchors[next] : seat === 'rival' && card.zone !== 'eddieArea' ? 'hand' : 'deck';
      if (anchor) plan.destinations[card.instanceId] = `${anchor}:${seat}`;
    }
  }

  const changes = beat?.changes ?? [];
  plan.defeated = changes.flatMap((change) => change.kind === 'defeated' && change.card ? [change.card.instanceId] : []);
  if (beat?.seat === 'rival') {
    const known = new Set(shown(before, 'rival').map((card) => card.instanceId));
    plan.showcase = changes.flatMap((change) => change.kind === 'played' && change.seat === 'rival' && change.card
      && !known.has(change.card.instanceId) ? [change.card.instanceId] : []);
  }

  const previous = before.attackState, current = after.attackState;
  const attackerId = current?.attackerId ?? previous?.attackerId;
  if (!attackerId) return plan;
  const attacking = ownerOf(after, attackerId) ?? ownerOf(before, attackerId);
  if (!attacking) return plan;
  const defending: Seat = attacking === 'player' ? 'rival' : 'player';
  if (current?.step === 'steal' && previous?.step !== 'steal') {
    // The attack got through. The hit lands on the Gigs before any are taken.
    plan.strike = { attackerId, targetZone: `gigs:${defending}` };
  } else if (previous && !current && previous.step !== 'steal') {
    const blocker = beat?.source && beat.source.zone === 'field' && beat.source.instanceId !== attackerId
      && ownerOf(before, beat.source.instanceId) === defending ? beat.source.instanceId : undefined;
    const targetId = blocker ?? previous.defenderId;
    const gigsMoved = after.players[defending].gigCount !== before.players[defending].gigCount;
    if (targetId) plan.strike = { attackerId, targetId };
    else if (gigsMoved) plan.strike = { attackerId, targetZone: `gigs:${defending}` };
  }
  return plan;
}

/** Long sequences play faster, but never so fast that a move cannot be followed. */
export function beatPace(count: number) {
  return Math.max(0.55, Math.min(1, 9 / Math.max(1, count)));
}
