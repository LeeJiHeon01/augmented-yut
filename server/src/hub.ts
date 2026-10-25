import {
  autoAct,
  draftPickedOf,
  createRoom,
  joinRoom,
  leaveRoom,
  RuleError,
  setConnected,
  type GameState,
  type PlayerId,
  type RoomState,
  type RoomView,
} from '@yut/shared';
import { logger } from './logger';

export interface HubOptions {
  /** Time a connected player gets for each action. */
  turnMs: number;
  /** Time everyone gets to pick an augment. */
  pickMs: number;
  /** Time before acting for a disconnected player. */
  awayTurnMs: number;
  /** How long an emptied game stays open for players to come back. */
  graceMs: number;
  /** How long a dropped player keeps a lobby seat (long enough for a page reload). */
  lobbyGraceMs: number;
  /** Extra draft time when a draft opens mid-game, while clients still show the last move. */
  revealMs?: number;
  random?: () => number;
  newCode: () => string;
  /** Full view for the room; strip it per viewer (`viewFor`) before sending. */
  onChange: (code: string, view: RoomView | null) => void;
}

interface RoomRecord {
  room: RoomState;
  deadline: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  /** The game only waits on disconnected players. */
  turnAway: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  logTimes: number[];
}

export type Hub = ReturnType<typeof createHub>;

