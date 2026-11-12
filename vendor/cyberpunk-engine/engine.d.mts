import type { CardView, FightResult, Move, PlayerView, Seat } from '../../src/lib/play/protocol';

interface Definition {
  id: string;
  legality: string;
}

interface Catalog {
  get(key: string): Definition | undefined;
}

export interface EngineState {
  ctx: { stateID: number };
  G: {
    players: Record<Seat, { zones: Record<string, string[]> }>;
    cardIndex: Record<string, { definitionId: string }>;
  };
}

export type EngineEvent =
  | { type: 'cardDefeated'; cardId: string; defeatedBy?: string | null }
  | { type: 'attackResolved'; attackKind: string; attackerId: string; defenderId?: string; result?: FightResult }
  | { type: 'cardPlayed'; cardId: string }
  | { type: 'cardsRevealed'; cardIds: string[]; fromZone: string; audience: 'private' | 'public'; playerId: Seat; viewers?: Seat[] }
  | { type: 'gigDieRolled'; dieId: string; dieType: string; result: number; playerId: Seat; origin: 'gainGig' | 'reroll' }
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

type Command = { commandID: string; move: string; input?: { args: Record<string, unknown> } };

/** What a look-ahead strategy may touch: filtered views, legal prompts, and forks to try its own moves on. */
export interface EngineHandle {
  getFilteredView(seat: Seat): PlayerView;
  getPrompt(seat: Seat): PlayerView['prompt'];
  processCommand(command: Command, seat: Seat): { success: boolean };
  fork(): EngineHandle;
}

export class LocalEngine {
  constructor(initialState: EngineState);
  getState(): EngineState;
  getFilteredView(seat: Seat): PlayerView;
  getPrompt(seat: Seat): PlayerView['prompt'];
  fork(): LocalEngine;
  processCommand(command: Command, seat: Seat):
    | { success: true; state: EngineState; gameEvents: EngineEvent[] }
    | { success: false; error: string };
}

export class SeededRNG {
  constructor(seed: string);
  next(): number;
  getState(): { state: number };
  setState(state: { state: number }): void;
}

/** Every strategy decides from the seat's filtered view. The tactical ones also need `engine` to look ahead. */
export function chooseMove(view: PlayerView, rng: () => number, seat: Seat,
  options?: { strategy?: 'greedy' | 'tactical' | 'tactical-ability-aware'; engine?: EngineHandle }): Move | undefined;
export function projectRevealedCardView(state: EngineState, instanceId: string): CardView | null;
