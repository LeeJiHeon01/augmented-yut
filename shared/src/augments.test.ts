import { describe, expect, it } from 'vitest';
import { activeStatus, isImplemented, useAugment } from './actives';
import { AUGMENTS } from './augment';
import type { GameState, PieceState, PlayerId } from './game';
import { movesFor, planMove } from './play';
import { activate, autoAct, chooseThrow, movePiece, splitResult, startGame, throwYut } from './turn';
import type { YutResult } from './yut';

/** Cycles through the given values. */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

// Four stick rolls each (below 0.5 = flat side up).
const STICKS: Record<YutResult, number[]> = {
  BACKDO: [0.1, 0.9, 0.9, 0.9],
  DO: [0.9, 0.1, 0.9, 0.9],
  GAE: [0.1, 0.1, 0.9, 0.9],
  GEOL: [0.1, 0.1, 0.1, 0.9],
  YUT: [0.1, 0.1, 0.1, 0.1],
  MO: [0.9, 0.9, 0.9, 0.9],
};

const at = (node: number, prev: number): PieceState => ({ kind: 'ON_BOARD', node, prev });
const WAIT: PieceState = { kind: 'WAITING' };
const DONE: PieceState = { kind: 'FINISHED' };

interface Setup {
  aug?: Record<PlayerId, string[]>;
  place?: Record<string, PieceState>;
  pending?: YutResult[];
  players?: string[];
}

/** a's turn; `pending` puts the game in the move phase. */
function game({ aug = {}, place = {}, pending, players = ['a', 'b'] }: Setup = {}): GameState {
  const base = startGame('r', players.map((id) => ({ id, name: id })));
  return {
    ...base,
    players: base.players.map((p) => ({ ...p, augmentIds: aug[p.id] ?? [] })),
    pieces: base.pieces.map((p) => (place[p.id] ? { ...p, state: place[p.id]! } : p)),
    ...(pending ? { phase: 'MOVE' as const, pendingResults: pending, throwsRemaining: 0 } : {}),
  };
}

const stateOf = (s: GameState, id: string) => s.pieces.find((p) => p.id === id)?.state;
const player = (s: GameState, id: PlayerId) => s.players.find((p) => p.id === id)!;
const thrown = (s: GameState) => s.log.filter((e) => e.kind === 'THROW').at(-1)?.result;
const effects = (s: GameState) => s.log.filter((e) => e.kind === 'EFFECT').map((e) => (e.kind === 'EFFECT' ? e.augmentId : ''));

describe('every drawable augment has an effect', () => {
  it('covers all enabled augments', () => {
    const missing = AUGMENTS.filter((a) => a.enabled && !isImplemented(a.id)).map((a) => a.id);
    expect(missing).toEqual([]);
  });
});

