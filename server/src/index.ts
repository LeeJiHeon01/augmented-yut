import { createServer } from 'node:http';
import { randomInt, randomUUID } from 'node:crypto';
import { Server, type Socket } from 'socket.io';
import {
  activate,
  backToLobby,
  chooseThrow,
  splitResult,
  type AugmentTarget,
  type YutResult,
  movePiece,
  passDraft,
  pickAugment,
  rerollAugment,
  RuleError,
  setColor,
  setReady,
  startRoomGame,
  throwYut,
  type ClientToServerEvents,
  type RoomView,
  type ServerToClientEvents,
  viewFor,
} from '@yut/shared';
import { createHub } from './hub';
import { logger } from './logger';

const port = Number(process.env.PORT ?? 3001);
const origins = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173').split(',');

const httpServer = createServer((req, res) => {
  // Health check for Render
  if (req.url === '/health') {
    res.writeHead(200).end('ok');
    return;
  }
  res.writeHead(404).end();
});

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: origins },
});

const hub = createHub({
  turnMs: 18_000,
  pickMs: 60_000,
  awayTurnMs: 2_000,
  graceMs: 30_000,
  lobbyGraceMs: 5_000,
  newCode: () => String(randomInt(0, 1_000_000)).padStart(6, '0'),
  onChange: (code, view) => sendRoom(code, view),
});

/** Each socket gets its own view so draft candidates stay private. */
function sendRoom(code: string, view: RoomView | null): void {
  for (const socketId of io.sockets.adapter.rooms.get(code) ?? []) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) socket.emit('room', view && viewFor(view, playerOf(socket)));
  }
}

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const RESULTS: readonly YutResult[] = ['BACKDO', 'DO', 'GAE', 'GEOL', 'YUT', 'MO'];

function cleanResult(value: unknown): YutResult | undefined {
  return RESULTS.find((r) => r === value);
}

/** Socket payloads are untrusted: keep only well-typed target fields. */
function cleanTarget(raw: unknown): AugmentTarget {
  const t = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const target: AugmentTarget = {};
  if (typeof t.pieceId === 'string') target.pieceId = t.pieceId;
  if (typeof t.otherPieceId === 'string') target.otherPieceId = t.otherPieceId;
  if (typeof t.playerId === 'string') target.playerId = t.playerId;
  if (typeof t.node === 'number' && Number.isInteger(t.node)) target.node = t.node;
  const result = cleanResult(t.result);
  if (result) target.result = result;
  if (t.delta === 1 || t.delta === -1) target.delta = t.delta;
  if (t.direction === 'FORWARD' || t.direction === 'BACK') target.direction = t.direction;
  return target;
}

/** Secret session token -> player id. The token stays in its own browser tab. */
const sessions = new Map<string, string>();
/** Latest socket of each player; an older tab on the same session is dropped. */
const socketOfPlayer = new Map<string, string>();

function playerOf(socket: GameSocket): string {
  return (socket.data as { playerId: string }).playerId;
}

/** Reuse the player id of a known token, otherwise start a new session. */
function openSession(socket: GameSocket): { token: string; playerId: string } {
  const sent: unknown = (socket.handshake.auth as { token?: unknown }).token;
  const known = typeof sent === 'string' ? sessions.get(sent) : undefined;
  if (typeof sent === 'string' && known) return { token: sent, playerId: known };
  const token = randomUUID();
  const playerId = randomUUID();
  sessions.set(token, playerId);
  return { token, playerId };
}

/** Run a player action; rule errors go back to that player only. */
function guard(socket: GameSocket, action: () => void): string | null {
  try {
    action();
    return null;
  } catch (error) {
    if (error instanceof RuleError) {
      socket.emit('error', error.message);
      return error.message;
    }
    logger.error({ error, playerId: playerOf(socket) }, 'action failed');
    socket.emit('error', '잠시 후 다시 시도해 주세요');
    return '잠시 후 다시 시도해 주세요';
  }
}

/** Keep socket.io rooms in step with the hub after joining or leaving. */
function syncSocketRoom(socket: GameSocket): void {
  const code = hub.roomOf(playerOf(socket));
  for (const joined of socket.rooms) if (joined !== socket.id && joined !== code) socket.leave(joined);
  if (code) socket.join(code);
}

