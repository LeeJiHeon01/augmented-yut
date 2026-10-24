import { useEffect, useRef } from 'react';
import type { GamePhase, RoomView } from '@yut/shared';
import { playChaos, playEffect, playOutcome, setLoop } from './audio';
import { effectsFor, loopFor, outcomeFor } from './audioCues';

/**
 * Background music per screen, sound effects for new log entries and the result cue.
 * Log indexes are the event ids, so a reconnect or a repeated room update never replays old sounds.
 */
export function useGameAudio(room: RoomView | null, me: string | null): void {
  const seen = useRef<{ code: string; count: number } | null>(null);
  const lastPhase = useRef<GamePhase | null>(null);

  useEffect(() => setLoop(loopFor(room)), [room]);

  useEffect(() => {
    const log = room?.game?.log;
    if (!room || !log) {
      seen.current = null;
      return;
    }
    const known = seen.current;
    // First view of this game (join, reload) or a new game in the room: start from here.
    if (!known || known.code !== room.code || log.length < known.count) {
      seen.current = { code: room.code, count: log.length };
      return;
    }
    seen.current = { code: room.code, count: log.length };
    for (const effect of effectsFor(log.slice(known.count))) {
      if (effect === 'chaos') playChaos();
      else playEffect(effect);
    }
  }, [room]);

  useEffect(() => {
    const outcome = outcomeFor(lastPhase.current, room, me);
    if (outcome) playOutcome(outcome);
    lastPhase.current = room?.game?.phase ?? null;
  }, [room, me]);
}
