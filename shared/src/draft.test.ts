import { describe, expect, it } from 'vitest';
import { AUGMENTS, augmentById, type AugmentDefinition } from './augment';
import { autoPick, drawAugment, MAX_AUGMENTS, openDraft, passDraft, pickAugment, rarityFor, rerollAugment } from './draft';
import type { GameState, PieceState } from './game';
import { startGame, throwYut } from './turn';

const PLAYERS = ['a', 'b', 'c'].map((id) => ({ id, name: id }));

/** Cycles through the given values. */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

const offerOf = (s: GameState, id: string) => {
  const offer = s.draft?.offers[id];
  if (!offer) throw new Error(`no offer for ${id}`);
  return offer;
};

function pickAll(s: GameState): GameState {
  return s.players.reduce((acc, p) => pickAugment(acc, p.id, offerOf(acc, p.id).cards[0]!), s);
}

describe('rarityFor', () => {
  it('splits 40 / 40 / 20', () => {
    expect(rarityFor(0)).toBe('SILVER');
    expect(rarityFor(0.399)).toBe('SILVER');
    expect(rarityFor(0.4)).toBe('GOLD');
    expect(rarityFor(0.799)).toBe('GOLD');
    expect(rarityFor(0.8)).toBe('PRISM');
  });
});

describe('drawAugment', () => {
  const normal = (i: number): AugmentDefinition => ({
    id: `n${i}`, name: '', description: '', rarity: 'SILVER', kind: 'PASSIVE', enabled: true,
  });
  const chaos: AugmentDefinition = { ...normal(0), id: 'c', kind: 'CHAOS' };
  const pool = [chaos, ...Array.from({ length: 19 }, (_, i) => normal(i + 1))];

  it('gives all chaos augments 5% together', () => {
    expect(drawAugment(pool, () => 0.049)?.id).toBe('c');
    expect(drawAugment(pool, () => 0.05)?.id).toBe('n1');
    expect(drawAugment(pool, () => 0.999)?.id).toBe('n19');
  });

  it('uses the whole range when one group is empty', () => {
    expect(drawAugment([chaos], () => 0.9)?.id).toBe('c');
    expect(drawAugment(pool.slice(1), () => 0)?.id).toBe('n1');
    expect(drawAugment([], () => 0)).toBeNull();
  });
});

describe('openDraft', () => {
  it('gives everyone three different cards of one rarity and pauses the game', () => {
    const s = openDraft(startGame('r', PLAYERS), seq(0.9, 0.3, 0.6, 0.1, 0.8));
    expect(s.phase).toBe('AUGMENT_PICK');
    expect(s.draft?.rarity).toBe('PRISM');
    for (const p of PLAYERS) {
      const { cards, rerolled } = offerOf(s, p.id);
      expect(cards).toHaveLength(3);
      expect(new Set(cards).size).toBe(3);
      expect(cards.every((id) => augmentById(id)?.rarity === 'PRISM')).toBe(true);
      expect(rerolled).toEqual([false, false, false]);
    }
  });

  it('never offers an augment the player already owns', () => {
    const silver = AUGMENTS.filter((a) => a.rarity === 'SILVER').map((a) => a.id);
    const base = startGame('r', PLAYERS);
    const owned = silver.slice(0, -3);
    const s = openDraft(
      { ...base, players: base.players.map((p) => (p.id === 'a' ? { ...p, augmentIds: owned } : p)) },
      seq(0.1, 0.5),
    );
    expect([...offerOf(s, 'a').cards].sort()).toEqual(silver.slice(-3).sort());
  });

  it('gives one free reroll only to a single last-place player', () => {
    const base = startGame('r', PLAYERS);
    const done: PieceState = { kind: 'FINISHED' };
    const finishFor = (owners: string[]) => ({
      ...base,
      pieces: base.pieces.map((p) => (owners.includes(p.owner) && p.id.endsWith('-0') ? { ...p, state: done } : p)),
    });
    const sole = openDraft(finishFor(['a', 'b']), seq(0.1));
    expect(PLAYERS.map((p) => offerOf(sole, p.id).freeRerolls)).toEqual([0, 0, 1]);
    const tied = openDraft(finishFor(['a']), seq(0.1));
    expect(PLAYERS.map((p) => offerOf(tied, p.id).freeRerolls)).toEqual([0, 0, 0]);
  });
});

describe('rerollAugment', () => {
  const opened = () => openDraft(startGame('r', PLAYERS), seq(0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7));

  it('swaps one card for a new one that never comes back this draft', () => {
    const s = opened();
    const before = offerOf(s, 'a').cards;
    const after = rerollAugment(s, 'a', 1, seq(0.5));
    const offer = offerOf(after, 'a');
    expect(offer.cards[0]).toBe(before[0]);
    expect(offer.cards[2]).toBe(before[2]);
    expect(before).not.toContain(offer.cards[1]);
    expect(offer.discarded).toEqual([before[1]]);
    expect(offer.rerolled).toEqual([false, true, false]);
  });

  it('allows one reroll per card unless a free reroll is left', () => {
    const s = rerollAugment(opened(), 'a', 0, seq(0.5));
    expect(() => rerollAugment(s, 'a', 0, seq(0.5))).toThrow('리롤');
    const withFree: GameState = {
      ...s,
      draft: s.draft && { ...s.draft, offers: { ...s.draft.offers, a: { ...offerOf(s, 'a'), freeRerolls: 1 } } },
    };
    const again = rerollAugment(withFree, 'a', 0, seq(0.5));
    expect(offerOf(again, 'a').freeRerolls).toBe(0);
    expect(offerOf(again, 'a').discarded).toHaveLength(2);
  });

  it('refuses after picking or outside a draft', () => {
    const s = pickAugment(opened(), 'a', offerOf(opened(), 'a').cards[0]!);
    expect(() => rerollAugment(s, 'a', 1, seq(0.5))).toThrow('이미');
    expect(() => rerollAugment(startGame('r', PLAYERS), 'a', 0, seq(0.5))).toThrow('증강');
  });
});

