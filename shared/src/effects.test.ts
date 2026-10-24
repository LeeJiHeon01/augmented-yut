import { describe, expect, it } from 'vitest';
import { stepForward } from './board';
import { landingOf, routeOf } from './moves';
import { activeStatus, useAugment } from './actives';
import type { Move } from './moves';
import { planMove } from './play';
import type { GameState, PlayerId } from './game';
import { autoAct, movePiece, startGame, throwYut } from './turn';

const PLAYERS = ['a', 'b'].map((id) => ({ id, name: id }));

/** Cycles through the given values. */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

// Four stick rolls each (below 0.5 = flat side up).
const STICKS = {
  BACKDO: [0.1, 0.9, 0.9, 0.9],
  DO: [0.9, 0.1, 0.9, 0.9],
  GAE: [0.1, 0.1, 0.9, 0.9],
  YUT: [0.1, 0.1, 0.1, 0.1],
} as const;

function withAugments(owned: Record<PlayerId, string[]>): GameState {
  const base = startGame('r', PLAYERS);
  return { ...base, players: base.players.map((p) => ({ ...p, augmentIds: owned[p.id] ?? [] })) };
}

const playerOf = (s: GameState, id: PlayerId) => s.players.find((p) => p.id === id)!;
/** First augment bonus the move gets, or null. */
const moveBonus = (s: GameState, move: Move) => planMove(s, 'a', move).bonuses[0] ?? null;
const stateOf = (s: GameState, id: string) => s.pieces.find((p) => p.id === id)?.state;

describe('throw boosts', () => {
  it('O-S4 turns Gae into Geol half the time', () => {
    const s = withAugments({ a: ['O-S4'] });
    const hit = throwYut(s, 'a', seq(...STICKS.GAE, 0.3));
    expect(hit.pendingResults).toEqual(['GEOL']);
    expect(hit.log.at(-1)).toMatchObject({ kind: 'THROW', result: 'GEOL', augmentId: 'O-S4', from: 'GAE' });
    const miss = throwYut(s, 'a', seq(...STICKS.GAE, 0.6));
    expect(miss.pendingResults).toEqual(['GAE']);
    expect(miss.log.at(-1)).not.toHaveProperty('augmentId');
  });

  it('A-S4 turns Do into Geol 30% of the time', () => {
    const s = withAugments({ a: ['A-S4'] });
    expect(throwYut(s, 'a', seq(...STICKS.DO, 0.29)).pendingResults).toEqual(['GEOL']);
    expect(throwYut(s, 'a', seq(...STICKS.DO, 0.3)).pendingResults).toEqual(['DO']);
  });

  it('O-G4 turns Yut into Mo and keeps the extra throw', () => {
    const s = throwYut(withAugments({ a: ['O-G4'] }), 'a', seq(...STICKS.YUT, 0.1));
    expect(s.pendingResults).toEqual(['MO']);
    expect(s.phase).toBe('THROW');
    expect(s.throwsRemaining).toBe(1);
  });

  it('changes a result once, never in a chain', () => {
    const s = withAugments({ a: ['A-S4', 'O-S4', 'O-G4'] });
    const t = throwYut(s, 'a', seq(...STICKS.DO, 0.1, 0.1));
    expect(t.pendingResults).toEqual(['GEOL']);
    expect(t.log.at(-1)).toMatchObject({ augmentId: 'A-S4', from: 'DO' });
  });

  it('does not boost a reserved throw', () => {
    const s = useAugment(withAugments({ a: ['O-S13', 'O-S4'] }), 'a', 'O-S13');
    expect(throwYut(s, 'a', seq(0.1)).log.at(-1)).toMatchObject({ result: 'GEOL', augmentId: 'O-S13' });
  });

  it('only boosts the owner', () => {
    const s = withAugments({ b: ['O-S4'] });
    expect(throwYut(s, 'a', seq(...STICKS.GAE, 0.1)).pendingResults).toEqual(['GAE']);
  });
});

