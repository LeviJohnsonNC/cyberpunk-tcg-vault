import type { CardView, Move, PlayerView, Seat } from '../../src/lib/play/protocol';

interface Definition {
  id: string;
  legality: string;
}

interface Catalog {
  get(key: string): Definition | undefined;
}

export interface EngineState {
  G: {
    players: Record<Seat, { zones: Record<string, string[]> }>;
    cardIndex: Record<string, { definitionId: string }>;
  };
}

export type EngineEvent =
  | { type: 'cardsRevealed'; cardIds: string[]; fromZone: string; audience: 'private' | 'public'; playerId: Seat; viewers?: Seat[] }
  | { type: 'other' };

export function createCardCatalog(): Catalog;

export function createMatchState(options: {
  players: { id: Seat; name: string }[];
  deckLists: { playerId: Seat; playerName: string; legends: string[]; mainDeck: string[] }[];
  catalog: Catalog;
  seed: string;
  matchId?: string;
  manualPaymentPlayerId?: Seat;
}): EngineState;

export class LocalEngine {
  constructor(initialState: EngineState);
  getState(): EngineState;
  getFilteredView(seat: Seat): PlayerView;
  processCommand(command: { commandID: string; move: string; input?: { args: Record<string, unknown> } }, seat: Seat):
    | { success: true; state: EngineState; gameEvents: EngineEvent[] }
    | { success: false; error: string };
}

export class SeededRNG {
  constructor(seed: string);
  next(): number;
}

export function chooseMove(view: PlayerView, rng: () => number, seat: Seat): Move | undefined;
export function projectRevealedCardView(state: EngineState, instanceId: string): CardView | null;
