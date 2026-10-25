import { describe, expect, it } from 'vitest';
import type { GameLogEntry } from '@yut/shared';
import { moveOutcome } from './moveOutcome';

const nameOf = (id: string) => ({ a: '가', b: '나' })[id] ?? id;
const move = (captured: number, finished = 0): GameLogEntry => ({
  kind: 'MOVE',
  playerId: 'a',
  pieceId: 'a-0',
  result: 'GAE',
  captured,
  finished,
  stacked: 0,
  auto: false,
});
const effect = (playerId: string, augmentId: string, detail: string): GameLogEntry => ({
  kind: 'EFFECT',
  playerId,
  augmentId,
  detail,
  auto: false,
});

describe('moveOutcome', () => {
  it('names a capture', () => {
    expect(moveOutcome([move(1)], [5], 0, nameOf)).toMatchObject({ tone: 'CAPTURE', title: '가님이 말 1개를 잡았어요!' });
  });

  it('names the defence that kept the piece, logged before the move in the same update', () => {
    const log = [effect('b', 'A-S2', '잡힘 회피'), move(0)];
    expect(moveOutcome(log, [5, 5], 1, nameOf)).toEqual({
      tone: 'BLOCKED',
      title: "나님이 '아슬아슬한 회피' 증강으로 잡기를 막았어요",
      lines: ['나 · 아슬아슬한 회피: 잡힘 회피'],
    });
  });

  it('treats a failed chance defence as a capture', () => {
    const log = [effect('b', 'A-S2', '잡힘 회피 실패'), move(1)];
    expect(moveOutcome(log, [5, 5], 1, nameOf)?.tone).toBe('CAPTURE');
  });

  it('leaves out effects from an earlier update and is null for a plain move', () => {
    const log = [effect('b', 'A-S2', '잡힘 회피'), move(0)];
    expect(moveOutcome(log, [4, 5], 1, nameOf)).toBeNull();
  });

  it('names goals', () => {
    expect(moveOutcome([move(0, 2)], [5], 0, nameOf)?.title).toBe('가님 말 2개 골인!');
  });
});
