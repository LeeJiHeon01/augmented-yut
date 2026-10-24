import { describe, expect, it } from 'vitest';
import type { GameState, PieceState, PlayerId } from './game';
import { activate, autoAct, movePiece, startGame, throwYut } from './turn';
import type { YutResult } from './yut';

/** Cycles through the given values. */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

const at = (node: number, prev: number): PieceState => ({ kind: 'ON_BOARD', node, prev });
const WAIT: PieceState = { kind: 'WAITING' };
const DONE: PieceState = { kind: 'FINISHED' };
const GAE_STICKS = [0.1, 0.1, 0.9, 0.9];
const BACKDO_STICKS = [0.1, 0.9, 0.9, 0.9];

function game(aug: Record<PlayerId, string[]> = {}, place: Record<string, PieceState> = {}, pending?: YutResult[]): GameState {
  const base = startGame('r', [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }]);
  return {
    ...base,
    players: base.players.map((p) => ({ ...p, augmentIds: aug[p.id] ?? [] })),
    pieces: base.pieces.map((p) => (place[p.id] ? { ...p, state: place[p.id]! } : p)),
    ...(pending ? { phase: 'MOVE' as const, pendingResults: pending, throwsRemaining: 0 } : {}),
  };
}

const stateOf = (s: GameState, id: string) => s.pieces.find((p) => p.id === id)?.state;
const lastThrow = (s: GameState) => s.log.filter((e) => e.kind === 'THROW').at(-1);

describe('augment collisions', () => {
  it('a forced throw is never boosted by a chance passive', () => {
    const s = activate(game({ a: ['C-S11', 'O-S4'] }), 'a', 'C-S11');
    expect(lastThrow(throwYut(s, 'a', seq(...GAE_STICKS, 0.1)))?.result).toBe('BACKDO');
  });

  it('an augment move meets the target’s capture defence but earns no reward', () => {
    const s = game({ a: ['C-S8', 'A-G5'], b: ['A-G4'] }, { 'a-0': at(1, 0), 'b-0': at(3, 2), 'b-1': at(9, 8) });
    const t = activate(s, 'a', 'C-S8', { pieceId: 'a-0', otherPieceId: 'b-1' });
    expect(stateOf(t, 'b-0')).toEqual(at(3, 2));
    expect(t.players.find((p) => p.id === 'b')?.augmentUses['A-G4']).toBe(1);
    const a = t.players.find((p) => p.id === 'a')!;
    expect([a.captures, a.status.moveBonus]).toEqual([0, 0]);
  });

  it('an augment capture without defence sends the piece home with no reward and no capture count', () => {
    const s = game({ a: ['C-S8', 'O-S11'], b: ['O-S6'] }, { 'a-0': at(1, 0), 'b-0': at(3, 2), 'b-1': at(9, 8) });
    const t = activate(s, 'a', 'C-S8', { pieceId: 'a-0', otherPieceId: 'b-1' });
    expect(stateOf(t, 'b-0')).toEqual(WAIT);
    const a = t.players.find((p) => p.id === 'a')!;
    expect([a.captures, a.status.bonusRerolls, t.throwsRemaining]).toEqual([0, 0, 1]);
    expect(t.players.find((p) => p.id === 'b')!.status.bonusThrows).toBe(0);
  });

  it('dodges and survivals also work against augment moves', () => {
    const s = game({ a: ['C-S6'], b: ['A-P3'] }, { 'a-0': at(5, 4), 'b-0': at(8, 7) });
    const t = activate(s, 'a', 'C-S6', { pieceId: 'a-0' }, seq(0.9));
    expect(stateOf(t, 'b-0')).toEqual(at(8, 7));
  });

  it('direct sends home ignore capture defences', () => {
    const s = game({ a: ['C-P1'], b: ['A-G4', 'A-P3'] }, { 'b-0': at(8, 7) });
    expect(stateOf(activate(s, 'a', 'C-P1'), 'b-0')).toEqual(WAIT);
  });

  it('swapping a stacked piece moves only that piece', () => {
    const s = game({ a: ['C-G3'] }, { 'a-0': at(6, 5), 'a-1': at(6, 5), 'b-0': at(12, 11) });
    const t = activate(s, 'a', 'C-G3', { pieceId: 'a-1', otherPieceId: 'b-0' });
    expect([stateOf(t, 'a-0'), stateOf(t, 'a-1'), stateOf(t, 'b-0')]).toEqual([at(6, 5), at(12, 11), at(6, 5)]);
  });

  it('a trap only fires on a stop, also on a shortcut node', () => {
    const trapped = { ...game({}, { 'b-0': at(5, 4) }), field: { ...game().field, traps: [{ node: 20, owner: 'a' }] } };
    const passing = movePiece({ ...trapped, turn: 'b', phase: 'MOVE', pendingResults: ['GAE'], throwsRemaining: 0 }, 'b', { pieceId: 'b-0', result: 'GAE' });
    expect(stateOf(passing, 'b-0')).toEqual(at(21, 20));
    expect(passing.field.traps).toHaveLength(1);
    const stopping = movePiece({ ...trapped, turn: 'b', phase: 'MOVE', pendingResults: ['DO'], throwsRemaining: 0 }, 'b', { pieceId: 'b-0', result: 'DO' });
    expect(stateOf(stopping, 'b-0')).toMatchObject({ node: 4 });
    expect(stopping.field.traps).toHaveLength(0);
  });

  it('an extra turn still comes after a timed-out throw', () => {
    const s = activate(game({ a: ['O-P6'] }), 'a', 'O-P6');
    const t = autoAct(s, seq(...BACKDO_STICKS));
    expect(t.turn).toBe('a');
    expect(t.field.bonusTurn).toBe(true);
  });

  it('a finishing clone counts nothing when its owner has no unfinished piece left', () => {
    const s = game({ a: ['O-P2'] }, { 'a-0': at(18, 17), 'a-1': DONE, 'a-2': DONE, 'a-3': DONE });
    const cloned = activate(s, 'a', 'O-P2', { pieceId: 'a-0' });
    const t = movePiece({ ...cloned, phase: 'MOVE', pendingResults: ['GEOL'], throwsRemaining: 0 }, 'a', { pieceId: 'a-0', result: 'GEOL' });
    expect(t.winner).toBe('a');
    expect(t.pieces.some((p) => p.clone)).toBe(false);
  });

  it('usurping the leader’s finishes takes the gap at once (it cannot reach four, the leader would have won)', () => {
    const s = game({ a: ['C-P7'] }, { 'a-0': DONE, 'b-0': DONE, 'b-1': DONE, 'b-2': DONE, 'b-3': at(18, 17) });
    const t = activate(s, 'a', 'C-P7');
    expect(t.pieces.filter((p) => p.owner === 'a' && p.state.kind === 'FINISHED')).toHaveLength(3);
    expect(t.pieces.filter((p) => p.owner === 'b' && p.state.kind === 'FINISHED')).toHaveLength(1);
    expect(t.winner).toBeNull();
  });
});

