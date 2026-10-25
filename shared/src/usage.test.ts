import { describe, expect, it } from 'vitest';
import { usesLeft } from './actives';
import { AUGMENTS } from './augment';
import { openDraft } from './draft';
import type { GameState, PieceState, PlayerId } from './game';
import { movePiece, startGame, throwYut } from './turn';
import { USAGE_LIMITS } from './usage';
import type { YutResult } from './yut';

/** Cycles through the given values. */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

const GAE = [0.1, 0.1, 0.9, 0.9];
const at = (node: number, prev: number): PieceState => ({ kind: 'ON_BOARD', node, prev });

function game(aug: Record<PlayerId, string[]> = {}, place: Record<string, PieceState> = {}, pending?: YutResult[]): GameState {
  const base = startGame('r', [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }]);
  return {
    ...base,
    players: base.players.map((p) => ({ ...p, augmentIds: aug[p.id] ?? [] })),
    pieces: base.pieces.map((p) => (place[p.id] ? { ...p, state: place[p.id]! } : p)),
    ...(pending ? { phase: 'MOVE' as const, pendingResults: pending, throwsRemaining: 0 } : {}),
  };
}

const player = (s: GameState, id: PlayerId) => s.players.find((p) => p.id === id)!;
/** a throws again from a fresh turn with the given rolls. */
const throwAgain = (s: GameState, rolls: number[]) =>
  throwYut({ ...s, turn: 'a', phase: 'THROW', throwsRemaining: 1, pendingResults: [] }, 'a', seq(...rolls));

describe('usage limits table', () => {
  it('gives every one of the 108 augments 1 to 3 uses (52 / 31 / 25)', () => {
    expect(Object.keys(USAGE_LIMITS).sort()).toEqual(AUGMENTS.map((a) => a.id).sort());
    const counts = [1, 2, 3].map((n) => Object.values(USAGE_LIMITS).filter((v) => v === n).length);
    expect(counts).toEqual([52, 31, 25]);
  });

  it('gives every prism augment exactly one use', () => {
    const prism = AUGMENTS.filter((a) => a.rarity === 'PRISM');
    expect(prism).toHaveLength(24);
    expect(prism.filter((a) => USAGE_LIMITS[a.id] !== 1).map((a) => a.id)).toEqual([]);
  });
});

describe('passive uses', () => {
  it('a chance passive counts only its hits and leaves after the last one', () => {
    let s = game({ a: ['O-S4'] });
    s = throwAgain(s, [...GAE, 0.9]); // miss: no use
    expect(player(s, 'a').augmentUses['O-S4']).toBeUndefined();
    for (let i = 0; i < 3; i++) s = throwAgain(s, [...GAE, 0.1]);
    expect(player(s, 'a').augmentIds).toEqual([]);
    expect(player(s, 'a').retired).toEqual(['O-S4']);
    expect(throwAgain(s, [...GAE, 0.1]).pendingResults).toEqual(['GAE']);
  });

  it('a chance defence uses a charge on every try', () => {
    const s = game({ b: ['A-S2'] }, { 'a-0': at(2, 1), 'b-0': at(4, 3) }, ['GAE']);
    const missed = movePiece(s, 'a', { pieceId: 'a-0', result: 'GAE' }, seq(0.9));
    expect(player(missed, 'b').augmentUses['A-S2']).toBe(1);
  });

  it('choosing another result spends the passive, keeping the throw does not', () => {
    const s = game({ a: ['O-S9'] }, {}, ['DO']);
    expect(player(movePiece(s, 'a', { pieceId: 'a-0', result: 'DO' }), 'a').augmentUses['O-S9']).toBeUndefined();
    const used = movePiece(s, 'a', { pieceId: 'a-0', result: 'DO', as: 'GAE' });
    expect(player(used, 'a').retired).toEqual(['O-S9']);
    // Shown in the log like any other passive that fired.
    expect(used.log.find((e) => e.kind === 'EFFECT')).toMatchObject({ playerId: 'a', augmentId: 'O-S9', detail: '도를 개로 사용' });
  });

  it('O-S7 counts only when passing a corner really took a shortcut', () => {
    const passing = movePiece(game({ a: ['O-S7'] }, { 'a-0': at(4, 3) }, ['GAE']), 'a', { pieceId: 'a-0', result: 'GAE' });
    expect(player(passing, 'a').retired).toEqual(['O-S7']);
    const plain = movePiece(game({ a: ['O-S7'] }, { 'a-0': at(1, 0) }, ['DO']), 'a', { pieceId: 'a-0', result: 'DO' });
    expect(player(plain, 'a').augmentIds).toEqual(['O-S7']);
  });

  it('a move bonus spends its passive; a used-up one adds nothing', () => {
    let s = game({ a: ['O-S2'] }, {}, ['DO']);
    for (let i = 0; i < 3; i++) {
      s = movePiece({ ...s, turn: 'a', phase: 'MOVE', pendingResults: ['DO'], throwsRemaining: 0 }, 'a', { pieceId: `a-${i}`, result: 'DO' });
    }
    expect(player(s, 'a').retired).toEqual(['O-S2']);
    const fourth = movePiece({ ...s, turn: 'a', phase: 'MOVE', pendingResults: ['DO'], throwsRemaining: 0 }, 'a', { pieceId: 'a-3', result: 'DO' });
    expect(fourth.pieces.find((p) => p.id === 'a-3')?.state).toEqual(at(1, 0));
  });

  it('shows uses left for passives and actives alike', () => {
    const s = game({ a: ['O-S4', 'O-S13'] });
    expect([usesLeft(player(s, 'a'), 'O-S4'), usesLeft(player(s, 'a'), 'O-S13')]).toEqual([3, 2]);
  });
});

describe('used-up augments in drafts', () => {
  it('are never offered again in the same game', () => {
    const base = startGame('r', [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }]);
    const silver = AUGMENTS.filter((a) => a.enabled && a.rarity === 'SILVER').map((a) => a.id);
    const retired = silver.slice(0, -3);
    const s = openDraft({ ...base, players: base.players.map((p) => (p.id === 'a' ? { ...p, retired } : p)) }, seq(0.1, 0.5));
    expect([...s.draft!.offers.a!.cards].sort()).toEqual(silver.slice(-3).sort());
  });
});
