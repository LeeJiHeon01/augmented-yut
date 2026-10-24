import { describe, expect, it } from 'vitest';
import { activeStatus, useAugment } from './actives';
import type { GameState, PieceState, PlayerId } from './game';
import { activate, movePiece, startGame, throwYut } from './turn';
import type { YutResult } from './yut';

/** Cycles through the given values. */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

const STICKS: Record<'BACKDO' | 'DO' | 'GEOL', number[]> = {
  BACKDO: [0.1, 0.9, 0.9, 0.9],
  DO: [0.9, 0.1, 0.9, 0.9],
  GEOL: [0.1, 0.1, 0.1, 0.9],
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
const use = (s: GameState, id: string, target = {}, random = seq(0.9)) => activate(s, 'a', id, target, random);
const moving = (s: GameState, pending: YutResult[]): GameState => ({ ...s, phase: 'MOVE', pendingResults: pending, throwsRemaining: 0 });

describe('piece actives', () => {
  it('C-S3 / A-P2 push an enemy piece forward or back', () => {
    const s = game({ aug: { a: ['C-S3', 'A-P2'] }, place: { 'b-0': at(8, 7) } });
    expect(stateOf(use(s, 'C-S3', { pieceId: 'b-0', direction: 'BACK' }), 'b-0')).toEqual(at(6, 5));
    expect(stateOf(use(s, 'A-P2', { pieceId: 'b-0', direction: 'FORWARD' }), 'b-0')).toEqual(at(12, 11));
    expect(() => use(s, 'C-S3', { pieceId: 'a-0', direction: 'BACK' })).toThrow('상대 말');
  });

  it('C-S6 slips forward or back three', () => {
    const s = game({ aug: { a: ['C-S6'] }, place: { 'a-0': at(8, 7) } });
    expect(stateOf(use(s, 'C-S6', { pieceId: 'a-0' }, seq(0.9)), 'a-0')).toEqual(at(11, 10));
    expect(stateOf(use(s, 'C-S6', { pieceId: 'a-0' }, seq(0.1)), 'a-0')).toEqual(at(5, 4));
  });

  it('C-S8 moves my piece and an enemy piece two', () => {
    const s = use(game({ aug: { a: ['C-S8'] }, place: { 'a-0': at(1, 0), 'b-0': at(8, 7) } }), 'C-S8', { pieceId: 'a-0', otherPieceId: 'b-0' });
    expect([stateOf(s, 'a-0'), stateOf(s, 'b-0')]).toEqual([at(3, 2), at(10, 9)]);
  });

  it('C-S10 places a waiting piece on a corner', () => {
    expect(stateOf(use(game({ aug: { a: ['C-S10'] } }), 'C-S10', {}, seq(0.5)), 'a-0')).toEqual(at(10, 9));
  });

  it('C-S13 jumps to a corner or falls back home', () => {
    const s = game({ aug: { a: ['C-S13'] }, place: { 'a-0': at(8, 7) } });
    expect(stateOf(use(s, 'C-S13', { pieceId: 'a-0' }, seq(0.1)), 'a-0')).toEqual(WAIT);
    expect(stateOf(use(s, 'C-S13', { pieceId: 'a-0' }, seq(0.5, 0.0)), 'a-0')).toEqual(at(5, 4));
  });

  it('C-S15 moves every board piece one space without captures', () => {
    const s = use(game({ aug: { a: ['C-S15'] }, place: { 'a-0': at(3, 2), 'b-0': at(4, 3) } }), 'C-S15');
    expect([stateOf(s, 'a-0'), stateOf(s, 'b-0')]).toEqual([at(4, 3), at(5, 4)]);
  });

  it('O-G6 teleports to the next corner ahead', () => {
    expect(stateOf(use(game({ aug: { a: ['O-G6'] }, place: { 'a-0': at(7, 6) } }), 'O-G6', { pieceId: 'a-0' }), 'a-0')).toEqual(at(10, 9));
  });

  it('O-G13 swaps with an enemy within five spaces', () => {
    const s = game({ aug: { a: ['O-G13'] }, place: { 'a-0': at(3, 2), 'b-0': at(6, 5), 'b-1': at(18, 17) } });
    const t = use(s, 'O-G13', { pieceId: 'a-0', otherPieceId: 'b-0' });
    expect([stateOf(t, 'a-0'), stateOf(t, 'b-0')]).toEqual([at(6, 5), at(3, 2)]);
    expect(() => use(s, 'O-G13', { pieceId: 'a-0', otherPieceId: 'b-1' })).toThrow('5칸');
  });

  it('A-G2 sends one piece home and moves another five', () => {
    const s = use(game({ aug: { a: ['A-G2'] }, place: { 'a-0': at(3, 2), 'a-1': at(6, 5) } }), 'A-G2', { pieceId: 'a-0', otherPieceId: 'a-1' });
    expect([stateOf(s, 'a-0'), stateOf(s, 'a-1')]).toEqual([WAIT, at(11, 10)]);
  });

  it('A-G10 splits one piece off a stack and moves it three', () => {
    const s = use(game({ aug: { a: ['A-G10'] }, place: { 'a-0': at(6, 5), 'a-1': at(6, 5) } }), 'A-G10', { pieceId: 'a-1' });
    expect([stateOf(s, 'a-0'), stateOf(s, 'a-1')]).toEqual([at(6, 5), at(9, 8)]);
  });

  it('A-G11: the shadowed piece pulls my lead piece along', () => {
    const s = use(game({ aug: { a: ['A-G11'] }, place: { 'a-0': at(6, 5), 'b-0': at(2, 1) } }), 'A-G11', { pieceId: 'b-0' });
    const t = movePiece({ ...moving(s, ['DO']), turn: 'b' }, 'b', { pieceId: 'b-0', result: 'DO' });
    expect(stateOf(t, 'a-0')).toEqual(at(7, 6));
  });

  it('C-G2 pushes the leader back three', () => {
    expect(stateOf(use(game({ aug: { a: ['C-G2'] }, place: { 'b-0': at(9, 8), 'b-1': DONE } }), 'C-G2'), 'b-0')).toEqual(at(6, 5));
    expect(() => use(game({ aug: { a: ['C-G2'] }, place: { 'a-1': DONE } }), 'C-G2')).toThrow('1위');
  });

  it('C-G3 swaps any of my pieces with an enemy piece', () => {
    const s = use(game({ aug: { a: ['C-G3'] }, place: { 'a-0': at(1, 0), 'b-0': at(17, 16) } }), 'C-G3', { pieceId: 'a-0', otherPieceId: 'b-0' });
    expect(stateOf(s, 'a-0')).toEqual(at(17, 16));
  });

  it('C-G4 lets me move one enemy piece this turn', () => {
    const s = use(game({ aug: { a: ['C-G4'] }, place: { 'b-0': at(8, 7) } }), 'C-G4');
    expect(stateOf(movePiece(moving(s, ['GAE']), 'a', { pieceId: 'b-0', result: 'GAE' }), 'b-0')).toEqual(at(10, 9));
  });

  it('C-G5 sends everything on a node home', () => {
    const s = use(game({ aug: { a: ['C-G5'] }, place: { 'a-0': at(6, 5), 'b-0': at(6, 5) } }), 'C-G5', { pieceId: 'b-0' });
    expect([stateOf(s, 'a-0'), stateOf(s, 'b-0')]).toEqual([WAIT, WAIT]);
  });

  it('C-G6 sends each player’s lead piece home', () => {
    const s = use(game({ aug: { a: ['C-G6'] }, place: { 'a-0': at(16, 15), 'a-1': at(2, 1), 'b-0': at(9, 8) } }), 'C-G6');
    expect([stateOf(s, 'a-0'), stateOf(s, 'a-1'), stateOf(s, 'b-0')]).toEqual([WAIT, at(2, 1), WAIT]);
  });

  it('C-G7 shuffles up to four board pieces', () => {
    const s = use(game({ aug: { a: ['C-G7'] }, place: { 'a-0': at(6, 5), 'b-0': at(9, 8) } }), 'C-G7', {}, seq(0.1));
    const spots = [stateOf(s, 'a-0'), stateOf(s, 'b-0')].map((x) => JSON.stringify(x)).sort();
    expect(spots).toEqual([JSON.stringify(at(6, 5)), JSON.stringify(at(9, 8))].sort());
  });

  it('C-G8 moves my piece and a random enemy five', () => {
    const s = use(game({ aug: { a: ['C-G8'] }, place: { 'a-0': at(1, 0), 'b-0': at(9, 8) } }), 'C-G8', { pieceId: 'a-0' }, seq(0.1));
    expect([stateOf(s, 'a-0'), stateOf(s, 'b-0')]).toEqual([at(6, 5), at(14, 13)]);
  });

  it('C-G9 swaps the lead pieces of first and last place', () => {
    const s = game({ aug: { a: ['C-G9'] }, place: { 'a-0': at(3, 2), 'b-0': at(9, 8), 'b-1': DONE, 'c-0': at(1, 0) }, players: ['a', 'b', 'c'] });
    const t = use(s, 'C-G9');
    expect([stateOf(t, 'b-0'), stateOf(t, 'c-0')]).toEqual([at(1, 0), at(9, 8)]);
  });

  it('C-G10 makes an opponent skip a turn', () => {
    let s = use(game({ aug: { a: ['C-G10'] }, players: ['a', 'b', 'c'] }), 'C-G10', { playerId: 'b' });
    s = throwYut(s, 'a', seq(...STICKS.BACKDO));
    expect(s.turn).toBe('c');
    expect(player(s, 'b').regularTurnsCompleted).toBe(1);
  });

  it('C-G11 sets a bomb that goes off after two of its owner’s turns', () => {
    const s = use(game({ aug: { a: ['C-G11'] }, place: { 'b-0': at(9, 8) } }), 'C-G11', { pieceId: 'b-0' });
    expect(s.field.bombs).toEqual([{ pieceId: 'b-0', owner: 'b', until: 2 }]);
    const due = { ...s, field: { ...s.field, bombs: [{ pieceId: 'b-0', owner: 'b', until: 0 }] } };
    expect(stateOf(throwYut(due, 'a', seq(...STICKS.BACKDO)), 'b-0')).toEqual(WAIT);
  });

  it('C-G11: the bomb jumps to a piece it passes, or to a survivor where it stops', () => {
    const bombed = (s: GameState) => ({ ...s, field: { ...s.field, bombs: [{ pieceId: 'b-0', owner: 'b', until: 2 }] } });
    const base = bombed(game({ place: { 'b-0': at(2, 1), 'a-0': at(3, 2) } }));
    const passing = movePiece({ ...moving(base, ['GEOL']), turn: 'b' }, 'b', { pieceId: 'b-0', result: 'GEOL' });
    expect(passing.field.bombs).toEqual([{ pieceId: 'a-0', owner: 'a', until: 2 }]);
    const captured = movePiece({ ...moving(base, ['DO']), turn: 'b' }, 'b', { pieceId: 'b-0', result: 'DO' });
    expect(captured.field.bombs).toEqual([{ pieceId: 'b-0', owner: 'b', until: 2 }]);
    const guarded = bombed(game({ aug: { a: ['A-G4'] }, place: { 'b-0': at(2, 1), 'a-0': at(3, 2) } }));
    const survived = movePiece({ ...moving(guarded, ['DO']), turn: 'b' }, 'b', { pieceId: 'b-0', result: 'DO' });
    expect(survived.field.bombs[0]?.pieceId).toBe('a-0');
  });

  it('C-G1 makes me and a random opponent allies for two of my turns', () => {
    const s = use(game({ aug: { a: ['C-G1'] }, place: { 'a-0': at(2, 1), 'b-0': at(4, 3) }, players: ['a', 'b', 'c'] }), 'C-G1', {}, seq(0.1));
    expect(s.field.alliance).toEqual({ source: 'C-G1', pairs: [['a', 'b']], clock: 'a', until: 2 });
    const t = movePiece(moving(s, ['GAE']), 'a', { pieceId: 'a-0', result: 'GAE' });
    expect(stateOf(t, 'b-0')).toEqual(at(4, 3));
    // No capture, so no extra throw: the turn moves on.
    expect(t.turn).toBe('b');
  });

  it('C-P2 shuffles four players 2:2 for two rounds, and needs four players', () => {
    const four = game({ aug: { a: ['C-P2'] }, players: ['a', 'b', 'c', 'd'] });
    const s = use(four, 'C-P2', {}, seq(0.1, 0.1, 0.1));
    expect(s.field.alliance).toMatchObject({ source: 'C-P2', clock: 'ROUND', until: 2 });
    expect(s.field.alliance?.pairs).toHaveLength(2);
    expect(() => use(game({ aug: { a: ['C-P2'] }, players: ['a', 'b', 'c'] }), 'C-P2')).toThrow('4명');
  });

  it('a newer team effect replaces the older one; winning stays individual', () => {
    let s = use(game({ aug: { a: ['C-G1', 'C-P2'] }, players: ['a', 'b', 'c', 'd'] }), 'C-G1', {}, seq(0.1));
    s = use(s, 'C-P2', {}, seq(0.9, 0.9, 0.9));
    expect(s.field.alliance?.source).toBe('C-P2');
    const ally = s.field.alliance!.pairs.find((p) => p.includes('a'))!.find((id) => id !== 'a')!;
    const near = { ...s, pieces: s.pieces.map((p) => (p.owner === 'a' ? { ...p, state: p.id === 'a-0' ? at(18, 17) : DONE } : p)) };
    const won = movePiece(moving(near, ['GEOL']), 'a', { pieceId: 'a-0', result: 'GEOL' });
    expect(won.winner).toBe('a');
    expect(won.winner).not.toBe(ally);
  });

  it('allies are still sent home by direct effects', () => {
    let s = use(game({ aug: { a: ['C-G1', 'C-P1'] }, place: { 'b-0': at(6, 5) } }), 'C-G1', {}, seq(0.1));
    s = use(s, 'C-P1');
    expect(stateOf(s, 'b-0')).toEqual(WAIT);
  });

  it('C-G13 jumps to the home corner', () => {
    expect(stateOf(use(game({ aug: { a: ['C-G13'] }, place: { 'a-0': at(3, 2) } }), 'C-G13', { pieceId: 'a-0' }), 'a-0')).toEqual(at(0, 19));
  });

  it('O-P2: a clone that finishes counts as one finished piece', () => {
    let s = use(game({ aug: { a: ['O-P2'] }, place: { 'a-0': at(18, 17) } }), 'O-P2', { pieceId: 'a-0' });
    expect(s.pieces.find((p) => p.clone)?.state).toEqual(at(18, 17));
    s = movePiece(moving(s, ['GEOL']), 'a', { pieceId: 'a-0', result: 'GEOL' });
    expect(s.pieces.some((p) => p.clone)).toBe(false);
    expect(s.pieces.filter((p) => p.owner === 'a' && p.state.kind === 'FINISHED')).toHaveLength(2);
  });

  it('O-P4 / A-P5 send adjacent enemies home', () => {
    const s = use(
      game({ aug: { a: ['O-P4'] }, place: { 'a-0': at(8, 7), 'b-0': at(9, 8), 'b-1': at(7, 6), 'b-2': at(11, 10) } }),
      'O-P4',
      { pieceId: 'a-0' },
    );
    expect([stateOf(s, 'b-0'), stateOf(s, 'b-1'), stateOf(s, 'b-2')]).toEqual([WAIT, WAIT, at(11, 10)]);
  });

  it('O-P5 rewinds the previous opponent turn', () => {
    let s = game({ aug: { b: ['O-P5'] } });
    s = throwYut(s, 'a', seq(...STICKS.DO));
    s = movePiece(s, 'a', { pieceId: 'a-0', result: 'DO' });
    expect(s.turn).toBe('b');
    expect(stateOf(activate(s, 'b', 'O-P5'), 'a-0')).toEqual(WAIT);
  });

  it('O-P5 also undoes a finish and brings back pieces captured in that turn', () => {
    let s = game({ aug: { b: ['O-P5'] }, place: { 'a-0': at(18, 17), 'a-1': at(2, 1), 'b-0': at(4, 3) } });
    s = { ...s, field: { ...s.field, turnStart: s.pieces } };
    // a captures b-0 (extra throw), throws Backdo, finishes a-0, then steps a-1 back: turn over.
    s = movePiece(moving(s, ['GEOL', 'GAE']), 'a', { pieceId: 'a-1', result: 'GAE' });
    s = throwYut(s, 'a', seq(...STICKS.BACKDO));
    s = movePiece(s, 'a', { pieceId: 'a-0', result: 'GEOL' });
    s = movePiece(s, 'a', { pieceId: 'a-1', result: 'BACKDO' });
    expect([stateOf(s, 'a-0'), stateOf(s, 'b-0'), s.turn]).toEqual([DONE, WAIT, 'b']);
    const t = activate(s, 'b', 'O-P5');
    expect([stateOf(t, 'a-0'), stateOf(t, 'a-1'), stateOf(t, 'b-0')]).toEqual([at(18, 17), at(2, 1), at(4, 3)]);
  });

  it('O-P6 gives one more turn that does not count as a round', () => {
    let s = use(game({ aug: { a: ['O-P6'] } }), 'O-P6');
    s = throwYut(s, 'a', seq(...STICKS.BACKDO));
    expect(s.turn).toBe('a');
    expect(s.field.bonusTurn).toBe(true);
    s = throwYut(s, 'a', seq(...STICKS.BACKDO));
    expect(s.turn).toBe('b');
    expect(player(s, 'a').regularTurnsCompleted).toBe(1);
  });

  it('A-P4 swaps the leader’s lead piece with my last piece', () => {
    const s = use(game({ aug: { a: ['A-P4'] }, place: { 'a-0': at(2, 1), 'b-0': at(17, 16), 'b-1': DONE } }), 'A-P4');
    expect(stateOf(s, 'a-0')).toEqual(at(17, 16));
  });

  it('A-P6: every finish this turn gives a throw', () => {
    const s = use(game({ aug: { a: ['A-P6'] }, place: { 'a-0': at(18, 17) } }), 'A-P6');
    expect(movePiece(moving(s, ['GEOL']), 'a', { pieceId: 'a-0', result: 'GEOL' }).throwsRemaining).toBe(1);
  });

  it('A-P7 duplicates the latest result, O-G9 adjusts it', () => {
    const s = game({ aug: { a: ['A-P7', 'O-G9'] }, pending: ['GAE'] });
    expect(use(s, 'A-P7').pendingResults).toEqual(['GAE', 'GAE']);
    expect(use(s, 'O-G9', { delta: 1 }).pendingResults).toEqual(['GEOL']);
    expect(() => use(game({ aug: { a: ['O-G9'] }, pending: ['MO'] }), 'O-G9', { delta: 1 })).toThrow('조정');
  });

  it('A-G3 swaps my result with the next player’s next throw', () => {
    const s = use(game({ aug: { a: ['A-G3'] }, pending: ['MO'] }), 'A-G3', {}, seq(...STICKS.DO));
    expect(s.pendingResults).toEqual(['DO']);
    expect(player(s, 'b').status.forced).toBe('MO');
  });

  it('A-P8 needs two finished pieces to send an enemy home', () => {
    const s = game({ aug: { a: ['A-P8'] }, place: { 'b-0': at(9, 8) } });
    expect(() => use(s, 'A-P8', { pieceId: 'b-0' })).toThrow('2개');
    const ready = game({ aug: { a: ['A-P8'] }, place: { 'b-0': at(9, 8), 'a-0': DONE, 'a-1': DONE } });
    expect(stateOf(use(ready, 'A-P8', { pieceId: 'b-0' }), 'b-0')).toEqual(WAIT);
  });

  it('C-P1 clears the board', () => {
    const s = use(game({ aug: { a: ['C-P1'] }, place: { 'a-0': at(3, 2), 'b-0': at(9, 8), 'b-1': DONE } }), 'C-P1');
    expect([stateOf(s, 'a-0'), stateOf(s, 'b-0'), stateOf(s, 'b-1')]).toEqual([WAIT, WAIT, DONE]);
  });

  it('C-P3 finishes a piece and gives others a throw; finishing all wins', () => {
    const s = use(game({ aug: { a: ['C-P3'] } }), 'C-P3', { pieceId: 'a-0' });
    expect(stateOf(s, 'a-0')).toEqual(DONE);
    expect(player(s, 'b').status.bonusThrows).toBe(1);
    const last = game({ aug: { a: ['C-P3'] }, place: { 'a-0': DONE, 'a-1': DONE, 'a-2': DONE } });
    expect(use(last, 'C-P3', { pieceId: 'a-3' }).winner).toBe('a');
  });

  it('C-P4 swaps board places pairwise with an opponent', () => {
    const s = use(game({ aug: { a: ['C-P4'] }, place: { 'a-0': at(2, 1), 'b-0': at(17, 16), 'b-1': at(9, 8) } }), 'C-P4', { playerId: 'b' });
    expect([stateOf(s, 'a-0'), stateOf(s, 'b-0'), stateOf(s, 'b-1')]).toEqual([at(17, 16), at(2, 1), at(9, 8)]);
  });

  it('C-P6 picks one of four pranks', () => {
    expect(stateOf(use(game({ aug: { a: ['C-P6'] }, place: { 'a-0': at(2, 1) } }), 'C-P6', {}, seq(0.1)), 'a-0')).toEqual(at(7, 6));
    const all = use(game({ aug: { a: ['C-P6'] } }), 'C-P6', {}, seq(0.9));
    expect(all.players.map((p) => p.status.bonusThrows)).toEqual([1, 1]);
  });

  it('C-P7 takes the leader’s finished count', () => {
    const s = use(game({ aug: { a: ['C-P7'] }, place: { 'b-0': DONE, 'b-1': DONE } }), 'C-P7');
    expect(s.pieces.filter((p) => p.owner === 'a' && p.state.kind === 'FINISHED')).toHaveLength(2);
    expect(s.pieces.filter((p) => p.owner === 'b' && p.state.kind === 'FINISHED')).toHaveLength(0);
  });

  it('C-P8 resets the board and puts one piece each on a corner', () => {
    const s = use(game({ aug: { a: ['C-P8'] }, place: { 'a-0': at(12, 11) } }), 'C-P8', {}, seq(0.1));
    expect(s.pieces.filter((p) => p.state.kind === 'ON_BOARD')).toHaveLength(2);
  });

  it('O-G3 turns the current player’s fresh result into Backdo', () => {
    const s = throwYut(game({ aug: { b: ['O-G3'] }, place: { 'a-0': at(6, 5) } }), 'a', seq(...STICKS.GEOL));
    expect(activeStatus(s, 'b', 'O-G3')).toBe('READY');
    expect(activate(s, 'b', 'O-G3').pendingResults).toEqual(['BACKDO']);
  });

  it('actives refuse outside their timing', () => {
    const s = { ...game({ aug: { a: ['O-S13', 'C-G4'] } }), turn: 'b' };
    expect(() => useAugment(s, 'a', 'O-S13')).toThrow('지금은');
    expect(() => useAugment(s, 'a', 'C-G4')).toThrow('지금은');
  });
});
