import { describe, expect, it } from 'vitest';
import { AUGMENTS, augmentById, MIN_PLAYERS_FOR } from './augment';

describe('AUGMENTS', () => {
  it('holds all 108 augments by rarity', () => {
    expect(AUGMENTS).toHaveLength(108);
    expect(AUGMENTS.filter((a) => a.rarity === 'SILVER')).toHaveLength(45);
    expect(AUGMENTS.filter((a) => a.rarity === 'GOLD')).toHaveLength(39);
    expect(AUGMENTS.filter((a) => a.rarity === 'PRISM')).toHaveLength(24);
  });

  it('draws every augment; C-P2 only in four-player games', () => {
    expect(AUGMENTS.filter((a) => !a.enabled)).toEqual([]);
    expect(augmentById('C-G1')?.enabled).toBe(true);
    expect(MIN_PLAYERS_FOR).toEqual({ 'C-P2': 4 });
  });
});
