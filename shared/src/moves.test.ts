import { describe, expect, it } from 'vitest';
import type { Piece, PieceState } from './game';
import { applyMove, landingOf, legalMoves, routeOf } from './moves';

const waiting: PieceState = { kind: 'WAITING' };
const at = (node: number, prev: number): PieceState => ({ kind: 'ON_BOARD', node, prev });
const piece = (id: string, owner: string, state: PieceState = waiting): Piece => ({ id, owner, state });
const stateOf = (pieces: Piece[], id: string) => pieces.find((p) => p.id === id)?.state;

describe('legalMoves', () => {
  it('offers one waiting piece and one piece per board stack', () => {
    const pieces = [
      piece('a1', 'a'),
      piece('a2', 'a'),
      piece('a3', 'a', at(3, 2)),
      piece('a4', 'a', at(3, 2)),
      piece('b1', 'b', at(7, 6)),
    ];
    expect(legalMoves(pieces, 'a', ['GAE'])).toEqual([
      { pieceId: 'a1', result: 'GAE' },
      { pieceId: 'a3', result: 'GAE' },
    ]);
  });

  it('lists each distinct result once', () => {
    const pieces = [piece('a1', 'a')];
    expect(legalMoves(pieces, 'a', ['YUT', 'YUT', 'DO'])).toEqual([
      { pieceId: 'a1', result: 'YUT' },
      { pieceId: 'a1', result: 'DO' },
    ]);
  });

  it('allows backdo only for pieces on the board', () => {
    expect(legalMoves([piece('a1', 'a')], 'a', ['BACKDO'])).toEqual([]);
    expect(legalMoves([piece('a1', 'a', at(2, 1))], 'a', ['BACKDO'])).toEqual([
      { pieceId: 'a1', result: 'BACKDO' },
    ]);
  });
});

describe('applyMove', () => {
  it('enters a waiting piece', () => {
    const out = applyMove([piece('a1', 'a')], { pieceId: 'a1', result: 'GEOL' });
    expect(stateOf(out.pieces, 'a1')).toEqual(at(3, 2));
    expect(out).toMatchObject({ capturedCount: 0, finishedCount: 0 });
  });

  it('stacks onto an own piece and moves the stack together afterwards', () => {
    const first = applyMove([piece('a1', 'a'), piece('a2', 'a', at(2, 1))], { pieceId: 'a1', result: 'GAE' });
    expect(stateOf(first.pieces, 'a1')).toEqual(at(2, 1));
    const second = applyMove(first.pieces, { pieceId: 'a2', result: 'DO' });
    expect(stateOf(second.pieces, 'a1')).toEqual(at(3, 2));
    expect(stateOf(second.pieces, 'a2')).toEqual(at(3, 2));
  });

  it('moves stacked pieces back together on backdo', () => {
    const pieces = [piece('a1', 'a', at(6, 5)), piece('a2', 'a', at(6, 5))];
    const out = applyMove(pieces, { pieceId: 'a1', result: 'BACKDO' });
    expect(stateOf(out.pieces, 'a1')).toEqual(at(5, 4));
    expect(stateOf(out.pieces, 'a2')).toEqual(at(5, 4));
  });

  it('captures an enemy piece on the landing node only', () => {
    const pieces = [piece('a1', 'a', at(1, 0)), piece('b1', 'b', at(2, 1)), piece('b2', 'b', at(3, 2))];
    const out = applyMove(pieces, { pieceId: 'a1', result: 'GAE' });
    expect(stateOf(out.pieces, 'b2')).toEqual(waiting);
    expect(stateOf(out.pieces, 'b1')).toEqual(at(2, 1));
    expect(out.capturedCount).toBe(1);
  });

  it('captures every piece of an enemy stack', () => {
    const pieces = [piece('a1', 'a'), piece('b1', 'b', at(4, 3)), piece('b2', 'b', at(4, 3))];
    const out = applyMove(pieces, { pieceId: 'a1', result: 'YUT' });
    expect(stateOf(out.pieces, 'b1')).toEqual(waiting);
    expect(stateOf(out.pieces, 'b2')).toEqual(waiting);
    expect(out.capturedCount).toBe(2);
  });

  it('captures on the home corner', () => {
    const pieces = [piece('a1', 'a', at(19, 18)), piece('b1', 'b', at(0, 19))];
    const out = applyMove(pieces, { pieceId: 'a1', result: 'DO' });
    expect(stateOf(out.pieces, 'b1')).toEqual(waiting);
    expect(stateOf(out.pieces, 'a1')).toEqual(at(0, 19));
  });

  it('finishes the whole stack', () => {
    const pieces = [piece('a1', 'a', at(19, 18)), piece('a2', 'a', at(19, 18))];
    const out = applyMove(pieces, { pieceId: 'a2', result: 'GAE' });
    expect(stateOf(out.pieces, 'a1')).toEqual({ kind: 'FINISHED' });
    expect(stateOf(out.pieces, 'a2')).toEqual({ kind: 'FINISHED' });
    expect(out.finishedCount).toBe(2);
  });

  it('rejects backdo for a waiting piece and moves for finished pieces', () => {
    expect(() => applyMove([piece('a1', 'a')], { pieceId: 'a1', result: 'BACKDO' })).toThrow('빽도');
    expect(() => applyMove([piece('a1', 'a', { kind: 'FINISHED' })], { pieceId: 'a1', result: 'DO' })).toThrow();
  });

  it('does not mutate the input', () => {
    const pieces = [piece('a1', 'a')];
    applyMove(pieces, { pieceId: 'a1', result: 'DO' });
    expect(pieces[0]?.state).toEqual(waiting);
  });
});

describe('applyMove stacking count', () => {
  it('reports own pieces joined at the landing node', () => {
    const out = applyMove([piece('a1', 'a'), piece('a2', 'a', at(2, 1))], { pieceId: 'a1', result: 'GAE' });
    expect(out.stackedCount).toBe(1);
    expect(applyMove([piece('a1', 'a')], { pieceId: 'a1', result: 'GAE' }).stackedCount).toBe(0);
  });
});

describe('landingOf', () => {
  it('previews the landing spot without moving anything', () => {
    expect(landingOf(piece('a1', 'a'), 'GAE')).toEqual({ node: 2, prev: 1 });
    expect(landingOf(piece('a1', 'a', at(5, 4)), 'GAE')).toEqual({ node: 21, prev: 20 });
    expect(landingOf(piece('a1', 'a', at(2, 1)), 'BACKDO')).toEqual({ node: 1, prev: 0 });
  });

  it('reports finishing and refuses impossible moves', () => {
    expect(landingOf(piece('a1', 'a', at(19, 18)), 'GEOL')).toBe('FINISHED');
    expect(() => landingOf(piece('a1', 'a'), 'BACKDO')).toThrow('빽도');
    expect(() => landingOf(piece('a1', 'a', { kind: 'FINISHED' }), 'DO')).toThrow();
  });
});

describe('routeOf', () => {
  it('lists every node passed, ending on the landing node', () => {
    expect(routeOf(piece('a1', 'a'), 'GEOL')).toEqual([1, 2, 3]);
    expect(routeOf(piece('a1', 'a', at(5, 4)), 'GAE')).toEqual([20, 21]);
    expect(routeOf(piece('a1', 'a', at(2, 1)), 'BACKDO')).toEqual([1]);
  });

  it('ends on the start node when the piece finishes', () => {
    expect(routeOf(piece('a1', 'a', at(18, 17)), 'GEOL')).toEqual([19, 0]);
  });
});
