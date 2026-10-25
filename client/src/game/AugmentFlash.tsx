import { AnimatePresence, motion } from 'motion/react';
import { useRef } from 'react';
import { augmentById, type GameLogEntry, type PlayerId } from '@yut/shared';
import { TIER_META } from '../augmentMeta';

/** How long a used or triggered augment card stays next to its owner's panel. */
export const FLASH_MS = 2500;
/** Cards shown at once per player; older ones give way. */
const MAX_CARDS = 3;
const CARD_WIDTH = 230;

export interface Flash {
  key: string;
  playerId: PlayerId;
  augmentId: string;
  /** An active someone pressed, rather than a passive that fired. */
  used: boolean;
}

/** The augment a log entry shows, if any: uses, effects, and passives that changed a throw or a move. */
export function flashOf(entry: GameLogEntry): Omit<Flash, 'key'> | null {
  if (entry.kind === 'USE') return { playerId: entry.playerId, augmentId: entry.augmentId, used: true };
  if (entry.kind === 'EFFECT') return { playerId: entry.playerId, augmentId: entry.augmentId, used: false };
  if (entry.kind === 'THROW' && entry.augmentId) return { playerId: entry.playerId, augmentId: entry.augmentId, used: false };
  if (entry.kind === 'MOVE' && entry.bonus?.augmentId) return { playerId: entry.playerId, augmentId: entry.bonus.augmentId, used: false };
  return null;
}

/**
 * Augment cards to show now, from log entries this browser received in the last `FLASH_MS`.
 * Entries already in the log when the screen opens do not show. Call on every render.
 */
export function useAugmentFlashes(log: readonly GameLogEntry[]): Flash[] {
  const seen = useRef<{ length: number; flashes: (Flash & { at: number })[] }>({ length: log.length, flashes: [] });
  // A new game in the same room starts the log over.
  if (log.length < seen.current.length) seen.current = { length: 0, flashes: [] };
  if (log.length > seen.current.length) {
    const at = Date.now();
    const fresh: (Flash & { at: number })[] = [];
    for (let i = seen.current.length; i < log.length; i++) {
      const flash = log[i] ? flashOf(log[i]!) : null;
      // One card per augment and player for a single update.
      if (flash && !fresh.some((f) => f.playerId === flash.playerId && f.augmentId === flash.augmentId)) {
        fresh.push({ ...flash, key: `${i}`, at });
      }
    }
    seen.current = { length: log.length, flashes: [...seen.current.flashes, ...fresh] };
  }
  const now = Date.now();
  seen.current.flashes = seen.current.flashes.filter((f) => now - f.at < FLASH_MS);
  return seen.current.flashes;
}

interface FlashCardsProps {
  flashes: Flash[];
  /** Panel box the cards sit beside, on the side facing the board. */
  panel: { left: number; top: number; width: number };
  side: 'left' | 'right';
}

/** Small augment cards beside a player's panel. */
export function AugmentFlashCards({ flashes, panel, side }: FlashCardsProps) {
  const left = side === 'left' ? panel.left + panel.width + 10 : panel.left - CARD_WIDTH - 10;
  return (
    <div className="pointer-events-none absolute z-30 flex flex-col gap-[8px]" style={{ left, top: panel.top, width: CARD_WIDTH }}>
      <AnimatePresence>
        {flashes.slice(-MAX_CARDS).map((flash) => (
          <motion.div
            key={flash.key}
            initial={{ opacity: 0, x: side === 'left' ? -16 : 16, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.22 }}
          >
            <FlashCard flash={flash} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function FlashCard({ flash }: { flash: Flash }) {
  const augment = augmentById(flash.augmentId);
  if (!augment) return null;
  const tier = TIER_META[augment.rarity];
  return (
    <div
      className="flex flex-col gap-[6px] rounded-[10px] border-[1.5px] px-[12px] py-[10px] shadow-[0_12px_30px_rgba(0,0,0,0.5)]"
      style={{ borderColor: tier.border, background: tier.background }}
    >
      <div className="flex items-center gap-[7px]">
        <img alt="" src={tier.icon} className="size-[14px]" />
        <p className="min-w-0 flex-1 truncate text-[14px] font-bold" style={{ color: tier.color }}>
          {augment.name}
        </p>
        <p className="shrink-0 rounded-full border border-line px-[7px] py-[1px] text-[10px] text-mist">
          {flash.used ? '사용' : '발동'}
        </p>
      </div>
      <p className="text-[11px] leading-[1.45] text-ink">{augment.description}</p>
    </div>
  );
}
