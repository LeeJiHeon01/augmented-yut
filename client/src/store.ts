import { create } from 'zustand';
import type { AckResult, AugmentTarget, Move, PieceColor, RoomView, YutResult } from '@yut/shared';
import { saveToken, socket } from './socket';

interface GameStore {
  connected: boolean;
  room: RoomView | null;
  /** This client's player id (from the server session, stable across reconnects). */
  me: string | null;
  error: string | null;
  /** Server clock minus local clock, for timers. */
  clockOffset: number;
  createRoom: (name: string) => Promise<AckResult>;
  joinRoom: (code: string, name: string) => Promise<AckResult>;
  leaveRoom: () => void;
  setColor: (color: PieceColor) => void;
  setReady: (ready: boolean) => void;
  startGame: () => void;
  throwYut: () => void;
  movePiece: (move: Move) => void;
  pickAugment: (augmentId: string, replace?: string) => void;
  passAugment: () => void;
  rerollAugment: (slot: number) => void;
  activateAugment: (augmentId: string, target?: AugmentTarget) => void;
  splitResult: (result: YutResult, first: YutResult) => void;
  chooseThrow: (index: number) => void;
  backToLobby: () => void;
  clearError: () => void;
}

function ensureConnected(): void {
  if (!socket.connected) socket.connect();
}

export const useGame = create<GameStore>((set) => {
  socket.on('connect', () => set({ connected: true }));
  socket.on('session', ({ token, playerId }) => {
    saveToken(token);
    set({ me: playerId });
  });
  socket.on('disconnect', () => set({ connected: false, room: null }));
  socket.on('room', (room) =>
    set({ room, error: null, ...(room ? { clockOffset: room.serverNow - Date.now() } : {}) }),
  );
  socket.on('error', (error) => set({ error }));
  ensureConnected();

  const request = (event: 'createRoom' | 'joinRoom', payload: { name: string; code?: string }) =>
    new Promise<AckResult>((resolve) => {
      ensureConnected();
      const done = (result: AckResult) => {
        if (!result.ok) set({ error: result.error });
        resolve(result);
      };
      if (event === 'createRoom') socket.emit('createRoom', { name: payload.name }, done);
      else socket.emit('joinRoom', { code: payload.code ?? '', name: payload.name }, done);
    });

  return {
    connected: false,
    room: null,
    me: null,
    error: null,
    clockOffset: 0,
    createRoom: (name) => request('createRoom', { name }),
    joinRoom: (code, name) => request('joinRoom', { code, name }),
    leaveRoom: () => socket.emit('leaveRoom'),
    setColor: (color) => socket.emit('setColor', color),
    setReady: (ready) => socket.emit('setReady', ready),
    startGame: () => socket.emit('startGame'),
    throwYut: () => socket.emit('throwYut'),
    movePiece: (move) => socket.emit('movePiece', move),
    pickAugment: (augmentId, replace) => socket.emit('pickAugment', augmentId, replace),
    passAugment: () => socket.emit('passAugment'),
    rerollAugment: (slot) => socket.emit('rerollAugment', slot),
    activateAugment: (augmentId, target) => socket.emit('useAugment', augmentId, target),
    splitResult: (result, first) => socket.emit('splitResult', { result, first }),
    chooseThrow: (index) => socket.emit('chooseThrow', index),
    backToLobby: () => socket.emit('backToLobby'),
    clearError: () => set({ error: null }),
  };
});
