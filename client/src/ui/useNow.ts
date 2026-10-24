import { useEffect, useState } from 'react';
import { useGame } from '../store';

/** Server-corrected clock that re-renders every `intervalMs`. */
export function useServerNow(intervalMs = 250): number {
  const offset = useGame((s) => s.clockOffset);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now + offset;
}
