export type Seat = 'player' | 'rival';

export interface MatchDeck {
  name: string;
  legends: string[];
  mainDeck: string[];
}

export interface MatchSetup {
  player: MatchDeck;
  rival: MatchDeck;
}

export interface CardView {
  instanceId: string;
  definitionId: string;
  cardName: string | null;
  faceDown: boolean;
  spent: boolean;
  power: number;
  effectivePower: number;
  cost: number | null;
}

export interface SeatView {
  firstPlayer: boolean;
  zones: Record<string, CardView[] | number>;
  eddies: number;
  availableEddies: number;
  gigCount: number;
  streetCred: number;
}

export interface Move {
  move: string;
  args?: Record<string, unknown>;
}

export interface Prompt {
  status: 'idle' | 'action' | 'choice' | 'waiting';
  availableMoves: { moveId: string; inputSpec: { type: string; [field: string]: unknown } }[];
  choice: { type: string; [field: string]: unknown } | null;
}

export interface PlayerView {
  players: Record<Seat, SeatView>;
  gamePhase: string;
  turnNumber: number;
  activePlayerId: Seat;
  overtimeActive: boolean;
  gameEnded: boolean;
  winnerId: Seat | null;
  winReason: string | null;
  stateID: number;
  prompt: Prompt;
}

export interface MatchSnapshot {
  matchId: string;
  view: PlayerView;
  /** Slots a seat has legally peeked at. Identity is only in the transient peek. */
  knownLegends: { instanceId: string; seat: Seat }[];
  peeks: CardView[];
}

export type MatchAction =
  | { type: 'start'; setup: MatchSetup }
  | { type: 'move'; matchId: string; stateID: number; move: Move }
  | { type: 'rematch'; matchId: string };

export interface MatchRequest { id: number; action: MatchAction }

export type MatchResponse =
  | { id: number; snapshot: MatchSnapshot }
  | { id: number; error: string };
