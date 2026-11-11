import type { DeckDraft } from '../deckDraft';

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
  effectiveCost?: number | null;
  zone?: string;
  type?: string | null;
  damage?: number;
  hasLag?: boolean;
  grantedRules?: string[];
  attachedToId?: string | null;
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

export interface PaymentPrompt {
  legendIds: string[];
  eddieIds: string[];
  eddies: number;
  costs: Record<string, Record<string, { amount: number; reservedLegendIds?: string[] }>>;
  effectGearHosts: Record<string, string[]>;
}

export interface Prompt {
  status: 'idle' | 'action' | 'choice' | 'waiting';
  availableMoves: { moveId: string; inputSpec: { type: string; [field: string]: unknown } }[];
  choice: { type: string; [field: string]: unknown } | null;
  payment?: PaymentPrompt;
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
  attackState?: { attackerId: string; defenderId?: string; step: string; rivalId?: Seat } | null;
}

export interface MatchLogEntry { id: number; turn: number; seat: Seat; text: string }

export interface GigRoll {
  dieId: string;
  dieType: string;
  result: number;
  seat: Seat;
  origin: 'gainGig' | 'reroll';
  fixerIndex?: number;
  decisive?: boolean;
}

export interface MatchFrame {
  view: PlayerView;
  /** Only identities legally revealed to this viewer may enter a frame. */
  knownLegends: { instanceId: string; seat: Seat }[];
  peeks: CardView[];
  log: MatchLogEntry[];
  gigRolls: GigRoll[];
}

export interface MatchChange {
  kind: 'played' | 'called' | 'moved' | 'defeated' | 'power' | 'gigs' | 'cred' | 'eddies';
  seat: Seat;
  label: string;
  card?: CardView;
  amount?: number;
}

export interface MatchBeat extends MatchFrame {
  id: number;
  seat: Seat;
  text: string;
  source?: CardView;
  targetIds: string[];
  changes: MatchChange[];
}

/** Running public facts about a match, kept with the saved game. */
export interface MatchTally {
  /** Gig counts at the end of each turn so far. */
  gigs: { turn: number; player: number; rival: number }[];
  /** The turn each card now in the player's hand arrived. */
  held: Record<string, number>;
  played: number;
  sold: number;
  lost: Record<Seat, number>;
}

/** What the player sees when the match ends. Built only from their own view of it. */
export interface MatchReport {
  turns: number;
  gigs: MatchTally['gigs'];
  played: number;
  sold: number;
  lost: Record<Seat, number>;
  /** Cards still in hand at the end that had been there for several turns. */
  stuck: { card: CardView; copies: number; turns: number }[];
}

export interface MatchSnapshot extends MatchFrame {
  matchId: string;
  names: Record<Seat, string>;
  /** Transient public presentation. Never saved in the engine checkpoint. */
  presentation?: { beats: MatchBeat[]; feedback?: MatchBeat };
  /** Present once the match has ended. */
  report?: MatchReport;
}

export type MatchAction =
  | { type: 'start'; setup: MatchSetup; draft?: DeckDraft; replaceMatchId?: string }
  | { type: 'resume' }
  | { type: 'move'; matchId: string; stateID: number; move: Move }
  | { type: 'rematch'; matchId: string; stateID: number };

export interface MatchRequest { id: number; action: MatchAction }
export interface ScopedMatchRequest extends MatchRequest { scope: string }

export interface MatchSummary {
  matchId: string;
  ended: boolean;
  draft?: DeckDraft;
}

export type MatchResponse =
  | { id: number; snapshot: MatchSnapshot }
  | { id: number; error: string };