io.on('connection', (socket) => {
  const { token, playerId } = openSession(socket);
  socket.data = { playerId };
  const older = socketOfPlayer.get(playerId);
  socketOfPlayer.set(playerId, socket.id);
  if (older && older !== socket.id) io.sockets.sockets.get(older)?.disconnect(true);
  socket.emit('session', { token, playerId });

  // Same session as before: join the socket room first so the restored view reaches this socket.
  const back = hub.roomOf(playerId);
  if (back) {
    socket.join(back);
    hub.reconnect(playerId);
    logger.info({ code: back, playerId }, 'player reconnected');
  }

  socket.on('createRoom', ({ name }, ack) => {
    let code = '';
    const error = guard(socket, () => {
      code = hub.create(playerId, name);
      syncSocketRoom(socket);
      // Re-send so the creator, now in the socket room, gets the first view.
      hub.update(playerId, (room) => room);
    });
    ack(error ? { ok: false, error } : { ok: true, code });
    if (!error) logger.info({ code, playerId }, 'room created');
  });

  socket.on('joinRoom', ({ code, name }, ack) => {
    const error = guard(socket, () => {
      socket.join(code);
      hub.join(playerId, code, name);
    });
    syncSocketRoom(socket);
    ack(error ? { ok: false, error } : { ok: true, code });
    if (!error) logger.info({ code, playerId }, 'player joined');
  });

  socket.on('leaveRoom', () => {
    guard(socket, () => hub.leave(playerId));
    syncSocketRoom(socket);
    socket.emit('room', null);
  });

  socket.on('setColor', (color) => guard(socket, () => hub.update(playerId, (r, me) => setColor(r, me, color))));
  socket.on('setReady', (ready) => guard(socket, () => hub.update(playerId, (r, me) => setReady(r, me, ready))));
  socket.on('startGame', () => guard(socket, () => hub.update(playerId, (r, me) => startRoomGame(r, me))));
  socket.on('backToLobby', () => guard(socket, () => hub.update(playerId, (r) => backToLobby(r))));

  socket.on('throwYut', () =>
    guard(socket, () =>
      hub.update(playerId, (r, me) => {
        if (!r.game) throw new RuleError('게임이 시작되지 않았어요');
        return { ...r, game: throwYut(r.game, me) };
      }),
    ),
  );

  socket.on('movePiece', (move) =>
    guard(socket, () =>
      hub.update(playerId, (r, me) => {
        if (!r.game) throw new RuleError('게임이 시작되지 않았어요');
        return { ...r, game: movePiece(r.game, me, move) };
      }),
    ),
  );

  socket.on('pickAugment', (augmentId, replace) =>
    guard(socket, () =>
      hub.update(playerId, (r, me) => {
        if (!r.game) throw new RuleError('게임이 시작되지 않았어요');
        return { ...r, game: pickAugment(r.game, me, String(augmentId), typeof replace === 'string' ? replace : null) };
      }),
    ),
  );

  socket.on('passAugment', () =>
    guard(socket, () =>
      hub.update(playerId, (r, me) => {
        if (!r.game) throw new RuleError('게임이 시작되지 않았어요');
        return { ...r, game: passDraft(r.game, me) };
      }),
    ),
  );

  socket.on('rerollAugment', (slot) =>
    guard(socket, () =>
      hub.update(playerId, (r, me) => {
        if (!r.game) throw new RuleError('게임이 시작되지 않았어요');
        // Socket payloads are untrusted; a slot must be a real index.
        if (!Number.isInteger(slot)) throw new RuleError('없는 증강 카드예요');
        return { ...r, game: rerollAugment(r.game, me, slot, Math.random) };
      }),
    ),
  );

  socket.on('useAugment', (augmentId, target) =>
    guard(socket, () =>
      hub.update(playerId, (r, me) => {
        if (!r.game) throw new RuleError('게임이 시작되지 않았어요');
        return { ...r, game: activate(r.game, me, String(augmentId), cleanTarget(target)) };
      }),
    ),
  );

  socket.on('splitResult', (payload) =>
    guard(socket, () =>
      hub.update(playerId, (r, me) => {
        if (!r.game) throw new RuleError('게임이 시작되지 않았어요');
        const result = cleanResult(payload?.result);
        const first = cleanResult(payload?.first);
        if (!result || !first) throw new RuleError('그렇게는 나눌 수 없어요');
        return { ...r, game: splitResult(r.game, me, result, first) };
      }),
    ),
  );

  socket.on('chooseThrow', (index) =>
    guard(socket, () =>
      hub.update(playerId, (r, me) => {
        if (!r.game) throw new RuleError('게임이 시작되지 않았어요');
        if (index !== 0 && index !== 1) throw new RuleError('고를 수 있는 결과가 아니에요');
        return { ...r, game: chooseThrow(r.game, me, index) };
      }),
    ),
  );

  socket.on('disconnect', () => {
    // A newer tab took over this session; leave the seat to it.
    if (socketOfPlayer.get(playerId) !== socket.id) return;
    socketOfPlayer.delete(playerId);
    hub.disconnect(playerId);
    logger.info({ playerId }, 'socket disconnected');
  });
});

httpServer.listen(port, () => logger.info({ port, origins }, 'server listening'));
