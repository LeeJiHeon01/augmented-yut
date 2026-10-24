import { describe, expect, it } from 'vitest';
import {
  backToLobby,
  createRoom,
  joinRoom,
  leaveRoom,
  setColor,
  setReady,
  startRoomGame,
  validateName,
  type RoomState,
} from './room';

function fullRoom(): RoomState {
  let room = createRoom('123456', { id: 'a', name: '달빛선비' });
  for (const id of ['b', 'c', 'd']) room = joinRoom(room, { id, name: `손님${id}` });
  return room;
}

function readyAll(room: RoomState): RoomState {
  return room.seats.reduce((r, s) => setReady(r, s.id, true), room);
}

describe('validateName', () => {
  it('accepts 2-10 Korean, English or digit characters after trimming', () => {
    expect(validateName(' 달빛선비 ')).toBe('달빛선비');
    expect(validateName('ab12')).toBe('ab12');
  });

  it('rejects too short, too long or symbols', () => {
    expect(() => validateName('a')).toThrow('2~10자');
    expect(() => validateName('가나다라마바사아자차카')).toThrow('2~10자');
    expect(() => validateName('달빛!선비')).toThrow('2~10자');
  });

  it('allows spaces between words, trimming the ends and squeezing runs', () => {
    expect(validateName('달빛 선비')).toBe('달빛 선비');
    expect(validateName('  Moon   Light ')).toBe('Moon Light');
    expect(() => validateName('가 나 다 라 마 바')).toThrow('2~10자');
    expect(() => validateName('   ')).toThrow('2~10자');
  });
});

describe('createRoom / joinRoom', () => {
  it('makes the creator host with the first color', () => {
    const room = createRoom('123456', { id: 'a', name: '달빛선비' });
    expect(room).toMatchObject({ code: '123456', hostId: 'a', game: null });
    expect(room.seats).toEqual([{ id: 'a', name: '달빛선비', color: 'RED', ready: false, connected: true }]);
  });

  it('gives each newcomer the first free color', () => {
    let room = createRoom('123456', { id: 'a', name: '달빛선비' });
    room = setColor(room, 'a', 'BLUE');
    room = joinRoom(room, { id: 'b', name: '솔바람' });
    expect(room.seats[1]?.color).toBe('RED');
  });

  it('ignores a second join by the same player', () => {
    const room = createRoom('123456', { id: 'a', name: '달빛선비' });
    expect(joinRoom(room, { id: 'a', name: '달빛선비' }).seats).toHaveLength(1);
  });

  it('rejects a fifth player and joins after the game started', () => {
    expect(() => joinRoom(fullRoom(), { id: 'e', name: '다섯째' })).toThrow('가득');
    const started = startRoomGame(readyAll(fullRoom()), 'a');
    expect(() => joinRoom(started, { id: 'e', name: '다섯째' })).toThrow('시작');
  });
});

describe('setColor / setReady', () => {
  it('rejects a color used by someone else', () => {
    expect(() => setColor(fullRoom(), 'a', 'BLUE')).toThrow('다른 사람');
  });

  it('rejects values that are not piece colors', () => {
    const room = createRoom('123456', { id: 'a', name: '달빛선비' });
    expect(() => setColor(room, 'a', 'PURPLE' as never)).toThrow('색');
  });

  it('clears ready when the color changes', () => {
    let room = createRoom('123456', { id: 'a', name: '달빛선비' });
    room = setReady(room, 'a', true);
    room = setColor(room, 'a', 'YELLOW');
    expect(room.seats[0]).toMatchObject({ color: 'YELLOW', ready: false });
  });
});

describe('startRoomGame', () => {
  it('starts a game in seat order with the opening augment draft', () => {
    const room = startRoomGame(readyAll(fullRoom()), 'a');
    expect(room.game?.players.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(room.game?.phase).toBe('AUGMENT_PICK');
  });

  it('only lets the host start', () => {
    expect(() => startRoomGame(readyAll(fullRoom()), 'b')).toThrow('방장');
  });

  it('starts with two to four players and no ready check', () => {
    const alone = createRoom('123456', { id: 'a', name: '달빛선비' });
    expect(() => startRoomGame(alone, 'a')).toThrow('두 명');
    const two = joinRoom(alone, { id: 'b', name: '솔바람' });
    expect(startRoomGame(two, 'a').game?.players.map((p) => p.id)).toEqual(['a', 'b']);
    expect(startRoomGame(fullRoom(), 'a').game?.phase).toBe('AUGMENT_PICK');
  });
});

describe('leaveRoom', () => {
  it('passes the host to the next seat in the lobby', () => {
    const room = leaveRoom(fullRoom(), 'a');
    expect(room?.hostId).toBe('b');
    expect(room?.seats.map((s) => s.id)).toEqual(['b', 'c', 'd']);
  });

  it('returns null when the last player leaves', () => {
    expect(leaveRoom(createRoom('123456', { id: 'a', name: '달빛선비' }), 'a')).toBeNull();
  });

  it('keeps the seat but marks it disconnected during a game', () => {
    const room = leaveRoom(startRoomGame(readyAll(fullRoom()), 'a'), 'b');
    expect(room?.seats.find((s) => s.id === 'b')).toMatchObject({ connected: false });
    expect(room?.game?.players).toHaveLength(4);
  });

  it('closes a game room when nobody is connected', () => {
    let room: RoomState | null = startRoomGame(readyAll(fullRoom()), 'a');
    for (const id of ['a', 'b', 'c', 'd']) room = room && leaveRoom(room, id);
    expect(room).toBeNull();
  });
});

describe('backToLobby', () => {
  it('clears the finished game, readiness and disconnected seats', () => {
    let room = leaveRoom(startRoomGame(readyAll(fullRoom()), 'a'), 'd')!;
    room = { ...room, game: room.game && { ...room.game, phase: 'FINISHED', winner: 'a' } };
    const lobby = backToLobby(room);
    expect(lobby.game).toBeNull();
    expect(lobby.seats.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(lobby.seats.every((s) => !s.ready)).toBe(true);
  });

  it('refuses while the game is still running', () => {
    expect(() => backToLobby(startRoomGame(readyAll(fullRoom()), 'a'))).toThrow('끝나');
  });
});
