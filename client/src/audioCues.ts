import type { GameLogEntry, GamePhase, RoomView } from '@yut/shared';

/** Which sound plays when; kept free of the DOM so it can be tested. */

export type Loop = 'lobby' | 'game' | 'augment';
export type Effect = 'throw' | 'move' | 'capture' | 'finish' | 'augment' | 'chaos';
export type Outcome = 'victory' | 'defeat';

export interface Levels {
  muted: boolean;
  /** 0-1 */
  bgm: number;
  /** 0-1 */
  sfx: number;
}

/** Music cues sit a little above the loops (default BGM 0.4 -> cue 0.5). */
const STING_BOOST = 1.25;
/** Chaos plays the sting and the effect together, both lowered so the sum stays clear of clipping. */
export const CHAOS_MIX = { effect: 0.6, sting: 0.4 } as const;

export function effectVolume(levels: Levels, scale = 1): number {
  return levels.muted ? 0 : Math.min(1, levels.sfx * scale);
}

export function stingVolume(levels: Levels, scale = 1): number {
  return levels.muted ? 0 : Math.min(1, levels.bgm * STING_BOOST) * scale;
}

/** Background loop for the screen; none on the result screen. */
export function loopFor(room: RoomView | null): Loop | null {
  const phase = room?.game?.phase;
  if (phase === 'FINISHED') return null;
  if (phase === 'AUGMENT_PICK') return 'augment';
  return room?.game ? 'game' : 'lobby';
}

function effectOf(entry: GameLogEntry): Effect | null {
  switch (entry.kind) {
    case 'THROW':
      return 'throw';
    case 'MOVE':
      return entry.captured > 0 ? 'capture' : entry.finished > 0 ? 'finish' : 'move';
    case 'USE':
    case 'EFFECT':
      return 'augment';
    case 'CHAOS':
      return 'chaos';
    default:
      return null;
  }
}

/** One sound per kind for a batch of new log entries, strongest first. */
export function effectsFor(entries: readonly GameLogEntry[]): Effect[] {
  const kinds = new Set(entries.flatMap((e) => effectOf(e) ?? []));
  return (['chaos', 'capture', 'finish', 'move', 'throw', 'augment'] as const).filter((k) => kinds.has(k));
}

/**
 * Result cue for this player, only when they saw the game end
 * (opening an already finished room, e.g. after a reload, plays nothing).
 */
export function outcomeFor(previous: GamePhase | null, room: RoomView | null, me: string | null): Outcome | null {
  const game = room?.game;
  if (game?.phase !== 'FINISHED' || previous === null || previous === 'FINISHED') return null;
  return game.winner === me ? 'victory' : 'defeat';
}
