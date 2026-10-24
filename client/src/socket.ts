import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@yut/shared';

const url = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

const TOKEN_KEY = 'yut-session';

/** Session token for this tab: a refresh comes back to the same seat. */
export function loadToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage blocked: the session only lasts until the page closes.
  }
}

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(url, {
  autoConnect: false,
  // Read on every (re)connect so a reconnect sends the latest token.
  auth: (send) => send({ token: loadToken() }),
});
