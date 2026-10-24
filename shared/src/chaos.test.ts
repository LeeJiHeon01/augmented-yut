import { describe, expect, it } from 'vitest';
import { stepForward } from './board';
import { applyChaos, CHAOS_EVENTS, runChaos } from './chaos';
import { pickAugment, openDraft } from './draft';
import type { GameState, Piece, PieceState } from './game';
import { applyMove, legalMoves } from './moves';
import { allied, movesFor, planMove } from './play';
import { autoAct, movePiece, startGame, throwYut } from './turn';

const PLAYERS = ['a', 'b', 'c'].map((id) => ({ id, name: id }));

/** Cycles through the given values. */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

const doSpot = stepForward(null, 1);
if (doSpot === 'FINISHED') throw new Error('bad board');
const at = (node: number, prev: number): PieceState => ({ kind: 'ON_BOARD', node, prev });

function withPieces(place: Record<string, PieceState>): GameState {
  const base = startGame('r', PLAYERS);
  return { ...base, pieces: base.pieces.map((p): Piece => (place[p.id] ? { ...p, state: place[p.id]! } : p)) };
}

const stateOf = (s: GameState, id: string) => s.pieces.find((p) => p.id === id)?.state;
const E5 = 'E5';
const E6 = 'E6';

describe('CHAOS_EVENTS', () => {
  it('lists E1~E8, all drawn; E2 needs three or more players', () => {
    expect(CHAOS_EVENTS.map((e) => e.id)).toEqual(['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8']);
    expect(CHAOS_EVENTS.filter((e) => !e.enabled)).toEqual([]);
    expect(CHAOS_EVENTS.find((e) => e.id === 'E2')?.minPlayers).toBe(3);
  });
});

describe('E5 왕의 몰락', () => {
  it("sends the leader's most advanced board piece home", () => {
    const s = withPieces({
      'a-0': { kind: 'FINISHED' },
      'a-1': at(1, 0),
      'a-2': at(8, 7),
      'b-0': at(10, 9),
    });
    const next = applyChaos(s, E5, seq(0.1));
    expect(stateOf(next, 'a-2')?.kind).toBe('WAITING');
    expect(stateOf(next, 'a-1')?.kind).toBe('ON_BOARD');
    expect(stateOf(next, 'a-0')?.kind).toBe('FINISHED');
    expect(stateOf(next, 'b-0')?.kind).toBe('ON_BOARD');
    expect(next.log.at(-1)).toMatchObject({ kind: 'CHAOS', eventId: 'E5', pieceIds: ['a-2'] });
    expect(next.chaosDone).toBe(1);
    expect(next.lastChaos).toBe('E5');
  });

  // Event exception: a capture sends a whole stack home, E5 takes exactly one piece.
  it('only takes one piece out of a stack', () => {
    const s = withPieces({ 'a-0': at(8, 7), 'a-1': at(8, 7) });
    const next = applyChaos(s, E5, seq(0.1));
    expect(next.pieces.filter((p) => p.owner === 'a' && p.state.kind === 'ON_BOARD')).toHaveLength(1);
  });

  it('is not a capture: no extra throw, no capture count, same turn', () => {
    const s = withPieces({ 'a-0': { kind: 'FINISHED' }, 'a-1': at(8, 7) });
    const next = applyChaos(s, E5, seq(0.1));
    expect(next.throwsRemaining).toBe(s.throwsRemaining);
    expect(next.turn).toBe(s.turn);
    expect(next.players.map((p) => p.captures)).toEqual(s.players.map((p) => p.captures));
  });

  it('does nothing but log when the leader has no piece on the board', () => {
    const s = withPieces({ 'a-0': { kind: 'FINISHED' }, 'b-0': at(5, 4) });
    const next = applyChaos(s, E5, seq(0.1));
    expect(next.pieces).toEqual(s.pieces);
    expect(next.log.at(-1)).toMatchObject({ kind: 'CHAOS', eventId: 'E5', pieceIds: [] });
  });
});

describe('E6 전원 출동', () => {
  it('moves one waiting piece of every player one space onto the board without captures', () => {
    const s = withPieces({ 'b-0': at(doSpot.node, doSpot.prev), 'c-0': at(5, 4), 'c-1': at(5, 4), 'c-2': at(5, 4), 'c-3': at(5, 4) });
    const next = applyChaos(s, E6, seq(0.1));
    expect(stateOf(next, 'a-0')).toEqual(at(doSpot.node, doSpot.prev));
    expect(stateOf(next, 'b-1')).toEqual(at(doSpot.node, doSpot.prev));
    // Nobody is captured, and a player with no waiting piece is skipped.
    expect(stateOf(next, 'b-0')).toEqual(at(doSpot.node, doSpot.prev));
    expect(next.pieces.filter((p) => p.owner === 'c').every((p) => p.state.kind === 'ON_BOARD')).toBe(true);
    expect(next.log.at(-1)).toMatchObject({ kind: 'CHAOS', eventId: 'E6', pieceIds: ['a-0', 'b-1'] });
  });
});