describe('pickAugment', () => {
  it('waits for everyone, then grants the augments and resumes the game', () => {
    const s = openDraft(startGame('r', PLAYERS), seq(0.1, 0.2, 0.3, 0.4, 0.5));
    const chosen = PLAYERS.map((p) => offerOf(s, p.id).cards[0]);
    const one = pickAugment(s, 'a', chosen[0]!);
    expect(one.phase).toBe('AUGMENT_PICK');
    expect(one.players[0]?.augmentIds).toEqual([]);

    const done = pickAll(s);
    expect(done.phase).toBe('THROW');
    expect(done.draft).toBeNull();
    expect(done.draftsDone).toBe(1);
    expect(done.players.map((p) => p.augmentIds)).toEqual(chosen.map((id) => [id]));
    expect(done.log.map((e) => e.kind)).toEqual(['AUGMENT', 'AUGMENT', 'AUGMENT']);
  });

  it('rejects cards not offered and a second pick', () => {
    const s = openDraft(startGame('r', PLAYERS), seq(0.1, 0.2, 0.3));
    expect(() => pickAugment(s, 'a', 'NOPE')).toThrow('후보');
    const once = pickAugment(s, 'a', offerOf(s, 'a').cards[1]!);
    expect(() => pickAugment(once, 'a', offerOf(once, 'a').cards[0]!)).toThrow('이미');
  });

  it('blocks throwing while the draft is open', () => {
    const s = openDraft(startGame('r', PLAYERS), seq(0.1));
    expect(() => throwYut(s, 'a')).toThrow();
  });
});

describe('autoPick', () => {
  it('picks at random for everyone still choosing', () => {
    const s = openDraft(startGame('r', PLAYERS), seq(0.1, 0.2, 0.3));
    const mine = offerOf(s, 'a').cards[2]!;
    const done = autoPick(pickAugment(s, 'a', mine), seq(0.99));
    expect(done.phase).toBe('THROW');
    expect(done.players[0]?.augmentIds).toEqual([mine]);
    expect(done.players[1]?.augmentIds).toEqual([offerOf(s, 'b').cards[2]]);
    expect(done.log.map((e) => e.auto)).toEqual([false, true, true]);
  });
});

describe('draft schedule', () => {
  /** Plays one full round: everyone throws Backdo with no piece out, which ends the turn. */
  function playRound(s: GameState): GameState {
    return PLAYERS.reduce((state, p) => throwYut(state, p.id, seq(0.1, 0.9, 0.9, 0.9)), s);
  }

  it('opens a draft after every full round once the start draft is done', () => {
    let s = pickAll(openDraft(startGame('r', PLAYERS), seq(0.1)));
    s = playRound(s);
    expect(s.phase).toBe('AUGMENT_PICK');
    expect(s.draft?.index).toBe(1);
    s = playRound(pickAll(s));
    expect(s.draft?.index).toBe(2);
  });

  it('stays out of games that never had a start draft', () => {
    const s = playRound(playRound(startGame('r', PLAYERS)));
    expect(s.phase).toBe('THROW');
  });
});

describe('a full hand of six', () => {
  const full = AUGMENTS.filter((a) => a.enabled && a.rarity === 'GOLD').slice(0, MAX_AUGMENTS).map((a) => a.id);
  function opened(): GameState {
    const base = startGame('r', PLAYERS);
    return openDraft({ ...base, players: base.players.map((p) => (p.id === 'a' ? { ...p, augmentIds: full, augmentUses: { [full[0]!]: 1 } } : p)) }, seq(0.5));
  }

  it('must name the augment to give up', () => {
    const s = opened();
    const card = offerOf(s, 'a').cards[0]!;
    expect(() => pickAugment(s, 'a', card)).toThrow('교체할');
    expect(() => pickAugment(s, 'a', card, 'NOPE')).toThrow('가지고 있지 않은');
  });

  it('swaps one augment and drops its uses', () => {
    const s = opened();
    const card = offerOf(s, 'a').cards[0]!;
    const done = autoPick(pickAugment(s, 'a', card, full[0]!), seq(0.1));
    const a = done.players.find((p) => p.id === 'a')!;
    expect(a.augmentIds).toEqual([...full.slice(1), card]);
    expect(a.augmentUses[full[0]!]).toBeUndefined();
    expect(done.log.find((e) => e.kind === 'AUGMENT' && e.playerId === 'a')).toMatchObject({ augmentId: card, replaced: full[0] });
  });

  it('may keep the hand; a timeout keeps it too', () => {
    const s = opened();
    const kept = autoPick(passDraft(s, 'a'), seq(0.1));
    expect(kept.players.find((p) => p.id === 'a')!.augmentIds).toEqual(full);
    expect(autoPick(s, seq(0.1)).players.find((p) => p.id === 'a')!.augmentIds).toEqual(full);
    expect(() => passDraft(s, 'b')).toThrow('6개');
  });
});

