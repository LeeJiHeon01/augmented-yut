import { describe, expect, it } from 'vitest';
import type { GameLogEntry } from '@yut/shared';
import { chipLabel, formatClock, formatCode, logText, ordinal, turnLabel } from './format';

describe('ordinal', () => {
  it('spells native Korean ordinals', () => {
    expect([1, 2, 3, 4, 10, 12, 20, 21, 35].map(ordinal)).toEqual([
      '첫', '두', '세', '네', '열', '열두', '스무', '스물한', '서른다섯',
    ]);
  });

  it('falls back to digits from 100', () => {
    expect(ordinal(100)).toBe('100');
  });
});

describe('turnLabel', () => {
  it('names the current turn', () => {
    expect(turnLabel(12)).toBe('열두 번째 차례');
  });
});

describe('formatClock', () => {
  it('shows minutes and seconds', () => {
    expect(formatClock(402_000)).toBe('06:42');
    expect(formatClock(-5)).toBe('00:00');
  });
});

describe('formatCode', () => {
  it('splits the room code into two groups', () => {
    expect(formatCode('628491')).toBe('628 491');
  });
});

describe('logText', () => {
  const move = (patch: Partial<Extract<GameLogEntry, { kind: 'MOVE' }>>): GameLogEntry => ({
    kind: 'MOVE', playerId: 'a', pieceId: 'a-0', result: 'GEOL', captured: 0, finished: 0, stacked: 0, auto: false, ...patch,
  });

  it('describes a plain move', () => {
    expect(logText(move({}), 0)).toBe('걸! 세 칸 이동');
    expect(logText(move({ result: 'BACKDO' }), 0)).toBe('빽도! 한 칸 뒤로');
  });

  it('prefers capture, finish and stacking details', () => {
    expect(logText(move({ captured: 1 }), 0)).toBe('걸! 말 1개 잡기');
    expect(logText(move({ finished: 1 }), 2)).toBe('두 번째 말 골인');
    expect(logText(move({ finished: 2 }), 3)).toBe('말 2개 골인');
    expect(logText(move({ stacked: 1 }), 0)).toBe('말 2개 업기');
  });

  it('marks timeouts', () => {
    expect(logText(move({ auto: true }), 0)).toBe('시간 초과 · 걸! 세 칸 이동');
  });
});

describe('chipLabel', () => {
  it('shows the result with signed steps', () => {
    expect(chipLabel('GEOL')).toBe('걸 +3');
    expect(chipLabel('BACKDO')).toBe('빽도 -1');
  });
});

describe('logText for augments', () => {
  it('names the picked augment', () => {
    expect(logText({ kind: 'AUGMENT', playerId: 'a', augmentId: 'O-S2', auto: false }, 0)).toBe('출발 대시 증강 획득');
    expect(logText({ kind: 'AUGMENT', playerId: 'a', augmentId: 'O-S2', auto: true }, 0)).toBe('시간 초과 · 출발 대시 증강 획득');
    expect(logText({ kind: 'AUGMENT', playerId: 'a', augmentId: 'O-S2', auto: false, replaced: 'O-S4' }, 0)).toBe('개 승급 → 출발 대시 교체');
  });

  it('describes augment effects', () => {
    const use = (augmentId: string, discarded?: 'GAE'): GameLogEntry => ({
      kind: 'USE', playerId: 'a', augmentId, auto: false, ...(discarded ? { discarded } : {}),
    });
    expect(logText(use('O-S13'), 0)).toBe('고정 투척 사용 · 다음 던지기 걸 확정');
    expect(logText(use('A-G12'), 0)).toBe('위험한 도박 사용 · 다음 던지기 모 아니면 빽도');
    expect(logText(use('O-S3', 'GAE'), 0)).toBe('두 번째 기회 사용 · 개 버리고 다시 던지기');
    const thrown: GameLogEntry = { kind: 'THROW', playerId: 'a', result: 'GEOL', auto: false, augmentId: 'O-S4', from: 'GAE' };
    expect(logText(thrown, 0)).toBe('개 승급 발동 · 개 → 걸!');
    expect(logText({ ...thrown, augmentId: 'O-S13', from: undefined }, 0)).toBe('고정 투척 발동 · 걸!');
    const moved: GameLogEntry = {
      kind: 'MOVE', playerId: 'a', pieceId: 'a-0', result: 'GEOL', captured: 0, finished: 0, stacked: 0, auto: false,
      bonus: { augmentId: 'O-S2', steps: 1 },
    };
    expect(logText({ kind: 'CHAOS', eventId: 'E5', round: 4, pieceIds: ['a-1'], auto: false }, 0)).toBe(
      '전원 4라운드 완료 · 왕의 몰락 발동 · 말 1개 귀환',
    );
    expect(logText({ kind: 'CHAOS', eventId: 'E6', round: 8, pieceIds: [], auto: false }, 0)).toBe(
      '전원 8라운드 완료 · 전원 출동 발동 · 대상 없음',
    );
    expect(logText(moved, 0)).toBe('걸! 세 칸 이동 · 출발 대시 발동 · 1칸 추가 이동');
  });
});