describe('throw passives', () => {
  it('O-S14: after three dry turns the next throw may become Yut', () => {
    let s = game({ aug: { a: ['O-S14'] } });
    s = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, status: { ...p.status, dryTurns: 3 } } : p)) };
    const t = throwYut(s, 'a', seq(...STICKS.GAE, 0.1));
    expect(t.pendingResults).toEqual(['YUT']);
    expect(player(t, 'a').status.dryTurns).toBe(0);
  });

  it('O-S14 counts turns without Yut or Mo', () => {
    const s = throwYut(game({ aug: { a: ['O-S14'] } }), 'a', seq(...STICKS.BACKDO));
    expect(player(s, 'a').status.dryTurns).toBe(1);
  });

  it('A-G8: three Do/Gae in a row make the next throw Yut', () => {
    let s = game({ aug: { a: ['A-G8'] } });
    s = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, status: { ...p.status, smallStreak: 3 } } : p)) };
    const t = throwYut(s, 'a', seq(...STICKS.DO));
    expect(t.pendingResults).toEqual(['YUT']);
    expect(player(t, 'a').status.smallStreak).toBe(0);
  });

  it('O-G12: a throw earned by Yut moves one more space', () => {
    let s = throwYut(game({ aug: { a: ['O-G12'] } }), 'a', seq(...STICKS.YUT));
    s = throwYut(s, 'a', seq(...STICKS.DO));
    expect(player(s, 'a').status.moveBonus).toBe(1);
    expect(effects(s)).toContain('O-G12');
  });

  it('A-S3: the last place gets +1 on the first throw of a turn', () => {
    const s = throwYut(game({ aug: { a: ['A-S3'] }, place: { 'b-0': DONE } }), 'a', seq(...STICKS.DO));
    expect(player(s, 'a').status.moveBonus).toBe(1);
  });

  it('O-P8: the first throw shows two results to choose from', () => {
    const s = throwYut(game({ aug: { a: ['O-P8'] } }), 'a', seq(...STICKS.DO, ...STICKS.MO));
    expect(s.phase).toBe('CHOOSE');
    expect(s.field.choice).toEqual(['DO', 'MO']);
    const t = chooseThrow(s, 'a', 1);
    expect(t.pendingResults).toEqual(['MO']);
    expect(t.phase).toBe('THROW');
    expect(autoAct(s, seq(0.1)).pendingResults).toEqual(['DO']);
  });
});

describe('next-throw actives', () => {
  it('C-S5 / C-S2 reserve a random throw', () => {
    const s = activate(game({ aug: { a: ['C-S5'] } }), 'a', 'C-S5');
    expect(throwYut(s, 'a', seq(0.7)).pendingResults).toEqual(['MO']);
    const t = activate(game({ aug: { a: ['C-S2'] } }), 'a', 'C-S2');
    expect(thrown(throwYut(t, 'a', seq(0.5)))).toBe('BACKDO');
  });

  it('A-S11 / O-P1 / A-P1 fix the chosen result', () => {
    const s = activate(game({ aug: { a: ['A-S11'] } }), 'a', 'A-S11', { result: 'GEOL' });
    expect(throwYut(s, 'a', seq(...STICKS.DO)).pendingResults).toEqual(['GEOL']);
    expect(() => activate(game({ aug: { a: ['A-S11'] } }), 'a', 'A-S11', { result: 'MO' })).toThrow('결과');
    const t = activate(game({ aug: { a: ['O-P1'] } }), 'a', 'O-P1', { result: 'MO' });
    expect(throwYut(t, 'a', seq(...STICKS.DO)).pendingResults).toEqual(['MO']);
  });

  it('C-S7 copies the previous player result', () => {
    let s = game({ aug: { b: ['C-S7'] } });
    s = throwYut(s, 'a', seq(...STICKS.BACKDO)); // a: Backdo with nothing out ends the turn
    expect(s.turn).toBe('b');
    s = activate(s, 'b', 'C-S7');
    expect(thrown(throwYut(s, 'b', seq(...STICKS.DO)))).toBe('BACKDO');
  });

  it('C-S4 swaps my throw with a random opponent', () => {
    const s = activate(game({ aug: { a: ['C-S4'] } }), 'a', 'C-S4');
    const t = throwYut(s, 'a', seq(0.1, ...STICKS.DO, ...STICKS.MO));
    expect(t.pendingResults).toEqual(['MO']);
    expect(player(t, 'b').status.forced).toBe('DO');
  });

  it('C-S11 makes everyone throw Backdo next', () => {
    const s = activate(game({ aug: { a: ['C-S11'] } }), 'a', 'C-S11');
    expect(s.players.every((p) => p.status.forced === 'BACKDO')).toBe(true);
    expect(thrown(throwYut(s, 'a', seq(...STICKS.MO)))).toBe('BACKDO');
  });
});

