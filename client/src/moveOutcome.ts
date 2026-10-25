import { augmentById, type GameLogEntry } from '@yut/shared';

export interface MoveOutcome {
  tone: 'CAPTURE' | 'BLOCKED' | 'FINISH' | 'EFFECT';
  title: string;
  /** Augments that fired during the move, one line each. */
  lines: string[];
}

const augmentName = (id: string) => augmentById(id)?.name ?? id;

/** Augments that keep a landed-on piece from going home (see `protect` in shared/play.ts). */
const DEFENCES = new Set(['O-S5', 'O-G10', 'O-P3', 'A-G4', 'C-S14', 'A-S2', 'A-P3']);

/**
 * What happened on the move at `index`: captures, defences and goals, with the augment effects
 * logged in the same server update (most come right before the MOVE entry). Null for a plain move.
 */
export function moveOutcome(
  log: readonly GameLogEntry[],
  times: readonly number[],
  index: number,
  nameOf: (id: string) => string,
): MoveOutcome | null {
  const move = log[index];
  if (move?.kind !== 'MOVE') return null;
  const effectAt = (i: number) => {
    const entry = log[i];
    return entry?.kind === 'EFFECT' && times[i] === times[index] ? entry : null;
  };
  let start = index;
  while (effectAt(start - 1)) start--;
  let end = index;
  while (effectAt(end + 1)) end++;
  const effects: Extract<GameLogEntry, { kind: 'EFFECT' }>[] = [];
  for (let i = start; i <= end; i++) {
    const entry = effectAt(i);
    if (entry) effects.push(entry);
  }
  const lines = effects.map((e) => `${nameOf(e.playerId)} · ${augmentName(e.augmentId)}: ${e.detail}`);
  const mover = nameOf(move.playerId);
  // Failed chance defences are logged too, but then the capture goes through.
  const defence = move.captured === 0 ? effects.find((e) => DEFENCES.has(e.augmentId) && !e.detail.includes('실패')) : undefined;

  if (move.captured > 0) return { tone: 'CAPTURE', title: `${mover}님이 말 ${move.captured}개를 잡았어요!`, lines };
  if (defence) {
    return { tone: 'BLOCKED', title: `${nameOf(defence.playerId)}님이 '${augmentName(defence.augmentId)}' 증강으로 잡기를 막았어요`, lines };
  }
  if (move.finished > 0) return { tone: 'FINISH', title: `${mover}님 말 ${move.finished}개 골인!`, lines };
  if (lines.length > 0) return { tone: 'EFFECT', title: `${mover}님의 이동`, lines };
  return null;
}