describe('pieces sharing a node after E6', () => {
  const shared = () => applyChaos(withPieces({}), E6, seq(0.1));

  it('each player only moves their own pieces from the shared node', () => {
    const s = applyChaos(withPieces({}), E6, seq(0.1));
    const moved = applyMove(s.pieces, { pieceId: 'a-0', result: 'GAE' });
    expect(moved.capturedCount).toBe(0);
    expect(stateOf({ ...s, pieces: moved.pieces }, 'b-0')).toEqual(at(doSpot.node, doSpot.prev));
    expect(legalMoves(s.pieces, 'b', ['DO']).map((m) => m.pieceId)).toEqual(['b-1', 'b-0']);
  });

  it('a later piece landing there captures every enemy and stacks with its own', () => {
    const s = shared();
    const entered = applyMove(s.pieces, { pieceId: 'a-1', result: 'DO' });
    expect(entered.capturedCount).toBe(2);
    expect(entered.stackedCount).toBe(1);
    const after = { ...s, pieces: entered.pieces };
    expect(['b-0', 'c-0'].map((id) => stateOf(after, id)?.kind)).toEqual(['WAITING', 'WAITING']);
  });
});

describe('chaos schedule', () => {
  /** One full round: everyone throws Backdo with no piece out, which ends the turn. */
  function playRound(s: GameState): GameState {
    return PLAYERS.reduce((state, p) => throwYut(state, p.id, seq(0.1, 0.9, 0.9, 0.9)), s);
  }
  const pickAll = (s: GameState) =>
    s.players.reduce((acc, p) => pickAugment(acc, p.id, acc.draft!.offers[p.id]!.cards[0]!, null, () => 0), s);

  it('fires after every fourth full round, after that round’s augment draft', () => {
    let s = pickAll(openDraft(startGame('r', PLAYERS), seq(0.1)));
    for (let round = 1; round <= 3; round++) {
      s = playRound(s);
      if (s.phase === 'AUGMENT_PICK') s = pickAll(s);
    }
    expect(s.chaosDone).toBe(0);
    s = playRound(s);
    expect([s.chaosDone, s.phase]).toEqual([0, 'AUGMENT_PICK']);
    s = pickAll(s);
    expect(s.chaosDone).toBe(1);
    expect(s.log.at(-1)?.kind).toBe('CHAOS');
  });

  it('avoids repeating the previous event', () => {
    const once = applyChaos(withPieces({}), E5, seq(0.1));
    for (let i = 0; i < 20; i++) expect(runChaos(once, seq((i + 0.5) / 20)).lastChaos).not.toBe('E5');
  });

  it('marks the timed-out throw as auto, not the chaos that followed', () => {
    let s = pickAll(openDraft(startGame('r', PLAYERS), seq(0.1)));
    for (let round = 1; round <= 3; round++) {
      s = playRound(s);
      if (s.phase === 'AUGMENT_PICK') s = pickAll(s);
    }
    s = throwYut(throwYut(s, 'a', seq(0.1, 0.9, 0.9, 0.9)), 'b', seq(0.1, 0.9, 0.9, 0.9));
    const after = autoAct(s, seq(0.1, 0.9, 0.9, 0.9));
    const throwEntry = after.log.filter((e) => e.kind === 'THROW').at(-1);
    expect(throwEntry?.auto).toBe(true);
    // The draft opens first; its timeout then runs the chaos event, not marked as auto.
    const picked = autoAct(after, seq(0.1));
    expect(picked.log.at(-1)).toMatchObject({ kind: 'CHAOS', auto: false });
  });
});

describe('E1 / E8 move pieces at once', () => {
  it('E1 scatters every board piece without capturing', () => {
    const s = withPieces({ 'a-0': at(3, 2), 'b-0': at(9, 8), 'c-0': { kind: 'FINISHED' } });
    const next = applyChaos(s, 'E1', seq(0.5));
    expect(stateOf(next, 'a-0')).toMatchObject({ kind: 'ON_BOARD', node: 14 });
    expect(stateOf(next, 'b-0')).toMatchObject({ kind: 'ON_BOARD', node: 14 });
    expect(stateOf(next, 'c-0')).toEqual({ kind: 'FINISHED' });
    expect(next.pieces.filter((p) => p.state.kind === 'WAITING')).toHaveLength(9);
  });

  it('E8 swaps two pairs of pieces of different players, or fewer when short', () => {
    const s = withPieces({ 'a-0': at(3, 2), 'b-0': at(9, 8), 'a-1': at(12, 11), 'c-0': at(17, 16) });
    const next = applyChaos(s, 'E8', seq(0));
    expect(stateOf(next, 'a-0')).toEqual(at(9, 8));
    expect(stateOf(next, 'b-0')).toEqual(at(3, 2));
    expect(stateOf(next, 'a-1')).toEqual(at(17, 16));
    const lonely = applyChaos(withPieces({ 'a-0': at(3, 2), 'a-1': at(5, 4) }), 'E8', seq(0));
    expect(lonely.log.at(-1)).toMatchObject({ kind: 'CHAOS', eventId: 'E8', pieceIds: [] });
  });
});

