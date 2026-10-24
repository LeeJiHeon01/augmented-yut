import { describe, expect, it } from 'vitest';
import type { GameState, PieceState } from './game';
import { autoAct, completedRound, movePiece, standings, startGame, throwYut } from './turn';
import type { YutResult } from './yut';

/** Random values that make `throwSticks` produce each result (value < 0.5 = flat side). */
const STICKS: Record<YutResult, number[]> = {
  BACKDO: [0.1, 0.9, 0.9, 0.9],
  DO: [0.9, 0.1, 0.9, 0.9],
  GAE: [0.1, 0.1, 0.9, 0.9],
  GEOL: [0.1, 0.1, 0.1, 0.9],
  YUT: [0.1, 0.1, 0.1, 0.1],
  MO: [0.9, 0.9, 0.9, 0.9],
};

function randomFor(...results: YutResult[]): () => number {
  const values = results.flatMap((r) => STICKS[r]);
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

const PLAYERS = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id }));
const at = (node: number, prev: number): PieceState => ({ kind: 'ON_BOARD', node, prev });

function withPieces(state: GameState, states: Record<string, PieceState>): GameState {
  return {
    ...state,
    pieces: state.pieces.map((p) => {
      const next = states[p.id];
      return next ? { ...p, state: next } : p;
    }),
  };
}

describe('startGame', () => {
  it('gives every player four waiting pieces and starts with the first seat', () => {
    const s = startGame('r1', PLAYERS);
    expect(s.pieces).toHaveLength(16);
    expect(s.pieces.every((p) => p.state.kind === 'WAITING')).toBe(true);
    expect(s).toMatchObject({ phase: 'THROW', turn: 'a', throwsRemaining: 1, pendingResults: [], winner: null });
  });
});

describe('throwYut', () => {
  it('moves to MOVE after a normal throw', () => {
    const s = throwYut(startGame('r1', PLAYERS), 'a', randomFor('GAE'));
    expect(s).toMatchObject({ phase: 'MOVE', throwsRemaining: 0, pendingResults: ['GAE'] });
  });

  it('grants another throw for yut and mo', () => {
    const s = throwYut(startGame('r1', PLAYERS), 'a', randomFor('YUT'));
    expect(s).toMatchObject({ phase: 'THROW', throwsRemaining: 1, pendingResults: ['YUT'] });
  });

  it('rejects a throw out of turn', () => {
    expect(() => throwYut(startGame('r1', PLAYERS), 'b', randomFor('DO'))).toThrow('차례');
  });

  it('ends the turn when a lone backdo cannot be used', () => {
    const s = throwYut(startGame('r1', PLAYERS), 'a', randomFor('BACKDO'));
    expect(s).toMatchObject({ phase: 'THROW', turn: 'b', pendingResults: [] });
    expect(s.players[0]?.regularTurnsCompleted).toBe(1);
  });
});

describe('movePiece', () => {
  it('uses the result and passes the turn', () => {
    const thrown = throwYut(startGame('r1', PLAYERS), 'a', randomFor('GAE'));
    const s = movePiece(thrown, 'a', { pieceId: 'a-0', result: 'GAE' });
    expect(s.pieces.find((p) => p.id === 'a-0')?.state).toEqual(at(2, 1));
    expect(s).toMatchObject({ turn: 'b', phase: 'THROW', throwsRemaining: 1 });
    expect(s.players[0]?.regularTurnsCompleted).toBe(1);
  });

  it('rejects moving an enemy piece or an unthrown result', () => {
    const thrown = throwYut(startGame('r1', PLAYERS), 'a', randomFor('GAE'));
    expect(() => movePiece(thrown, 'a', { pieceId: 'b-0', result: 'GAE' })).toThrow('내 말');
    expect(() => movePiece(thrown, 'a', { pieceId: 'a-0', result: 'MO' })).toThrow('결과');
  });

  it('grants an extra throw after a capture and keeps the turn', () => {
    const base = withPieces(startGame('r1', PLAYERS), { 'b-0': at(2, 1) });
    const thrown = throwYut(base, 'a', randomFor('GAE'));
    const s = movePiece(thrown, 'a', { pieceId: 'a-0', result: 'GAE' });
    expect(s.pieces.find((p) => p.id === 'b-0')?.state).toEqual({ kind: 'WAITING' });
    expect(s).toMatchObject({ turn: 'a', phase: 'THROW', throwsRemaining: 1 });
  });

  it('keeps a backdo usable once a piece enters', () => {
    let s = throwYut(startGame('r1', PLAYERS), 'a', randomFor('YUT', 'BACKDO'));
    s = throwYut(s, 'a', randomFor('BACKDO'));
    expect(s).toMatchObject({ phase: 'MOVE', pendingResults: ['YUT', 'BACKDO'] });
    s = movePiece(s, 'a', { pieceId: 'a-0', result: 'YUT' });
    expect(s).toMatchObject({ phase: 'MOVE', turn: 'a', pendingResults: ['BACKDO'] });
    s = movePiece(s, 'a', { pieceId: 'a-0', result: 'BACKDO' });
    expect(s.pieces.find((p) => p.id === 'a-0')?.state).toEqual(at(3, 2));
    expect(s.turn).toBe('b');
  });

  it('ends the game immediately when the fourth piece finishes', () => {
    const done = { kind: 'FINISHED' } as const;
    const base = withPieces(startGame('r1', PLAYERS), { 'a-0': done, 'a-1': done, 'a-2': done, 'a-3': at(19, 18) });
    const thrown = throwYut(base, 'a', randomFor('GAE'));
    const s = movePiece(thrown, 'a', { pieceId: 'a-3', result: 'GAE' });
    expect(s).toMatchObject({ phase: 'FINISHED', winner: 'a' });
    expect(s.players[0]?.regularTurnsCompleted).toBe(0);
    expect(() => throwYut(s, 'a', randomFor('DO'))).toThrow('끝났');
  });
});

