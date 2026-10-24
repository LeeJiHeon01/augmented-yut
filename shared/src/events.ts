import type { AugmentTarget } from './actives';
import type { Move } from './moves';
import type { YutResult } from './yut';
import type { PieceColor, RoomState } from './room';

export type AckResult = { ok: true; code: string } | { ok: false; error: string };
export type Ack = (result: AckResult) => void;

/** Room as sent to clients, with timer and timing info. Times are server epoch ms. */
export interface RoomView extends RoomState {
  /** When the current action times out, or null outside a running game. */
  deadline: number | null;
  /** Server clock at send time, so clients can correct their own clock. */
  serverNow: number;
  startedAt: number | null;
  finishedAt: number | null;
  /** When each `game.log` entry happened (same index). */
  logTimes: number[];
  /** Players who already picked in the open draft. Each player only receives their own offer. */
  draftPicked: string[];
}

export interface ServerToClientEvents {
  room: (room: RoomView | null) => void;
  /** Sent on connect. Keep `token` (secret) to come back to the same seat; `playerId` is public. */
  session: (session: { token: string; playerId: string }) => void;
  error: (message: string) => void;
}

export interface ClientToServerEvents {
  createRoom: (payload: { name: string }, ack: Ack) => void;
  joinRoom: (payload: { code: string; name: string }, ack: Ack) => void;
  leaveRoom: () => void;
  setColor: (color: PieceColor) => void;
  setReady: (ready: boolean) => void;
  startGame: () => void;
  throwYut: () => void;
  movePiece: (move: Move) => void;
  /** Pick one of my draft candidates; with six augments, `replace` is the one to give up. */
  pickAugment: (augmentId: string, replace?: string) => void;
  /** Keep a full hand of six instead of picking. */
  passAugment: () => void;
  /** Reroll the draft card in this slot (0-2). */
  rerollAugment: (slot: number) => void;
  /** Use one of my active augments; some need a target. */
  useAugment: (augmentId: string, target?: AugmentTarget) => void;
  /** O-G1: split a pending result into two (Geol -> Do + Gae). */
  splitResult: (payload: { result: YutResult; first: YutResult }) => void;
  /** O-P8: keep one of the two thrown results. */
  chooseThrow: (index: number) => void;
  backToLobby: () => void;
}
