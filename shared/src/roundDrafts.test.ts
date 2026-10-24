import { describe, expect, it } from 'vitest';
import { applyChaos } from './chaos';
import { autoPick, MAX_AUGMENTS, openDraft, passDraft, pickAugment } from './draft';
import type { GameState } from './game';
import { autoAct, startGame, throwYut } from './turn';

const PLAYERS = ['a', 'b', 'c'].map((id) => ({ id, name: id }));

/** Cycles through the given values. */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

const BACKDO = [0.1, 0.9, 0.9, 0.9];

/** One full round: everyone throws Backdo with no piece out, which ends the turn. */
function playRound(s: GameState): GameState {
  return PLAYERS.reduce((state, p) => throwYut(state, p.id, seq(...BACKDO)), s);
}

/** Everyone takes their first card; full hands swap out their first augment. */
function pickAll(s: GameState): GameState {
  return s.players.reduce((acc, p) => {
    const card = acc.draft!.offers[p.id]!.cards[0]!;
    return pickAugment(acc, p.id, card, p.augmentIds.length >= MAX_AUGMENTS ? p.augmentIds[0]! : null);
  }, s);
}

describe('a draft after every round', () => {
  it('fills the hand to six over six drafts and keeps it at six after that', () => {
    let s = pickAll(openDraft(startGame('r', PLAYERS), seq(0.3)));
    for (let round = 1; round <= 8; round++) {
      s = playRound(s);
      expect(s.phase).toBe('AUGMENT_PICK');
      expect(s.draft?.index).toBe(round);
      s = pickAll(s);
      const expected = Math.min(round + 1, MAX_AUGMENTS);
      expect(s.players.map((p) => p.augmentIds.length)).toEqual([expected, expected, expected]);
    }
    expect(s.draftsDone).toBe(9);
    expect(s.players.every((p) => new Set(p.augmentIds).size === MAX_AUGMENTS)).toBe(true);
  });

  it('on round four the chaos event comes first, then the draft opens', () => {
    let s = pickAll(openDraft(startGame('r', PLAYERS), seq(0.3)));
    for (let round = 1; round <= 3; round++) s = pickAll(playRound(s));
    s = playRound(s);
    expect([s.chaosDone, s.phase, s.draft?.index]).toEqual([1, 'AUGMENT_PICK', 4]);
    const kinds = s.log.map((e) => e.kind);
    expect(kinds.at(-1)).toBe('CHAOS');
    s = pickAll(s);
    expect(s.log.slice(-3).every((e) => e.kind === 'AUGMENT')).toBe(true);
    expect(s.log.map((e) => e.kind).lastIndexOf('CHAOS')).toBeLessThan(s.log.map((e) => e.kind).lastIndexOf('AUGMENT'));
  });

  it('a lasting chaos event keeps running through the draft that follows it', () => {
    let s = pickAll(openDraft(startGame('r', PLAYERS), seq(0.3)));
    s = applyChaos(s, 'E7', seq(0));
    s = playRound(s);
    expect(s.phase).toBe('AUGMENT_PICK');
    // E7 ran for that round and ended with it, before the next draft is picked.
    expect(s.field.chaosActive).toEqual([]);
  });

  it('times out to a random pick under six and keeps a full hand', () => {
    const base = startGame('r', PLAYERS);
    const six = ['O-S1', 'O-S2', 'O-S4', 'O-S5', 'O-S7', 'O-S8'];
    const s = openDraft({ ...base, players: base.players.map((p) => (p.id === 'a' ? { ...p, augmentIds: six } : p)) }, seq(0.3));
    const done = autoAct(s, seq(0.1));
    expect(done.phase).toBe('THROW');
    expect(done.players.find((p) => p.id === 'a')!.augmentIds).toEqual(six);
    expect(done.players.filter((p) => p.id !== 'a').every((p) => p.augmentIds.length === 1)).toBe(true);
  });

  it('a pass and a pick by others close the draft together', () => {
    const base = startGame('r', PLAYERS);
    const six = ['O-S1', 'O-S2', 'O-S4', 'O-S5', 'O-S7', 'O-S8'];
    let s = openDraft({ ...base, players: base.players.map((p) => ({ ...p, augmentIds: p.id === 'a' ? six : [] })) }, seq(0.3));
    s = passDraft(s, 'a');
    expect(s.phase).toBe('AUGMENT_PICK');
    s = autoPick(s, seq(0.1));
    expect(s.phase).toBe('THROW');
  });
});