describe('move passives', () => {
  it('O-S1 / A-S14: Backdo can be used as Do', () => {
    const s = game({ aug: { a: ['O-S1'] }, place: { 'a-0': at(3, 2) }, pending: ['BACKDO'] });
    expect(movesFor(s, 'a')).toContainEqual({ pieceId: 'a-0', result: 'BACKDO', as: 'DO' });
    const t = movePiece(s, 'a', { pieceId: 'a-0', result: 'BACKDO', as: 'DO' });
    expect(stateOf(t, 'a-0')).toEqual(at(4, 3));
    expect(() => movePiece(game({ place: { 'a-0': at(3, 2) }, pending: ['BACKDO'] }), 'a', { pieceId: 'a-0', result: 'BACKDO', as: 'DO' })).toThrow();
  });

  it('O-S9: Do can be used as Gae', () => {
    const s = game({ aug: { a: ['O-S9'] }, pending: ['DO'] });
    const t = movePiece(s, 'a', { pieceId: 'a-0', result: 'DO', as: 'GAE' });
    expect(stateOf(t, 'a-0')).toEqual(at(2, 1));
  });

  it('O-S15: Backdo moves forward after the last corner', () => {
    const s = game({ aug: { a: ['O-S15'] }, place: { 'a-0': at(17, 16) }, pending: ['BACKDO'] });
    expect(stateOf(movePiece(s, 'a', { pieceId: 'a-0', result: 'BACKDO' }), 'a-0')).toEqual(at(18, 17));
  });

  it('O-S7: shortcuts are taken even when passing a corner', () => {
    const s = game({ aug: { a: ['O-S7'] }, place: { 'a-0': at(4, 3) }, pending: ['GAE'] });
    expect(stateOf(movePiece(s, 'a', { pieceId: 'a-0', result: 'GAE' }), 'a-0')).toEqual(at(20, 5));
  });

  it('O-P7 천리마: a Yut or Mo move goes three spaces further, twice', () => {
    let s = game({ aug: { a: ['O-P7'] }, place: { 'a-0': at(1, 0) }, pending: ['YUT'] });
    s = movePiece(s, 'a', { pieceId: 'a-0', result: 'YUT' });
    expect(stateOf(s, 'a-0')).toEqual(at(8, 7));
    expect(player(s, 'a').augmentUses['O-P7']).toBe(1);
    const doMove = movePiece({ ...s, turn: 'a', phase: 'MOVE', pendingResults: ['DO'], throwsRemaining: 0 }, 'a', { pieceId: 'a-0', result: 'DO' });
    expect(stateOf(doMove, 'a-0')).toEqual(at(9, 8));
    expect(player(doMove, 'a').augmentUses['O-P7']).toBe(1);
  });

  it('O-S8: stacking moves the stack one more space', () => {
    const s = game({ aug: { a: ['O-S8'] }, place: { 'a-0': at(1, 0), 'a-1': at(2, 1) }, pending: ['DO'] });
    const t = movePiece(s, 'a', { pieceId: 'a-0', result: 'DO' });
    expect(stateOf(t, 'a-0')).toEqual(at(3, 2));
    expect(stateOf(t, 'a-1')).toEqual(at(3, 2));
  });

  it('A-S6: starting right behind an enemy adds a space', () => {
    const s = game({ aug: { a: ['A-S6'] }, place: { 'a-0': at(3, 2), 'b-0': at(4, 3) }, pending: ['GAE'] });
    expect(stateOf(movePiece(s, 'a', { pieceId: 'a-0', result: 'GAE' }), 'a-0')).toEqual(at(6, 5));
  });

  it('A-S13: the first lone-piece move of a turn adds a space', () => {
    const s = game({ aug: { a: ['A-S13'] }, place: { 'a-0': at(6, 5) }, pending: ['DO', 'DO'] });
    const t = movePiece(s, 'a', { pieceId: 'a-0', result: 'DO' });
    expect(stateOf(t, 'a-0')).toEqual(at(8, 7));
    expect(stateOf(movePiece(t, 'a', { pieceId: 'a-0', result: 'DO' }), 'a-0')).toEqual(at(9, 8));
  });

  it('A-S9: a shortcut entry adds a space and uses one charge', () => {
    const s = game({ aug: { a: ['A-S9'] }, place: { 'a-0': at(5, 4) }, pending: ['DO'] });
    const t = movePiece(s, 'a', { pieceId: 'a-0', result: 'DO' });
    expect(stateOf(t, 'a-0')).toEqual(at(21, 20));
    expect(player(t, 'a').augmentUses['A-S9']).toBe(1);
  });

  it('A-S15: one space short of home still finishes, once per piece', () => {
    const s = game({ aug: { a: ['A-S15'] }, place: { 'a-0': at(18, 17) }, pending: ['GAE'] });
    const t = movePiece(s, 'a', { pieceId: 'a-0', result: 'GAE' });
    expect(stateOf(t, 'a-0')).toEqual(DONE);
  });

  it('A-G9: last place moves +2 on every move this turn', () => {
    const s = activate(game({ aug: { a: ['A-G9'] }, place: { 'b-0': DONE } }), 'a', 'A-G9');
    const t = movePiece({ ...s, phase: 'MOVE', pendingResults: ['DO'], throwsRemaining: 0 }, 'a', { pieceId: 'a-0', result: 'DO' });
    expect(stateOf(t, 'a-0')).toEqual(at(3, 2));
    expect(() => activate(game({ aug: { a: ['A-G9'] }, place: { 'a-0': DONE } }), 'a', 'A-G9')).toThrow('꼴찌');
  });

  it('C-S1: my Do/Gae/Geol go backwards for two turns', () => {
    const s = activate(game({ aug: { a: ['C-S1'] }, place: { 'a-0': at(6, 5) } }), 'a', 'C-S1');
    const t = movePiece({ ...s, phase: 'MOVE', pendingResults: ['GAE'], throwsRemaining: 0 }, 'a', { pieceId: 'a-0', result: 'GAE' });
    expect(stateOf(t, 'a-0')).toEqual(at(4, 3));
  });

  it('C-P5: everybody moves backwards for a round', () => {
    const s = activate(game({ aug: { a: ['C-P5'] }, place: { 'a-0': at(6, 5) } }), 'a', 'C-P5');
    const t = movePiece({ ...s, phase: 'MOVE', pendingResults: ['YUT'], throwsRemaining: 0 }, 'a', { pieceId: 'a-0', result: 'YUT' });
    expect(stateOf(t, 'a-0')).toEqual(at(2, 1));
  });

  it('O-G1: a result splits into two smaller ones', () => {
    const s = game({ aug: { a: ['O-G1'] }, pending: ['GEOL'] });
    expect(splitResult(s, 'a', 'GEOL', 'DO').pendingResults).toEqual(['DO', 'GAE']);
    expect(() => splitResult(s, 'a', 'GEOL', 'GEOL')).toThrow();
    expect(() => splitResult(game({ pending: ['GEOL'] }), 'a', 'GEOL', 'DO')).toThrow('분할');
  });

  it('A-G6: enemies cannot pass a blocked node until my next turn', () => {
    let s = activate(game({ aug: { a: ['A-G6'] }, place: { 'a-0': at(3, 2) } }), 'a', 'A-G6', { pieceId: 'a-0' });
    s = { ...s, turn: 'b', phase: 'MOVE', pendingResults: ['GEOL'], throwsRemaining: 0, pieces: s.pieces.map((p) => (p.id === 'b-0' ? { ...p, state: at(1, 0) } : p)) };
    expect(() => planMove(s, 'b', { pieceId: 'b-0', result: 'GEOL' })).toThrow('길목');
    expect(() => planMove(s, 'b', { pieceId: 'b-0', result: 'GAE' })).not.toThrow();
  });

  it('O-S12: an enemy stopping on the trap moves back two spaces', () => {
    let s = activate(game({ aug: { a: ['O-S12'] } }), 'a', 'O-S12', { node: 4 });
    expect(s.field.traps).toEqual([{ node: 4, owner: 'a' }]);
    s = { ...s, turn: 'b', phase: 'MOVE', pendingResults: ['YUT'], throwsRemaining: 0 };
    const t = movePiece(s, 'b', { pieceId: 'b-0', result: 'YUT' });
    expect(stateOf(t, 'b-0')).toEqual(at(2, 1));
    expect(t.field.traps).toEqual([]);
    expect(() => activate(game({ aug: { a: ['O-S12'] }, place: { 'b-0': at(4, 3) } }), 'a', 'O-S12', { node: 4 })).toThrow('빈 칸');
  });

  it('C-S12: a random opponent picks my next move, once', () => {
    const s = activate(game({ aug: { a: ['C-S12'] }, place: { 'a-0': at(6, 5) }, players: ['a', 'b', 'c'] }), 'a', 'C-S12', {}, seq(0.6));
    expect(s.field.delegate).toEqual({ owner: 'a', by: 'c' });
    const moving = { ...s, phase: 'MOVE' as const, pendingResults: ['DO', 'DO'] as YutResult[], throwsRemaining: 0 };
    expect(() => movePiece(moving, 'a', { pieceId: 'a-0', result: 'DO' })).toThrow('상대가');
    expect(() => movePiece(moving, 'b', { pieceId: 'a-0', result: 'DO' })).toThrow('차례');
    const t = movePiece(moving, 'c', { pieceId: 'a-0', result: 'DO' });
    expect(stateOf(t, 'a-0')).toEqual(at(7, 6));
    expect(t.field.delegate).toBeNull();
    expect(stateOf(movePiece(t, 'a', { pieceId: 'a-0', result: 'DO' }), 'a-0')).toEqual(at(8, 7));
  });

  it('C-S12 picks at random on timeout and ends with the turn', () => {
    const s = activate(game({ aug: { a: ['C-S12'] }, place: { 'a-0': at(6, 5) } }), 'a', 'C-S12', {}, seq(0.1));
    const t = autoAct({ ...s, phase: 'MOVE', pendingResults: ['DO'], throwsRemaining: 0 }, seq(0.9));
    expect(t.field.delegate).toBeNull();
    const unused = throwYut(activate(game({ aug: { a: ['C-S12'] } }), 'a', 'C-S12', {}, seq(0.1)), 'a', seq(...STICKS.BACKDO));
    expect(unused.field.delegate).toBeNull();
  });
});