describe('O-S2 출발 대시', () => {
  const twoSteps = stepForward(null, 2);
  if (twoSteps === 'FINISHED') throw new Error('bad board');

  it('moves a piece entering the board one extra space', () => {
    const s = throwYut(withAugments({ a: ['O-S2'] }), 'a', seq(...STICKS.DO));
    expect(moveBonus(s, { pieceId: 'a-0', result: 'DO' })).toEqual({ augmentId: 'O-S2', steps: 1 });
    const moved = movePiece(s, 'a', { pieceId: 'a-0', result: 'DO' });
    expect(moved.pieces.find((p) => p.id === 'a-0')?.state).toMatchObject({ node: twoSteps.node });
    expect(moved.log.at(-1)).toMatchObject({ kind: 'MOVE', bonus: { augmentId: 'O-S2', steps: 1 } });
  });

  it('captures on the boosted landing square', () => {
    const base = throwYut(withAugments({ a: ['O-S2'] }), 'a', seq(...STICKS.DO));
    const s: GameState = {
      ...base,
      pieces: base.pieces.map((p) =>
        p.id === 'b-0' ? { ...p, state: { kind: 'ON_BOARD', node: twoSteps.node, prev: twoSteps.prev } } : p,
      ),
    };
    const moved = movePiece(s, 'a', { pieceId: 'a-0', result: 'DO' });
    expect(moved.pieces.find((p) => p.id === 'b-0')?.state.kind).toBe('WAITING');
    expect(moved.phase).toBe('THROW');
  });

  it('previews the same square and route the server moves to', () => {
    for (const result of ['DO', 'GAE', 'GEOL', 'YUT', 'MO'] as const) {
      const s = { ...withAugments({ a: ['O-S2'] }), phase: 'MOVE' as const, pendingResults: [result] };
      const piece = s.pieces.find((p) => p.id === 'a-0')!;
      const steps = moveBonus(s, { pieceId: 'a-0', result })?.steps ?? 0;
      const landing = landingOf(piece, result, steps);
      const moved = movePiece(s, 'a', { pieceId: 'a-0', result });
      expect(stateOf(moved, 'a-0')).toEqual({ kind: 'ON_BOARD', ...(landing as object) });
      expect(routeOf(piece, result, steps).at(-1)).toBe((landing as { node: number }).node);
    }
  });

  it('does not help pieces already on the board or players without it', () => {
    const s = withAugments({ a: ['O-S2'] });
    const onBoard: GameState = {
      ...s,
      pieces: s.pieces.map((p) => (p.id === 'a-0' ? { ...p, state: { kind: 'ON_BOARD', node: 3, prev: 2 } } : p)),
    };
    expect(moveBonus(onBoard, { pieceId: 'a-0', result: 'DO' })).toBeNull();
    expect(moveBonus(withAugments({}), { pieceId: 'a-0', result: 'DO' })).toBeNull();
  });
});

describe('O-S13 고정 투척', () => {
  it('reserves Geol for the next throw, twice per game', () => {
    const s = useAugment(withAugments({ a: ['O-S13'] }), 'a', 'O-S13');
    expect(activeStatus(s, 'a', 'O-S13')).toBe('RESERVED');
    expect(s.log.at(-1)).toMatchObject({ kind: 'USE', playerId: 'a', augmentId: 'O-S13' });
    const thrown = throwYut(s, 'a', seq(...STICKS.BACKDO));
    expect(thrown.pendingResults).toEqual(['GEOL']);
    expect(thrown.log.at(-1)).toMatchObject({ kind: 'THROW', result: 'GEOL', augmentId: 'O-S13' });
    expect(playerOf(thrown, 'a').reserved).toBeNull();
    expect(playerOf(thrown, 'a').augmentIds).toEqual(['O-S13']);
    // The second use leaves the hand once the reserved throw is made.
    const again = { ...thrown, phase: 'THROW' as const, throwsRemaining: 1 };
    const second = throwYut(useAugment(again, 'a', 'O-S13'), 'a', seq(...STICKS.BACKDO));
    expect(playerOf(second, 'a').augmentIds).toEqual([]);
    expect(playerOf(second, 'a').retired).toEqual(['O-S13']);
    expect(() => useAugment(second, 'a', 'O-S13')).toThrow('가지고 있지 않은');
  });

  it('works on a timeout throw too', () => {
    const s = autoAct(useAugment(withAugments({ a: ['O-S13'] }), 'a', 'O-S13'), seq(...STICKS.DO));
    expect(s.pendingResults).toEqual(['GEOL']);
  });

  it('is blocked outside my throw', () => {
    const s = withAugments({ a: ['O-S13'], b: ['O-S13'] });
    expect(activeStatus(s, 'b', 'O-S13')).toBe('BLOCKED');
    expect(() => useAugment(s, 'b', 'O-S13')).toThrow('지금은');
    const moving = throwYut(s, 'a', seq(...STICKS.GAE));
    expect(moving.phase).toBe('MOVE');
    expect(() => useAugment(moving, 'a', 'O-S13')).toThrow('지금은');
  });
});

