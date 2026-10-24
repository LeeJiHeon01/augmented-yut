import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { PieceColor } from '@yut/shared';
import { COLOR_META } from '../colors';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { icon?: string; children: ReactNode };

/** Gold gradient primary button. */
export function GoldButton({ icon, children, className = '', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`flex items-center justify-center gap-[10px] rounded-[8px] border border-gold-light bg-gradient-to-b from-[#f0d49c] to-[#b98f4d] text-[16px] font-bold text-button-ink shadow-[0_0_24px_rgba(221,182,108,0.21)] transition enabled:hover:brightness-105 disabled:cursor-not-allowed disabled:border-bronze disabled:bg-none disabled:bg-[#736344] disabled:text-[#d0c2a8] disabled:shadow-none ${className}`}
      {...rest}
    >
      {icon && <img alt="" src={icon} className="size-[20px]" />}
      {children}
    </button>
  );
}

/** Dark button with bronze border. */
export function OutlineButton({ icon, children, className = '', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`flex items-center justify-center gap-[10px] rounded-[8px] border border-bronze bg-[rgba(217,184,120,0.08)] text-[16px] font-bold text-gold-light transition enabled:hover:bg-[rgba(217,184,120,0.14)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    >
      {icon && <img alt="" src={icon} className="size-[20px]" />}
      {children}
    </button>
  );
}

/** Small rounded status label (방장, 내 턴, 18초 …). */
export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-[rgba(217,184,120,0.27)] bg-[rgba(217,184,120,0.08)] px-[10px] py-[5px] text-[11px] leading-none font-medium whitespace-nowrap text-gold">
      {children}
    </span>
  );
}

/** Circle with the color's emblem. */
export function Emblem({ color, size }: { color: PieceColor; size: number }) {
  const meta = COLOR_META[color];
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full border"
      style={{ width: size, height: size, background: meta.soft, borderColor: meta.ring }}
    >
      <img alt="" src={meta.emblem} style={{ width: size * 0.46, height: size * 0.46 }} />
    </div>
  );
}

/** Empty augment slot (augments are not implemented yet). Border tint follows the design order. */
const SLOT_BORDERS = ['rgba(196,208,228,0.44)', 'rgba(217,184,120,0.44)', 'rgba(199,164,245,0.44)'];

/** Empty augment slots; tier border colors repeat silver, gold, prism. */
export function AugmentSlots({ size, count = SLOT_BORDERS.length }: { size: number; count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => SLOT_BORDERS[i % SLOT_BORDERS.length]).map((border, i) => (
        <div
          key={i}
          className="shrink-0 rounded-[8px] border bg-slot opacity-50"
          style={{ width: size, height: size, borderColor: border }}
        />
      ))}
    </>
  );
}

/** Check mark in any color (the design exports it only in red). */
export function CheckIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-[15px]" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