/** Owns every room, its turn timer and who is in which room. */
export function createHub(options: HubOptions) {
  const random = options.random ?? Math.random;
  const records = new Map<string, RoomRecord>();
  const membership = new Map<PlayerId, string>();
  const graceTimers = new Map<PlayerId, ReturnType<typeof setTimeout>>();

  function create(playerId: PlayerId, name: string): string {
    const code = uniqueCode();
    const room = createRoom(code, { id: playerId, name });
    leave(playerId);
    records.set(code, {
      room,
      deadline: null,
      timer: null,
      turnAway: false,
      startedAt: null,
      finishedAt: null,
      logTimes: [],
    });
    membership.set(playerId, code);
    publish(code);
    return code;
  }

  function join(playerId: PlayerId, code: string, name: string): void {
    const record = records.get(code);
    if (!record) throw new RuleError('잘못된 방 코드예요');
    const next = joinRoom(record.room, { id: playerId, name });
    if (membership.get(playerId) !== code) leave(playerId);
    membership.set(playerId, code);
    commit(code, next);
  }

  function update(playerId: PlayerId, change: (room: RoomState, me: PlayerId) => RoomState): void {
    const code = membership.get(playerId);
    const record = code ? records.get(code) : undefined;
    if (!code || !record) throw new RuleError('방에 들어가 있지 않아요');
    commit(code, change(record.room, playerId));
  }

  /** Connection dropped: keep the seat for now and free it later if the player stays away. */
  function disconnect(playerId: PlayerId): void {
    const code = membership.get(playerId);
    const record = code ? records.get(code) : undefined;
    if (!code || !record) return;
    commit(code, setConnected(record.room, playerId, false));
    clearGrace(playerId);
    const ms = record.room.game ? options.graceMs : options.lobbyGraceMs;
    graceTimers.set(playerId, setTimeout(() => expire(playerId), ms));
  }

  /** Back with the same session: returns the room code to rejoin, if any. */
  function reconnect(playerId: PlayerId): string | undefined {
    clearGrace(playerId);
    const code = membership.get(playerId);
    const record = code ? records.get(code) : undefined;
    if (!code || !record) return undefined;
    commit(code, setConnected(record.room, playerId, true));
    return code;
  }

  function expire(playerId: PlayerId): void {
    graceTimers.delete(playerId);
    const code = membership.get(playerId);
    const record = code ? records.get(code) : undefined;
    if (!code || !record || record.room.seats.find((s) => s.id === playerId)?.connected) return;
    // A running game keeps the seat for a later return; it only closes when nobody is left.
    if (!record.room.game) leave(playerId);
    else if (record.room.seats.every((s) => !s.connected)) commit(code, null);
  }

  function clearGrace(playerId: PlayerId): void {
    const timer = graceTimers.get(playerId);
    if (timer) clearTimeout(timer);
    graceTimers.delete(playerId);
  }

  function leave(playerId: PlayerId): void {
    clearGrace(playerId);
    const code = membership.get(playerId);
    const record = code ? records.get(code) : undefined;
    membership.delete(playerId);
    if (code && record) commit(code, leaveRoom(record.room, playerId));
  }

  function roomOf(playerId: PlayerId): string | undefined {
    return membership.get(playerId);
  }

  function commit(code: string, next: RoomState | null): void {
    const record = records.get(code);
    if (!record) return;
    if (next === null) {
      clearTimer(record);
      records.delete(code);
      for (const [id, joined] of membership) if (joined === code) membership.delete(id);
      options.onChange(code, null);
      return;
    }
    const previousGame = record.room.game;
    record.room = next;
    syncGame(record, previousGame);
    publish(code);
  }

  /** Stamp new log entries and restart the turn timer when the game moved on. */
  function syncGame(record: RoomRecord, previousGame: GameState | null): void {
    const { game } = record.room;
    const now = Date.now();
    if (!game) {
      clearTimer(record);
      Object.assign(record, { deadline: null, startedAt: null, finishedAt: null, logTimes: [] });
      return;
    }
    const turnAway = waitsOnlyOnAway(record.room, game);
    if (game === previousGame && turnAway === record.turnAway) return;

    if (!previousGame) record.startedAt = now;
    while (record.logTimes.length < game.log.length) record.logTimes.push(now);
    // Picks inside one draft keep the shared deadline.
    const sameDraft =
      game.phase === 'AUGMENT_PICK' &&
      previousGame?.phase === 'AUGMENT_PICK' &&
      previousGame.draft?.index === game.draft?.index;
    if (sameDraft && turnAway === record.turnAway) return;
    record.turnAway = turnAway;
    clearTimer(record);

    if (game.phase === 'FINISHED') {
      record.deadline = null;
      record.finishedAt = now;
      return;
    }
    const draftOpened = game.phase === 'AUGMENT_PICK' && previousGame !== null && previousGame.phase !== 'AUGMENT_PICK';
    const pickMs = options.pickMs + (draftOpened ? (options.revealMs ?? 0) : 0);
    const ms = turnAway ? options.awayTurnMs : game.phase === 'AUGMENT_PICK' ? pickMs : options.turnMs;
    record.deadline = now + ms;
    record.timer = setTimeout(() => onTimeout(record), ms);
  }

  function onTimeout(record: RoomRecord): void {
    record.timer = null;
    const { game, code } = record.room;
    if (!game) return;
    try {
      commit(code, { ...record.room, game: autoAct(game, random) });
    } catch (error) {
      logger.error({ code, error }, 'auto action failed');
    }
  }

  function publish(code: string): void {
    const record = records.get(code);
    if (!record) return;
    options.onChange(code, {
      ...record.room,
      deadline: record.deadline,
      serverNow: Date.now(),
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      logTimes: [...record.logTimes],
      draftPicked: draftPickedOf(record.room),
    });
  }

  function uniqueCode(): string {
    for (let i = 0; i < 100; i++) {
      const code = options.newCode();
      if (!records.has(code)) return code;
    }
    throw new Error('no free room code');
  }

  return { create, join, update, leave, disconnect, reconnect, roomOf };
}

/** True when every player the game waits for is disconnected. */
function waitsOnlyOnAway(room: RoomState, game: GameState): boolean {
  const connected = (id: PlayerId) => room.seats.find((s) => s.id === id)?.connected === true;
  if (game.phase === 'AUGMENT_PICK') {
    const waiting = game.players.filter((p) => {
      const offer = game.draft?.offers[p.id];
      return !offer || (offer.picked === null && !offer.passed);
    });
    return waiting.length > 0 && waiting.every((p) => !connected(p.id));
  }
  return !connected(game.turn ?? '');
}

function clearTimer(record: RoomRecord): void {
  if (record.timer) clearTimeout(record.timer);
  record.timer = null;
}
