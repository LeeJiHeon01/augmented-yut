import { describe, expect, it } from 'vitest';
import { startGame, type GameLogEntry, type GameState, type RoomView } from '@yut/shared';
import { CHAOS_MIX, effectsFor, effectVolume, loopFor, outcomeFor, stingVolume, type Levels } from './audioCues';

const DEFAULT: Levels = { muted: false, bgm: 0.4, sfx: 0.8 };

function room(game: Partial<GameState> | null): RoomView {
  const base = startGame('r', [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }]);
  return {
    code: '123456',
    hostId: 'a',
    seats: [],
    game: game ? { ...base, ...game } : null,
    deadline: null,
    serverNow: 0,
    startedAt: null,
    finishedAt: null,
    logTimes: [],
    draftPicked: [],
  } as RoomView;
}

/** Peak of each file in dBFS, measured from client/public/audio. */
const PEAK_DB = { chaosEffect: -1.8, chaosSting: -4.7 };
const amp = (db: number) => 10 ** (db / 20);

describe('volumes', () => {
  it('alone: effect at the SFX level, sting at 1.25x BGM (0.5 by default)', () => {
    expect(effectVolume(DEFAULT)).toBeCloseTo(0.8);
    expect(stingVolume(DEFAULT)).toBeCloseTo(0.5);
  });

  it('chaos together: effect 60% and sting 40% of their own levels', () => {
    expect(effectVolume(DEFAULT, CHAOS_MIX.effect)).toBeCloseTo(0.48);
    expect(stingVolume(DEFAULT, CHAOS_MIX.sting)).toBeCloseTo(0.2);
  });

  it('the chaos pair: about -6 dBFS by default (was -0.5), and never clips even at full volume', () => {
    const peak = (levels: Levels, mix: { effect: number; sting: number }) =>
      20 * Math.log10(amp(PEAK_DB.chaosEffect) * effectVolume(levels, mix.effect) + amp(PEAK_DB.chaosSting) * stingVolume(levels, mix.sting));
    expect(peak(DEFAULT, { effect: 1, sting: 1 })).toBeCloseTo(-0.5, 0);
    expect(peak(DEFAULT, CHAOS_MIX)).toBeCloseTo(-5.9, 0);
    expect(peak({ muted: false, bgm: 1, sfx: 1 }, CHAOS_MIX)).toBeLessThan(0);
  });

  it('follows the user settings and mute', () => {
    expect(effectVolume({ ...DEFAULT, sfx: 0.2 })).toBeCloseTo(0.2);
    expect(stingVolume({ ...DEFAULT, bgm: 0.1 })).toBeCloseTo(0.125);
    expect(effectVolume({ ...DEFAULT, muted: true }, CHAOS_MIX.effect)).toBe(0);
    expect(stingVolume({ ...DEFAULT, muted: true })).toBe(0);
  });
});

describe('background loop per screen', () => {
  it('lobby, draft, game, result', () => {
    expect(loopFor(null)).toBe('lobby');
    expect(loopFor(room(null))).toBe('lobby');
    expect(loopFor(room({ phase: 'AUGMENT_PICK' }))).toBe('augment');
    expect(loopFor(room({ phase: 'THROW' }))).toBe('game');
    expect(loopFor(room({ phase: 'MOVE' }))).toBe('game');
    expect(loopFor(room({ phase: 'FINISHED' }))).toBeNull();
  });

  it('back to the game loop once a draft closes', () => {
    const phases = ['AUGMENT_PICK', 'THROW', 'AUGMENT_PICK', 'AUGMENT_PICK', 'MOVE'] as const;
    expect(phases.map((phase) => loopFor(room({ phase })))).toEqual(['augment', 'game', 'augment', 'augment', 'game']);
  });
});

describe('effects for new log entries', () => {
  const move = (patch: Partial<Extract<GameLogEntry, { kind: 'MOVE' }>>): GameLogEntry => ({
    kind: 'MOVE', playerId: 'a', pieceId: 'a-0', result: 'GAE', captured: 0, finished: 0, stacked: 0, auto: false, ...patch,
  });

  it('one sound per kind, strongest first', () => {
    const entries: GameLogEntry[] = [
      { kind: 'THROW', playerId: 'a', result: 'GAE', auto: false },
      move({ captured: 1 }),
      { kind: 'EFFECT', playerId: 'b', augmentId: 'A-S7', detail: '', auto: false },
      { kind: 'CHAOS', eventId: 'E5', round: 4, pieceIds: [], auto: false },
      move({}),
    ];
    expect(effectsFor(entries)).toEqual(['chaos', 'capture', 'move', 'throw', 'augment']);
    expect(effectsFor([move({ finished: 1 })])).toEqual(['finish']);
    expect(effectsFor([{ kind: 'AUGMENT', playerId: 'a', augmentId: 'O-S2', auto: false }])).toEqual([]);
  });
});

describe('result cue', () => {
  const finished = room({ phase: 'FINISHED', winner: 'a' });

  it('fanfare for the winner, nothing (defeat) for the others', () => {
    expect(outcomeFor('MOVE', finished, 'a')).toBe('victory');
    expect(outcomeFor('MOVE', finished, 'b')).toBe('defeat');
  });

  it('not again on later updates, and not after a reload into the result screen', () => {
    expect(outcomeFor('FINISHED', finished, 'a')).toBeNull();
    expect(outcomeFor(null, finished, 'a')).toBeNull();
    expect(outcomeFor('THROW', room({ phase: 'THROW' }), 'a')).toBeNull();
  });
});
