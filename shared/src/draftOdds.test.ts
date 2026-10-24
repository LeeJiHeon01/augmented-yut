import { describe, expect, it } from 'vitest';
import { AUGMENTS, augmentById, type AugmentRarity } from './augment';
import { drawAugment, openDraft, pickAugment, rarityFor, rerollAugment } from './draft';
import type { GameState } from './game';
import { startGame } from './turn';

/** Evenly spaced rolls in [0, 1): exact shares instead of noisy samples. */
const grid = (n: number) => Array.from({ length: n }, (_, i) => (i + 0.5) / n);

/** Small seeded generator for long random runs. */
function lcg(seed: number): () => number {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

const poolOf = (rarity: AugmentRarity, excluded: string[] = []) =>
  AUGMENTS.filter((a) => a.enabled && a.rarity === rarity && !excluded.includes(a.id));

describe('draft odds', () => {
  it('rarity is exactly 40 / 40 / 20', () => {
    const counts = { SILVER: 0, GOLD: 0, PRISM: 0 };
    for (const r of grid(10_000)) counts[rarityFor(r)]++;
    expect(counts).toEqual({ SILVER: 4000, GOLD: 4000, PRISM: 2000 });
  });

  for (const rarity of ['SILVER', 'GOLD', 'PRISM'] as const) {
    it(`${rarity}: chaos augments share 5%, the others split 95% evenly`, () => {
      const pool = poolOf(rarity);
      const counts = new Map<string, number>();
      const rolls = grid(100_000);
      for (const r of rolls) {
        const id = drawAugment(pool, () => r)!.id;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      const chaos = pool.filter((a) => a.kind === 'CHAOS');
      const normal = pool.filter((a) => a.kind !== 'CHAOS');
      const chaosTotal = chaos.reduce((sum, a) => sum + (counts.get(a.id) ?? 0), 0);
      expect(chaosTotal / rolls.length).toBeCloseTo(0.05, 3);
      for (const a of normal) expect((counts.get(a.id) ?? 0) / rolls.length).toBeCloseTo(0.95 / normal.length, 3);
    });
  }

  it('owned cards drop out and the rest share the odds again', () => {
    const owned = poolOf('GOLD').filter((a) => a.kind !== 'CHAOS').slice(0, 10).map((a) => a.id);
    const pool = poolOf('GOLD', owned);
    const normal = pool.filter((a) => a.kind !== 'CHAOS');
    const counts = new Map<string, number>();
    const rolls = grid(100_000);
    for (const r of rolls) {
      const id = drawAugment(pool, () => r)!.id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(owned.some((id) => counts.has(id))).toBe(false);
    for (const a of normal) expect((counts.get(a.id) ?? 0) / rolls.length).toBeCloseTo(0.95 / normal.length, 3);
  });
});

describe('draft invariants over many random drafts', () => {
  const PLAYERS = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id }));

  it('offers three different cards of one rarity, never owned or discarded, through every reroll', () => {
    const random = lcg(42);
    let state: GameState = startGame('r', PLAYERS);
    for (let draft = 0; draft < 6; draft++) {
      state = openDraft({ ...state, players: state.players.map((p) => ({ ...p, status: { ...p.status, bonusRerolls: 2 } })) }, random);
      const rarity = state.draft!.rarity;
      for (const player of state.players) {
        for (let slot = 0; slot < 3; slot++) {
          for (let tries = 0; tries < 3; tries++) {
            try {
              state = rerollAugment(state, player.id, slot, random);
            } catch {
              // Out of rerolls for this card.
            }
          }
        }
        const offer = state.draft!.offers[player.id]!;
        expect(new Set(offer.cards).size).toBe(offer.cards.length);
        expect(offer.cards.every((id) => augmentById(id)?.rarity === rarity && augmentById(id)?.enabled)).toBe(true);
        expect(offer.cards.some((id) => player.augmentIds.includes(id) || offer.discarded.includes(id))).toBe(false);
        expect(new Set(offer.discarded).size).toBe(offer.discarded.length);
      }
      state = state.players.reduce((s, p) => pickAugment(s, p.id, s.draft!.offers[p.id]!.cards[0]!), state);
    }
    for (const p of state.players) {
      expect(p.augmentIds).toHaveLength(6);
      expect(new Set(p.augmentIds).size).toBe(6);
      // Four players: C-P2 may appear; nothing else is filtered.
    }
  });
});
