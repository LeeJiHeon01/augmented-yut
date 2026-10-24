import type { PieceColor } from '@yut/shared';
import dotBlue from './assets/figma/dot-blue.svg';
import dotGreen from './assets/figma/dot-green.svg';
import dotRed from './assets/figma/dot-red.svg';
import dotYellow from './assets/figma/dot-yellow.svg';
import emblemFlame from './assets/figma/emblem-flame-46.svg';
import emblemGhost from './assets/figma/emblem-ghost-46.svg';
import emblemLeaf from './assets/figma/emblem-leaf-46.svg';
import emblemMoon from './assets/figma/emblem-moon-46.svg';
import goalBlue from './assets/figma/goal-blue.svg';
import goalGreen from './assets/figma/goal-green.svg';
import goalRed from './assets/figma/goal-red.svg';
import goalYellow from './assets/figma/goal-yellow.svg';
import pieceBlue from './assets/figma/piece-blue.svg';
import pieceGlowBlue from './assets/figma/piece-glow-blue.svg';
import pieceGlowGreen from './assets/figma/piece-glow-green.svg';
import pieceGlowRed from './assets/figma/piece-glow-red.svg';
import pieceGlowYellow from './assets/figma/piece-glow-yellow.svg';
import pieceGreen from './assets/figma/piece-green.svg';
import pieceMarkFlame from './assets/figma/piece-mark-flame.svg';
import pieceMarkGhost from './assets/figma/piece-mark-ghost.svg';
import pieceMarkLeaf from './assets/figma/piece-mark-leaf.svg';
import pieceMarkMoon from './assets/figma/piece-mark-moon.svg';
import pieceRed from './assets/figma/piece-red.svg';
import pieceYellow from './assets/figma/piece-yellow.svg';

export interface ColorMeta {
  label: string;
  hex: string;
  /** Emblem circle fill and ring. */
  soft: string;
  ring: string;
  emblem: string;
  piece: string;
  glow: string;
  mark: string;
  goal: string;
  dot: string;
}

export const COLOR_META: Record<PieceColor, ColorMeta> = {
  RED: {
    label: '홍색',
    hex: '#ed827d',
    soft: 'rgba(237,130,125,0.07)',
    ring: 'rgba(237,130,125,0.5)',
    emblem: emblemMoon,
    piece: pieceRed,
    glow: pieceGlowRed,
    mark: pieceMarkMoon,
    goal: goalRed,
    dot: dotRed,
  },
  BLUE: {
    label: '청색',
    hex: '#7db7f2',
    soft: 'rgba(125,183,242,0.07)',
    ring: 'rgba(125,183,242,0.5)',
    emblem: emblemGhost,
    piece: pieceBlue,
    glow: pieceGlowBlue,
    mark: pieceMarkGhost,
    goal: goalBlue,
    dot: dotBlue,
  },
  GREEN: {
    label: '녹색',
    hex: '#74c7ae',
    soft: 'rgba(116,199,174,0.07)',
    ring: 'rgba(116,199,174,0.5)',
    emblem: emblemLeaf,
    piece: pieceGreen,
    glow: pieceGlowGreen,
    mark: pieceMarkLeaf,
    goal: goalGreen,
    dot: dotGreen,
  },
  YELLOW: {
    label: '황색',
    hex: '#e8c96d',
    soft: 'rgba(232,201,109,0.07)',
    ring: 'rgba(232,201,109,0.5)',
    emblem: emblemFlame,
    piece: pieceYellow,
    glow: pieceGlowYellow,
    mark: pieceMarkFlame,
    goal: goalYellow,
    dot: dotYellow,
  },
};