describe('completedRound', () => {
  it('counts rounds finished by every player', () => {
    // Different results so nobody lands on (and captures) another piece.
    let s = startGame('r1', PLAYERS);
    const plays: Array<[string, YutResult]> = [['a', 'DO'], ['b', 'GAE'], ['c', 'GEOL']];
    for (const [id, result] of plays) {
      s = throwYut(s, id, randomFor(result));
      s = movePiece(s, id, { pieceId: `${id}-0`, result });
    }
    expect(completedRound(s)).toBe(0);
    s = throwYut(s, 'd', randomFor('BACKDO'));
    expect(completedRound(s)).toBe(1);
  });

  it('does not count extra throws as turns', () => {
    let s = throwYut(startGame('r1', PLAYERS), 'a', randomFor('MO'));
    s = throwYut(s, 'a', randomFor('DO'));
    expect(s.players[0]?.regularTurnsCompleted).toBe(0);
  });
});

describe('autoAct', () => {
  it('throws for the current player during THROW', () => {
    const s = autoAct(startGame('r1', PLAYERS), randomFor('GAE'));
    expect(s.pendingResults).toEqual(['GAE']);
  });

  it('plays a random legal move during MOVE', () => {
    const thrown = throwYut(startGame('r1', PLAYERS), 'a', randomFor('GAE'));
    const s = autoAct(thrown, () => 0);
    expect(s.pieces.find((p) => p.id === 'a-0')?.state).toEqual(at(2, 1));
    expect(s.turn).toBe('b');
  });
});

describe('game stats and log', () => {
  it('counts throws and records each action', () => {
    let s = throwYut(startGame('r1', PLAYERS), 'a', randomFor('GAE'));
    s = movePiece(s, 'a', { pieceId: 'a-0', result: 'GAE' });
    expect(s.throwCount).toBe(1);
    expect(s.log).toEqual([
      { kind: 'THROW', playerId: 'a', result: 'GAE', auto: false },
      { kind: 'MOVE', playerId: 'a', pieceId: 'a-0', result: 'GAE', captured: 0, finished: 0, stacked: 0, auto: false },
    ]);
  });

  it('counts captures for the capturing player', () => {
    const base = withPieces(startGame('r1', PLAYERS), { 'b-0': at(2, 1) });
    const s = movePiece(throwYut(base, 'a', randomFor('GAE')), 'a', { pieceId: 'a-0', result: 'GAE' });
    expect(s.players[0]?.captures).toBe(1);
    expect(s.log.at(-1)).toMatchObject({ kind: 'MOVE', captured: 1 });
  });

  it('marks actions taken on timeout', () => {
    const s = autoAct(startGame('r1', PLAYERS), randomFor('GAE'));
    expect(s.log.at(-1)).toMatchObject({ kind: 'THROW', auto: true });
  });
});

describe('standings', () => {
  it('puts the winner first, then more finished pieces, then less distance left', () => {
    const done = { kind: 'FINISHED' } as const;
    const s = withPieces(startGame('r1', PLAYERS), {
      'a-0': done, 'a-1': done, 'a-2': done, 'a-3': done,
      'b-0': done,
      'c-0': done, 'c-1': at(18, 17),
      'd-0': done, 'd-1': at(3, 2),
    });
    expect(standings({ ...s, winner: 'a' }).map((p) => p.id)).toEqual(['a', 'c', 'd', 'b']);
  });
});
