import type { AugmentRarity } from './augment';
import type { NodeId } from './board';
import type { YutResult } from './yut';

export type PlayerId = string;

export const PIECES_PER_PLAYER = 4;

export type PieceState =
  | { kind: 'WAITING' }
  | { kind: 'ON_BOARD'; node: NodeId; prev: NodeId }
  | { kind: 'FINISHED' };

export interface Piece {
  id: string;
  owner: PlayerId;
  state: PieceState;
  /** Shadow clone (O-P2): finishing counts as one finish, a capture removes it. */
  clone?: boolean;
}

/** Next throw decided by an active augment. */
export interface Reservation {
  augmentId: string;
  /** Result chosen when the augment was used (A-S11, O-P1, A-P1, C-S7). */
  result?: YutResult;
  /** Opponent for a result swap (C-S4). */
  playerId?: PlayerId;
}

/** Reset at the end of every turn. */
export interface TurnStatus {
  throws: number;
  captures: number;
  yutOrMo: boolean;
  /** C-G4: may move one enemy piece this turn. */
  controlEnemy: boolean;
  /** A-P6: every finish this turn gives an extra throw. */
  endlessMarch: boolean;
  /** A-S13: the lone-piece bonus was used this turn. */
  lonelyUsed: boolean;
  /** A-G9: steps added to every forward move this turn. */
  bonus: number;
}

/** Per-player augment effect state. */
export interface PlayerStatus {
  /** Next throw forced by an augment (C-S4, C-S11, A-G3). */
  forced: YutResult | null;
  /** Steps added to the next forward move; may be negative. */
  moveBonus: number;
  /** Extra throws at the start of the next turn. */
  bonusThrows: number;
  /** Free rerolls for the next augment draft (O-S11). */
  bonusRerolls: number;
  /** Turns in a row without Yut or Mo (O-S14). */
  dryTurns: number;
  /** Throws in a row that were Do or Gae (A-G8). */
  smallStreak: number;
  /** Turns to skip (C-G10). */
  skipTurns: number;
  /** Do/Gae/Geol move backwards while regularTurnsCompleted is below this (C-S1). */
  reverseUntil: number;
  /** Players who captured one of my pieces (A-S10). */
  capturedBy: PlayerId[];
  /** One-shot passives already spent. */
  spent: string[];
  /** Take one more turn after this one (O-P6). */
  extraTurn: boolean;
  turn: TurnStatus;
}

/** Board-wide augment state. Durations count the owner's `regularTurnsCompleted`. */
export interface FieldState {
  /** O-S12: an enemy stopping here moves back two spaces. */
  traps: { node: NodeId; owner: PlayerId }[];
  /** A-G6: enemies cannot pass this node while the owner is below `until`. */
  blocks: { node: NodeId; owner: PlayerId; until: number }[];
  /** O-G5 / A-G13: the piece cannot move during its owner's turn number `turn`. */
  frozen: { pieceId: string; turn: number }[];
  /** C-G12: if one is captured the other goes home too. */
  links: { a: string; b: string; owner: PlayerId; until: number }[];
  /** C-G11: goes home once its owner reaches `until`. */
  bombs: { pieceId: string; owner: PlayerId; until: number }[];
  /** A-G11: when `target` moves, the owner's lead piece steps forward. */
  shadows: { target: string; owner: PlayerId; until: number }[];
  /** C-P5: every move is reversed while the round is below this. */
  reverseUntilRound: number;
  /** Chaos events still running (E3, E4, E7) until the round reaches `untilRound`. */
  chaosActive: { eventId: string; untilRound: number }[];
  /** Times each piece was captured (A-S12). */
  hits: Record<string, number>;
  /** Once-per-piece effects already used, as `augmentId:pieceId`. */
  pieceSpent: string[];
  /** Pieces at the start of the current turn and of the turn before (O-P5). */
  turnStart: Piece[];
  previousTurn: { playerId: PlayerId; pieces: Piece[] } | null;
  /** O-P8: two thrown results waiting for a pick. */
  choice: YutResult[] | null;
  /** The current turn is an extra turn (O-P6) and does not count. */
  bonusTurn: boolean;
  /** O-S6: captured players waiting to throw once right away, in order. */
  interruptQueue: PlayerId[];
  /** Player throwing out of turn now (O-S6), and the turn to return to afterwards. */
  interrupting: PlayerId | null;
  resume: { turn: PlayerId; throwsRemaining: number; pendingResults: YutResult[] } | null;
  /** C-S12: `by` picks the next move of `owner`. */
  delegate: { owner: PlayerId; by: PlayerId } | null;
  /** Temporary teams (E2, C-G1, C-P2); a new one replaces the old. */
  alliance: Alliance | null;
}

/**
 * Allies cannot capture each other (augment moves included) and share nodes without stacking.
 * Ends when `clock` reaches `until`: the full round for 'ROUND', otherwise that player's regular turns.
 */
export interface Alliance {
  source: 'E2' | 'C-G1' | 'C-P2';
  pairs: [PlayerId, PlayerId][];
  clock: 'ROUND' | PlayerId;
  until: number;
}