describe('augments sharing another augment’s rule', () => {
  const capture = (aug: Record<PlayerId, string[]>, place: Record<string, PieceState> = {}) =>
    movePiece(game(aug, { 'a-0': at(2, 1), 'b-0': at(4, 3), ...place }, ['GAE']), 'a', { pieceId: 'a-0', result: 'GAE' });

  it('A-S1 adds a space when entering, stacking with O-S2', () => {
    const one = movePiece(game({ a: ['A-S1'] }, {}, ['DO']), 'a', { pieceId: 'a-0', result: 'DO' });
    expect(stateOf(one, 'a-0')).toEqual(at(2, 1));
    const both = movePiece(game({ a: ['A-S1', 'O-S2'] }, {}, ['DO']), 'a', { pieceId: 'a-0', result: 'DO' });
    expect(stateOf(both, 'a-0')).toEqual(at(3, 2));
  });

  it('A-S8 rethrows like O-S3', () => {
    const thrown = throwYut(game({ a: ['A-S8'] }), 'a', seq(...GAE_STICKS));
    const t = activate(thrown, 'a', 'A-S8');
    expect(t.phase).toBe('THROW');
    expect(t.pendingResults).toEqual([]);
  });

  it('A-S14 lets Backdo be used as Do', () => {
    const s = game({ a: ['A-S14'] }, { 'a-0': at(3, 2) }, ['BACKDO']);
    expect(stateOf(movePiece(s, 'a', { pieceId: 'a-0', result: 'BACKDO', as: 'DO' }), 'a-0')).toEqual(at(4, 3));
  });

  it('O-G2 sends only one piece of a captured stack home', () => {
    const t = capture({ b: ['O-G2'] }, { 'b-1': at(4, 3) });
    expect([stateOf(t, 'b-0'), stateOf(t, 'b-1')]).toEqual([WAIT, at(4, 3)]);
  });

  it('A-G13 freezes the capturing piece like O-G5', () => {
    expect(capture({ b: ['A-G13'] }).field.frozen).toEqual([{ pieceId: 'a-0', turn: 1 }]);
  });

  it('C-G12 links my piece to an enemy piece for two of my turns', () => {
    const s = activate(game({ a: ['C-G12'] }, { 'a-0': at(6, 5), 'b-0': at(9, 8) }), 'a', 'C-G12', { pieceId: 'a-0', otherPieceId: 'b-0' });
    expect(s.field.links).toEqual([{ a: 'a-0', b: 'b-0', owner: 'a', until: 2 }]);
  });

  it('A-P1 fixes the next throw, twice per game', () => {
    let s = activate(game({ a: ['A-P1'] }), 'a', 'A-P1', { result: 'YUT' });
    s = throwYut(s, 'a', seq(...BACKDO_STICKS));
    expect(s.pendingResults).toEqual(['YUT']);
    s = activate(s, 'a', 'A-P1', { result: 'MO' });
    expect(throwYut(s, 'a', seq(...BACKDO_STICKS)).pendingResults).toEqual(['YUT', 'MO']);
  });

  it('A-P5 sends adjacent enemies home like O-P4', () => {
    const s = activate(game({ a: ['A-P5'] }, { 'a-0': at(8, 7), 'b-0': at(9, 8) }), 'a', 'A-P5', { pieceId: 'a-0' });
    expect(stateOf(s, 'b-0')).toEqual(WAIT);
  });
});

