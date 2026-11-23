import type { CardView, FightResult, Move, PlayerView, Seat } from '../../src/lib/play/protocol';

interface Definition {
  id: string;
  legality: string;
  abilities: { text?: string }[];
  type: string;
}

interface Catalog {
  get(key: string): Definition | undefined;
}

export interface EngineState {
  ctx: { stateID: number; rngState?: { state: number } };
  G: {
    players: Record<Seat, { zones: Record<string, string[]> }>;
    cardIndex: Record<string, { definitionId: string }>;
  };
}

export type EngineEvent =
  | { type: 'cardDefeated'; cardId: string; defeatedBy?: string | null }
  | { type: 'attackResolved'; attackKind: string; attackerId: string; defenderId?: string; result?: FightResult }
  | { type: 'blockerActivated'; playerId: Seat; attackerId: string; blockerId: string; originalTarget: string | null }
  | { type: 'actionLog'; category?: string; messageKey: string; cardIds?: string[]; params?: Record<string, unknown> }
  | { type: 'cardPlayed'; cardId: string }
  | { type: 'cardsDrawn'; playerId: Seat; count: number }
  | { type: 'cardSold' | 'legendFlipped' | 'turnStarted' | 'legendsShuffled'; playerId: Seat }
  | { type: 'gigStolen'; fromPlayerId: Seat; toPlayerId: Seat }
  | { type: 'cardsRevealed'; cardIds: string[]; fromZone: string; audience: 'private' | 'public'; playerId: Seat; viewers?: Seat[] }
  | { type: 'gigDieRolled'; dieId: string; dieType: string; result: number; playerId: Seat; origin: 'gainGig' | 'reroll' }
  | { type: 'other' };

export function pairCount(values: readonly number[]): number;
export function isReadyBlocker(card: CardView): boolean;
export function directStealPotential(power: number, oneFewer?: boolean): number;
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
  rollDie(type: string): number;
  getState(): { state: number };
  setState(state: { state: number }): void;
}

export interface DeckStrategyProfile {
  deckId: string;
  plan: string;
  coreCards: readonly string[];
  mulligan?: {
    cheapUnitCost: number;
    minCheapUnits: number;
    minSellable: number;
    congestionNames?: string[];
    congestionMinCopies?: number;
  };
  gearHosts?: Record<string, string[]>;
  gearHostTypes?: Record<string, 'unit' | 'legend'>;
  blockDirectStealsAtLeast?: number;
  curveSellCards?: string[];
  pacing?: 'develop-first' | 'attack-first';
  preferSecond?: boolean;
  developLegends?: boolean;
  detonateForGigDefense?: boolean;
}

/** Every strategy decides from the seat's filtered view. The tactical ones also need `engine` to look ahead. */
export function chooseMove(view: PlayerView, rng: () => number, seat: Seat,
  options?: { strategy?: 'greedy' | 'tactical' | 'tactical-ability-aware'; engine?: EngineHandle; profile?: DeckStrategyProfile; deckTypePrior?: Readonly<Record<string, number>> }): Move | undefined;
/** Printed details retained only after a legally observed reveal. */
export interface EngineCardView extends CardView {
  color: string;
  classifications: string[];
  hasSellTag: boolean;
  keywords: string[];
  triggerHints: string[];
  abilityHints: {
    abilityIndex: number; timing: string; event: string | null; effects: string[];
    conditionThresholds: { condition: string; minCount?: number }[];
  }[];
}
export function projectRevealedCardView(state: EngineState, instanceId: string): EngineCardView | null;