export interface Player {
  id: PlayerId;
  name: string;
  augmentIds: string[];
  /** Regular turns finished. Extra throws and bonus turns never add to this. */
  regularTurnsCompleted: number;
  /** Enemy pieces this player has sent back. */
  captures: number;
  /** Times each active augment was used. */
  augmentUses: Record<string, number>;
  /** Active augment reserved for the next throw. */
  reserved: Reservation | null;
  status: PlayerStatus;
}

/** One action in the game, newest last. `auto` marks actions taken on timeout. */
export type GameLogEntry =
  | {
      kind: 'THROW';
      playerId: PlayerId;
      result: YutResult;
      auto: boolean;
      /** Augment that decided or changed the result. */
      augmentId?: string;
      /** Result before a passive changed it. */
      from?: YutResult;
    }
  | {
      kind: 'MOVE';
      playerId: PlayerId;
      /** The piece that was moved (its stack moved with it). */
      pieceId: string;
      result: YutResult;
      captured: number;
      finished: number;
      stacked: number;
      auto: boolean;
      /** Extra steps from an augment. */
      bonus?: MoveBonus;
      /** Result used in place of the thrown one (O-S1, O-S9, A-S14, O-S15). */
      as?: YutResult;
    }
  | {
      kind: 'USE';
      playerId: PlayerId;
      augmentId: string;
      auto: boolean;
      /** Result thrown away by a rethrow. */
      discarded?: YutResult;
      /** What the active did, shown as-is. */
      detail?: string;
    }
  | {
      kind: 'AUGMENT';
      playerId: PlayerId;
      augmentId: string;
      auto: boolean;
      /** Augment given up for this one once the hand is full. */
      replaced?: string;
    }
  | {
      /** A passive or active augment did something; `detail` is shown as-is. */
      kind: 'EFFECT';
      playerId: PlayerId;
      augmentId: string;
      detail: string;
      auto: boolean;
    }
  | {
      kind: 'CHAOS';
      eventId: string;
      /** Full rounds completed when it fired. */
      round: number;
      /** Pieces the event moved. */
      pieceIds: string[];
      auto: boolean;
    };

export interface MoveBonus {
  augmentId: string;
  steps: number;
}

/** One player's candidates in an augment draft. */
export interface DraftOffer {
  /** Candidate augment ids by card slot (up to three). */
  cards: string[];
  /** Per-card reroll already used, by slot. */
  rerolled: boolean[];
  /** Extra rerolls usable on any card, even one already rerolled. */
  freeRerolls: number;
  /** Cards rerolled away; never offered again in this draft. */
  discarded: string[];
  picked: string | null;
  /** Augment to give up for the pick when the hand is full. */
  replace: string | null;
  /** Kept the current hand (only with a full hand). */
  passed: boolean;
  /** Picked by the server on timeout. */
  auto: boolean;
}

/** Everyone picks one augment at the same time; the game waits. */
export interface Draft {
  /** 0 at game start, then one per round. */
  index: number;
  /** One rarity for everyone in this draft. */
  rarity: AugmentRarity;
  offers: Record<PlayerId, DraftOffer>;
}

export type GamePhase = 'LOBBY' | 'AUGMENT_PICK' | 'THROW' | 'CHOOSE' | 'MOVE' | 'FINISHED';

export interface GameState {
  roomId: string;
  phase: GamePhase;
  players: Player[];
  pieces: Piece[];
  turn: PlayerId | null;
  /** Throws left in the current turn (Yut, Mo and captures add one). */
  throwsRemaining: number;
  /** Results thrown but not yet used for a move. */
  pendingResults: YutResult[];
  winner: PlayerId | null;
  throwCount: number;
  log: GameLogEntry[];
  /** Open augment draft while phase is AUGMENT_PICK. */
  draft: Draft | null;
  /** Drafts finished so far. */
  draftsDone: number;
  /** Chaos events fired so far, and the last one (not drawn twice in a row). */
  chaosDone: number;
  lastChaos: string | null;
  field: FieldState;
}

export function newTurnStatus(): TurnStatus {
  return {
    throws: 0,
    captures: 0,
    yutOrMo: false,
    controlEnemy: false,
    endlessMarch: false,
    lonelyUsed: false,
    bonus: 0,
  };
}

export function newPlayerStatus(): PlayerStatus {
  return {
    forced: null,
    moveBonus: 0,
    bonusThrows: 0,
    bonusRerolls: 0,
    dryTurns: 0,
    smallStreak: 0,
    skipTurns: 0,
    reverseUntil: 0,
    capturedBy: [],
    spent: [],
    extraTurn: false,
    turn: newTurnStatus(),
  };
}

export function newFieldState(pieces: Piece[]): FieldState {
  return {
    traps: [],
    blocks: [],
    frozen: [],
    links: [],
    bombs: [],
    shadows: [],
    reverseUntilRound: 0,
    chaosActive: [],
    hits: {},
    pieceSpent: [],
    turnStart: pieces,
    previousTurn: null,
    choice: null,
    bonusTurn: false,
    interruptQueue: [],
    interrupting: null,
    resume: null,
    delegate: null,
    alliance: null,
  };
}

/** A rule violation. The message is shown to the player as-is. */
export class RuleError extends Error {
  override name = 'RuleError';
}
