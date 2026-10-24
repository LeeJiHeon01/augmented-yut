import { motion } from 'motion/react';
import type { YutResult } from '@yut/shared';
import { RESULT_LABEL } from '../format';

/** Flat sides up per result. Stick 0 carries the backdo mark, so a lone flat stick 0 means Backdo. */
const FLAT: Record<YutResult, boolean[]> = {
  BACKDO: [true, false, false, false],
  DO: [false, true, false, false],
  GAE: [true, true, false, false],
  GEOL: [true, true, true, false],
  YUT: [true, true, true, true],
  MO: [false, false, false, false],
};

/** Where each stick lands (px from the centre) and its final tilt. */
const LANDING = [
  { x: -90, y: 6, rotate: -14 },
  { x: -30, y: -10, rotate: 6 },
  { x: 30, y: 8, rotate: -4 },
  { x: 90, y: -6, rotate: 12 },
];

const FLIGHT_S = 0.9;

/** Throw animation: four sticks fly up, spin, land showing the thrown result, then the result pops up. */
export function YutThrow({ result }: { result: YutResult }) {
  const flat = FLAT[result];
  return (
    <div className="pointer-events-none absolute top-[215px] left-[395px] z-30 flex size-[650px] items-center justify-center">
      {LANDING.map((land, i) => (
        <motion.div
          key={i}
          className="absolute"
          initial={{ x: land.x * 0.3, y: 260, rotate: 0, scale: 0.8 }}
          animate={{
            x: [land.x * 0.3, land.x * 0.6, land.x],
            y: [260, -200 - i * 18, land.y],
            rotate: [0, 420 + i * 140, 720 + land.rotate],
            scale: [0.8, 1.15, 1],
          }}
          transition={{ duration: FLIGHT_S, times: [0, 0.45, 1], ease: 'easeOut', delay: i * 0.04 }}
        >
          <Stick flat={flat[i] === true} marked={i === 0} />
        </motion.div>
      ))}
      <motion.p
        className="absolute top-[400px] font-serif text-[64px] font-bold text-gold-light [text-shadow:0_0_24px_rgba(217,184,120,0.8)]"
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: 1, scale: [0.4, 1.25, 1] }}
        transition={{ delay: FLIGHT_S, duration: 0.35 }}
      >
        {RESULT_LABEL[result]}!
      </motion.p>
    </div>
  );
}

/** One stick: round side dark wood, flat side light wood with X marks (the backdo stick has one more). */
function Stick({ flat, marked }: { flat: boolean; marked: boolean }) {
  // The face shows once the stick has landed; while spinning it shows the round side.
  return (
    <div className="relative h-[150px] w-[34px]">
      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#5c3a1c] via-[#8a5a2b] to-[#5c3a1c] shadow-[0_6px_14px_rgba(0,0,0,0.5)]" />
      <motion.div
        className="absolute inset-0 flex flex-col items-center justify-center gap-[14px] rounded-full border border-[#c9a46a] bg-gradient-to-r from-[#e6c995] via-[#f3e0b8] to-[#e6c995]"
        initial={{ opacity: 0 }}
        animate={{ opacity: flat ? 1 : 0 }}
        transition={{ delay: FLIGHT_S * 0.85, duration: 0.15 }}
      >
        {['×', '×', '×', ...(marked ? ['●'] : [])].map((m, j) => (
          <span key={j} className={`text-[16px] leading-none font-bold ${m === '●' ? 'text-[#b2412f]' : 'text-[#7a5228]'}`}>
            {m}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