describe('A-G12 위험한 도박', () => {
  it('makes the next throw Mo or Backdo, twice per game', () => {
    const s = useAugment(withAugments({ a: ['A-G12'] }), 'a', 'A-G12');
    const mo = throwYut(s, 'a', seq(0.3));
    expect(mo.pendingResults).toEqual(['MO']);
    expect(mo.throwsRemaining).toBe(1);
    const again = useAugment(mo, 'a', 'A-G12');
    const backdo = throwYut(again, 'a', seq(0.7));
    expect(backdo.pendingResults).toEqual(['MO', 'BACKDO']);
    expect(playerOf(again, 'a').augmentIds).toEqual(['A-G12']);
    expect(playerOf(backdo, 'a').retired).toEqual(['A-G12']);
  });

  it('cannot stack on another reserved throw', () => {
    const s = useAugment(withAugments({ a: ['O-S13', 'A-G12'] }), 'a', 'O-S13');
    expect(activeStatus(s, 'a', 'A-G12')).toBe('BLOCKED');
    expect(() => useAugment(s, 'a', 'A-G12')).toThrow('예약');
  });
});

describe('O-S3 두 번째 기회', () => {
  it('throws away the result just thrown and gives the throw back', () => {
    const thrown = throwYut(withAugments({ a: ['O-S3'] }), 'a', seq(...STICKS.GAE));
    expect(activeStatus(thrown, 'a', 'O-S3')).toBe('READY');
    const s = useAugment(thrown, 'a', 'O-S3');
    expect(s.phase).toBe('THROW');
    expect(s.pendingResults).toEqual([]);
    expect(s.throwsRemaining).toBe(1);
    expect(s.log.at(-1)).toMatchObject({ kind: 'USE', augmentId: 'O-S3', discarded: 'GAE' });
  });

  it('takes back the extra throw a discarded Yut gave', () => {
    const thrown = throwYut(withAugments({ a: ['O-S3'] }), 'a', seq(...STICKS.YUT));
    const s = useAugment(thrown, 'a', 'O-S3');
    expect(s.pendingResults).toEqual([]);
    expect(s.throwsRemaining).toBe(1);
  });

  it('only replaces the latest throw: an extra throw already thrown keeps the Yut', () => {
    let t = throwYut(withAugments({ a: ['O-S3'] }), 'a', seq(...STICKS.YUT));
    t = throwYut(t, 'a', seq(...STICKS.GAE));
    const s = useAugment(t, 'a', 'O-S3');
    expect(s.pendingResults).toEqual(['YUT']);
    expect(s.throwsRemaining).toBe(1);
    expect(s.log.at(-1)).toMatchObject({ discarded: 'GAE' });
  });

  it('only right after my own throw and at most twice', () => {
    const s = withAugments({ a: ['O-S3'] });
    expect(activeStatus(s, 'a', 'O-S3')).toBe('BLOCKED');
    const moved = movePiece(throwYut(s, 'a', seq(...STICKS.GAE)), 'a', { pieceId: 'a-0', result: 'GAE' });
    expect(() => useAugment(moved, 'a', 'O-S3')).toThrow('지금은');

    let t = throwYut(s, 'a', seq(...STICKS.GAE));
    t = throwYut(useAugment(t, 'a', 'O-S3'), 'a', seq(...STICKS.GAE));
    t = useAugment(t, 'a', 'O-S3');
    t = throwYut(t, 'a', seq(...STICKS.GAE));
    expect(playerOf(t, 'a').retired).toEqual(['O-S3']);
    expect(playerOf(t, 'a').augmentIds).toEqual([]);
  });
});

describe('useAugment', () => {
  it('rejects augments not owned or without an active effect yet', () => {
    const s = withAugments({ a: ['O-S4', 'ZZ-1'] });
    expect(() => useAugment(s, 'a', 'O-S13')).toThrow('가지고 있지 않은');
    expect(() => useAugment(s, 'a', 'O-S4')).toThrow('사용할 수 없는');
    expect(() => useAugment(s, 'a', 'ZZ-1')).toThrow('사용할 수 없는');
  });
});
