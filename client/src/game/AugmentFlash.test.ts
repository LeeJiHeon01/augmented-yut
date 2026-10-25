import { describe, expect, it } from 'vitest';
import { flashOf } from './AugmentFlash';

describe('flashOf', () => {
  it('shows actives used and passives that fired', () => {
    expect(flashOf({ kind: 'USE', playerId: 'a', augmentId: 'O-S13', auto: false })).toEqual({ playerId: 'a', augmentId: 'O-S13', used: true });
    expect(flashOf({ kind: 'EFFECT', playerId: 'b', augmentId: 'A-S2', detail: '잡힘 회피', auto: false })?.used).toBe(false);
    expect(flashOf({ kind: 'THROW', playerId: 'a', result: 'GEOL', auto: false, augmentId: 'O-S4', from: 'GAE' })?.augmentId).toBe('O-S4');
  });

  it('skips plain throws and moves', () => {
    expect(flashOf({ kind: 'THROW', playerId: 'a', result: 'GAE', auto: false })).toBeNull();
    const move = { kind: 'MOVE' as const, playerId: 'a', pieceId: 'a-0', result: 'DO' as const, captured: 0, finished: 0, stacked: 0, auto: false };
    expect(flashOf(move)).toBeNull();
    expect(flashOf({ ...move, bonus: { augmentId: 'O-S2', steps: 1 } })?.augmentId).toBe('O-S2');
  });
});
