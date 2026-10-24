import type { NodeId } from '@yut/shared';

export interface Point {
  x: number;
  y: number;
}

/** Board is 650×650 in the design; node centers taken from the Figma frame. */
export const BOARD_SIZE = 650;

const NEAR = 80;
const FAR = 570;
const SIDE = [472, 374, 276, 178];
const DIAG_NEAR = 161.67;
const DIAG_MID = 243.33;
const DIAG_MID_FAR = 406.67;
const DIAG_FAR = 488.33;

export const NODE_POSITIONS: Record<NodeId, Point> = {
  0: { x: FAR, y: FAR },
  ...Object.fromEntries(SIDE.map((y, i) => [i + 1, { x: FAR, y }])),
  5: { x: FAR, y: NEAR },
  ...Object.fromEntries(SIDE.map((x, i) => [i + 6, { x, y: NEAR }])),
  10: { x: NEAR, y: NEAR },
  ...Object.fromEntries([...SIDE].reverse().map((y, i) => [i + 11, { x: NEAR, y }])),
  15: { x: NEAR, y: FAR },
  ...Object.fromEntries([...SIDE].reverse().map((x, i) => [i + 16, { x, y: FAR }])),
  20: { x: DIAG_FAR, y: DIAG_NEAR },
  21: { x: DIAG_MID_FAR, y: DIAG_MID },
  22: { x: 325, y: 325 },
  23: { x: DIAG_MID, y: DIAG_MID_FAR },
  24: { x: DIAG_NEAR, y: DIAG_FAR },
  25: { x: DIAG_NEAR, y: DIAG_NEAR },
  26: { x: DIAG_MID, y: DIAG_MID },
  27: { x: DIAG_MID_FAR, y: DIAG_MID_FAR },
  28: { x: DIAG_FAR, y: DIAG_FAR },
};

const BIG_NODES = new Set<NodeId>([0, 5, 10, 15, 22]);

/** Corners and center are drawn larger. */
export function isBigNode(node: NodeId): boolean {
  return BIG_NODES.has(node);
}
