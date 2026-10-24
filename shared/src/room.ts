import { RuleError, type GameState, type PlayerId } from './game';
import { openDraft } from './draft';
import { startGame } from './turn';

export type PieceColor = 'RED' | 'BLUE' | 'GREEN' | 'YELLOW';

export const PIECE_COLORS: readonly PieceColor[] = ['RED', 'BLUE', 'GREEN', 'YELLOW'];
export const MAX_SEATS = 4;
export const MIN_PLAYERS = 2;

export interface Seat {
  id: PlayerId;
  name: string;
  color: PieceColor;
  ready: boolean;
  connected: boolean;
}

export interface RoomState {
  /** Six-digit invite code. */
  code: string;
  hostId: PlayerId;
  /** Seat order is turn order. */
  seats: Seat[];
  game: GameState | null;
}

const NAME_PATTERN = /^[가-힣a-zA-Z0-9]{2,10}$/;

export function validateName(name: string): string {
  const trimmed = name.trim();
  if (!NAME_PATTERN.test(trimmed)) throw new RuleError('닉네임은 한글·영문·숫자 2~10자예요');
  return trimmed;
}

export function createRoom(code: string, host: { id: PlayerId; name: string }): RoomState {
  return {
    code,
    hostId: host.id,
    seats: [{ id: host.id, name: validateName(host.name), color: 'RED', ready: false, connected: true }],
    game: null,
  };
}

export function joinRoom(room: RoomState, player: { id: PlayerId; name: string }): RoomState {
  if (room.seats.some((s) => s.id === player.id)) return room;
  if (room.game) throw new RuleError('이미 게임이 시작됐어요');
  if (room.seats.length >= MAX_SEATS) throw new RuleError('방이 가득 찼어요');

  const color = PIECE_COLORS.find((c) => !room.seats.some((s) => s.color === c)) ?? 'RED';
  const seat: Seat = { id: player.id, name: validateName(player.name), color, ready: false, connected: true };
  return { ...room, seats: [...room.seats, seat] };
}

/** Returns null when the room should close. */
export function leaveRoom(room: RoomState, playerId: PlayerId): RoomState | null {
  if (room.game) {
    const seats = room.seats.map((s) => (s.id === playerId ? { ...s, connected: false } : s));
    return seats.some((s) => s.connected) ? { ...room, seats } : null;
  }
  const seats = room.seats.filter((s) => s.id !== playerId);
  const first = seats[0];
  if (!first) return null;
  return { ...room, seats, hostId: room.hostId === playerId ? first.id : room.hostId };
}

/** A dropped connection keeps the seat; the player can come back to it. */
export function setConnected(room: RoomState, playerId: PlayerId, connected: boolean): RoomState {
  if (!room.seats.some((s) => s.id === playerId)) return room;
  return { ...room, seats: room.seats.map((s) => (s.id === playerId ? { ...s, connected } : s)) };
}

export function setColor(room: RoomState, playerId: PlayerId, color: PieceColor): RoomState {
  assertLobby(room);
  if (!PIECE_COLORS.includes(color)) throw new RuleError('없는 말 색상이에요');
  if (room.seats.some((s) => s.id !== playerId && s.color === color)) {
    throw new RuleError('이미 다른 사람이 쓰는 색이에요');
  }
  return updateSeat(room, playerId, { color, ready: false });
}

export function setReady(room: RoomState, playerId: PlayerId, ready: boolean): RoomState {
  assertLobby(room);
  // Socket payloads are untrusted; keep the flag a real boolean.
  return updateSeat(room, playerId, { ready: ready === true });
}

/** Starts the game with the opening augment draft. */
export function startRoomGame(room: RoomState, playerId: PlayerId, random: () => number = Math.random): RoomState {
  assertLobby(room);
  if (playerId !== room.hostId) throw new RuleError('방장만 시작할 수 있어요');
  if (room.seats.length < MIN_PLAYERS) throw new RuleError('두 명 이상 모여야 시작할 수 있어요');
  return { ...room, game: openDraft(startGame(room.code, room.seats), random) };
}

/** After a finished game: back to the lobby with connected players only. */
export function backToLobby(room: RoomState): RoomState {
  if (room.game?.phase !== 'FINISHED') throw new RuleError('게임이 아직 끝나지 않았어요');
  const seats = room.seats.filter((s) => s.connected).map((s) => ({ ...s, ready: false }));
  const hostId = seats.some((s) => s.id === room.hostId) ? room.hostId : (seats[0]?.id ?? room.hostId);
  return { ...room, seats, hostId, game: null };
}

function assertLobby(room: RoomState): void {
  if (room.game) throw new RuleError('게임 중에는 바꿀 수 없어요');
}

function updateSeat(room: RoomState, playerId: PlayerId, patch: Partial<Seat>): RoomState {
  if (!room.seats.some((s) => s.id === playerId)) throw new RuleError('방에 없는 플레이어예요');
  return { ...room, seats: room.seats.map((s) => (s.id === playerId ? { ...s, ...patch } : s)) };
}