describe('capture passives', () => {
  /** a moves from 2 to 4 with Gae onto b's piece(s). */
  function capture(aug: Setup['aug'], place: Setup['place'] = {}, random = seq(0.9)): GameState {
    const s = game({ aug, place: { 'a-0': at(2, 1), 'b-0': at(4, 3), ...place }, pending: ['GAE'] });
    return movePiece(s, 'a', { pieceId: 'a-0', result: 'GAE' }, random);
  }

  it('a plain capture sends the piece home and gives a throw', () => {
    const t = capture({});
    expect(stateOf(t, 'b-0')).toEqual(WAIT);
    expect(t.phase).toBe('THROW');
  });

  it('O-S5: corners are safe', () => {
    const s = game({ aug: { b: ['O-S5'] }, place: { 'a-0': at(3, 2), 'b-0': at(5, 4) }, pending: ['GAE'] });
    const t = movePiece(s, 'a', { pieceId: 'a-0', result: 'GAE' });
    expect(stateOf(t, 'b-0')).toEqual(at(5, 4));
    expect(effects(t)).toContain('O-S5');
  });

  it('O-G10: the first three spaces are safe', () => {
    const s = game({ aug: { b: ['O-G10'] }, place: { 'b-0': at(2, 1) }, pending: ['GAE'] });
    expect(stateOf(movePiece(s, 'a', { pieceId: 'a-0', result: 'GAE' }), 'b-0')).toEqual(at(2, 1));
  });

  it('O-P3: stacks of three are safe', () => {
    const t = capture({ b: ['O-P3'] }, { 'b-1': at(4, 3), 'b-2': at(4, 3) });
    expect(stateOf(t, 'b-0')).toEqual(at(4, 3));
  });

  it('A-G4: blocks two captures', () => {
    const t = capture({ b: ['A-G4'] });
    expect(stateOf(t, 'b-0')).toEqual(at(4, 3));
    expect(player(t, 'b').augmentUses['A-G4']).toBe(1);
  });

  it('C-S14: one 50% survival chance', () => {
    expect(stateOf(capture({ b: ['C-S14'] }, {}, seq(0.1)), 'b-0')).toEqual(at(4, 3));
    const miss = capture({ b: ['C-S14'] }, {}, seq(0.9));
    expect(stateOf(miss, 'b-0')).toEqual(WAIT);
    // One try, hit or miss: used up either way.
    expect(player(miss, 'b').retired).toEqual(['C-S14']);
  });

  it('A-S2: 25% dodge', () => {
    expect(stateOf(capture({ b: ['A-S2'] }, {}, seq(0.2)), 'b-0')).toEqual(at(4, 3));
    expect(stateOf(capture({ b: ['A-S2'] }, {}, seq(0.3)), 'b-0')).toEqual(WAIT);
  });

  it('A-P3: each piece survives its first capture', () => {
    const t = capture({ b: ['A-P3'] });
    expect(stateOf(t, 'b-0')).toEqual(at(4, 3));
    expect(player(t, 'b').retired).toEqual(['A-P3']);
  });

  it('A-S5 / O-G2: only one piece of a stack goes home', () => {
    const t = capture({ b: ['A-S5'] }, { 'b-1': at(4, 3) });
    expect([stateOf(t, 'b-0'), stateOf(t, 'b-1')]).toEqual([WAIT, at(4, 3)]);
  });

  it('O-S10: the first capture pushes back three spaces instead', () => {
    const s = game({ aug: { b: ['O-S10'] }, place: { 'a-0': at(6, 5), 'b-0': at(8, 7) }, pending: ['GAE'] });
    expect(stateOf(movePiece(s, 'a', { pieceId: 'a-0', result: 'GAE' }), 'b-0')).toEqual(at(5, 4));
  });

  it('C-S9: the capturing piece goes home too, once', () => {
    const t = capture({ b: ['C-S9'] });
    expect(stateOf(t, 'a-0')).toEqual(WAIT);
    expect(stateOf(t, 'b-0')).toEqual(WAIT);
  });

  it('victim passives: O-S6, A-S7, A-S12', () => {
    expect(player(capture({ b: ['A-S7'] }), 'b').status.moveBonus).toBe(1);
    const s = game({ aug: { b: ['A-S12'] }, place: { 'a-0': at(2, 1), 'b-0': at(4, 3) }, pending: ['GAE'] });
    const twice = { ...s, field: { ...s.field, hits: { 'b-0': 1 } } };
    expect(player(movePiece(twice, 'a', { pieceId: 'a-0', result: 'GAE' }), 'b').status.moveBonus).toBe(2);
  });

  it('O-S6: the captured player throws once right away, then the turn goes back', () => {
    let s = capture({ b: ['O-S6'] });
    expect([s.turn, s.phase, s.throwsRemaining, s.field.interrupting]).toEqual(['b', 'THROW', 1, 'b']);
    expect(s.field.resume).toEqual({ turn: 'a', throwsRemaining: 1, pendingResults: [] });
    s = throwYut(s, 'b', seq(...STICKS.YUT));
    // A Yut in the interrupt gives no extra throw.
    expect([s.phase, s.throwsRemaining]).toEqual(['MOVE', 0]);
    s = movePiece(s, 'b', { pieceId: 'b-0', result: 'YUT' });
    expect([s.turn, s.phase, s.throwsRemaining, s.field.interrupting]).toEqual(['a', 'THROW', 1, null]);
    expect(player(s, 'b').regularTurnsCompleted).toBe(0);
  });

  it('O-S6: a throw with nothing to move hands the turn straight back', () => {
    const s = throwYut(capture({ b: ['O-S6'] }), 'b', seq(...STICKS.BACKDO));
    expect([s.turn, s.phase]).toEqual(['a', 'THROW']);
  });

  it('O-G5 / A-G13: the capturing piece cannot move next turn', () => {
    const t = capture({ b: ['O-G5'] });
    expect(t.field.frozen).toEqual([{ pieceId: 'a-0', turn: 1 }]);
    const later = { ...t, players: t.players.map((p) => (p.id === 'a' ? { ...p, regularTurnsCompleted: 1 } : p)), phase: 'MOVE' as const, pendingResults: ['DO' as const] };
    expect(() => planMove(later, 'a', { pieceId: 'a-0', result: 'DO' })).toThrow('움직일 수 없는');
  });

  it('capturer passives: A-G7, O-G11, A-G5, O-S11', () => {
    expect(player(capture({ a: ['A-G7'] }), 'b').status.moveBonus).toBe(-1);
    const stolen = capture({ a: ['O-G11', 'O-S13'], b: ['A-G12'] });
    expect(player(stolen, 'b').augmentUses['A-G12']).toBe(1);
    expect(player(stolen, 'a').augmentUses['O-S13']).toBe(-1);
    expect(player(capture({ a: ['A-G5'] }), 'a').status.moveBonus).toBe(2);
    expect(player(capture({ a: ['O-S11'] }), 'a').status.bonusRerolls).toBe(1);
  });

  it('O-G7 / A-G1: capturing the leader gives more', () => {
    const lead = { 'b-1': DONE };
    expect(capture({ a: ['O-G7'] }, lead).throwsRemaining).toBe(2);
    const bounty = capture({ a: ['A-G1'] }, lead);
    expect(bounty.throwsRemaining).toBe(2);
    expect(player(bounty, 'a').status.moveBonus).toBe(2);
  });

  it('A-S10: revenge on whoever captured me gives a throw', () => {
    const s = game({ aug: { a: ['A-S10'] }, place: { 'a-0': at(2, 1), 'b-0': at(4, 3) }, pending: ['GAE'] });
    const grudge = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, status: { ...p.status, capturedBy: ['b'] } } : p)) };
    expect(movePiece(grudge, 'a', { pieceId: 'a-0', result: 'GAE' }).throwsRemaining).toBe(2);
  });

  it('O-G8: the second capture of a turn pushes another enemy back', () => {
    const s = game({ aug: { a: ['O-G8'] }, place: { 'a-0': at(2, 1), 'b-0': at(4, 3), 'b-1': at(9, 8) }, pending: ['GAE'] });
    const once = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, status: { ...p.status, turn: { ...p.status.turn, captures: 1 } } } : p)) };
    expect(stateOf(movePiece(once, 'a', { pieceId: 'a-0', result: 'GAE' }, seq(0.1)), 'b-1')).toEqual(at(7, 6));
  });

  it('C-G12: a linked piece is captured together', () => {
    let s = game({ place: { 'a-0': at(2, 1), 'b-0': at(4, 3), 'b-1': at(9, 8) }, pending: ['GAE'] });
    s = { ...s, field: { ...s.field, links: [{ a: 'b-0', b: 'b-1', owner: 'b', until: 9 }] } };
    const t = movePiece(s, 'a', { pieceId: 'a-0', result: 'GAE' });
    expect(stateOf(t, 'b-1')).toEqual(WAIT);
  });
});