describe('lasting events (E3 / E4 / E7) run for one round', () => {
  const moving = (s: GameState, result: 'DO' | 'GAE' | 'BACKDO'): GameState => ({
    ...s,
    phase: 'MOVE',
    pendingResults: [result],
    throwsRemaining: 0,
  });

  it('E3 reverses moves and turns Backdo forward', () => {
    const s = applyChaos(withPieces({ 'a-0': at(8, 7) }), 'E3', seq(0));
    expect(s.field.chaosActive).toEqual([{ eventId: 'E3', untilRound: 1 }]);
    expect(planMove(moving(s, 'GAE'), 'a', { pieceId: 'a-0', result: 'GAE' }).landing).toEqual({ node: 6, prev: 5 });
    expect(planMove(moving(s, 'BACKDO'), 'a', { pieceId: 'a-0', result: 'BACKDO' }).landing).toEqual({ node: 9, prev: 8 });
    // Waiting pieces cannot enter backwards.
    expect(movesFor(moving(s, 'GAE'), 'a').map((m) => m.pieceId)).toEqual(['a-0']);
  });

  it('E4 opens shortcuts when passing a corner', () => {
    const s = applyChaos(withPieces({ 'a-0': at(4, 3) }), 'E4', seq(0));
    expect(planMove(moving(s, 'GAE'), 'a', { pieceId: 'a-0', result: 'GAE' }).landing).toEqual({ node: 20, prev: 5 });
  });

  it('E7 stops Yut and Mo from giving another throw', () => {
    const s = applyChaos(withPieces({}), 'E7', seq(0));
    const t = throwYut(s, 'a', seq(0.1, 0.1, 0.1, 0.1));
    expect(t.pendingResults).toEqual(['YUT']);
    expect(t.phase).toBe('MOVE');
  });

  it('ends once every player finishes one more turn', () => {
    let s = applyChaos(withPieces({}), 'E7', seq(0));
    for (const p of PLAYERS) s = throwYut(s, p.id, seq(0.1, 0.9, 0.9, 0.9));
    expect(s.field.chaosActive).toEqual([]);
  });
});

describe('E2 temporary alliance', () => {
  it('3 players: two allies, one alone; allies cannot capture each other but the lone player can', () => {
    const s = applyChaos(withPieces({}), 'E2', seq(0.9, 0.9));
    expect(s.field.alliance).toMatchObject({ source: 'E2', clock: 'ROUND', until: 1 });
    expect(s.field.alliance?.pairs).toHaveLength(1);
    const [x, y] = s.field.alliance!.pairs[0]!;
    const lone = PLAYERS.map((p) => p.id).find((id) => id !== x && id !== y)!;
    expect(allied(s, x, y) && allied(s, y, x)).toBe(true);
    expect(allied(s, x, lone)).toBe(false);

    const place = (state: GameState, ids: Record<string, PieceState>): GameState => ({
      ...state,
      pieces: state.pieces.map((p) => (ids[p.id] ? { ...p, state: ids[p.id]! } : p)),
    });
    const board = place(s, { [`${x}-0`]: at(2, 1), [`${y}-0`]: at(4, 3), [`${lone}-0`]: at(4, 3) });
    const moving = { ...board, turn: x, phase: 'MOVE' as const, pendingResults: ['GAE' as const], throwsRemaining: 0 };
    const t = movePiece(moving, x, { pieceId: `${x}-0`, result: 'GAE' });
    expect(stateOf(t, `${y}-0`)).toEqual(at(4, 3));
    expect(stateOf(t, `${lone}-0`)).toEqual({ kind: 'WAITING' });
  });

  it('2 players never draw it', () => {
    const two = startGame('r', [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }]);
    for (let i = 0; i < 20; i++) expect(runChaos(two, seq((i + 0.5) / 20)).lastChaos).not.toBe('E2');
  });

  it('4 players pair up 2:2 and it ends after one round', () => {
    const four = startGame('r', ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id })));
    let s = applyChaos(four, 'E2', seq(0.3, 0.7, 0.1));
    expect(s.field.alliance?.pairs).toHaveLength(2);
    for (const id of ['a', 'b', 'c', 'd']) s = throwYut(s, id, seq(0.1, 0.9, 0.9, 0.9));
    expect(s.field.alliance).toBeNull();
  });
});

