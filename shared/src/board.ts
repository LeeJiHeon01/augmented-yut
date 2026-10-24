/**
 * 29-node yut board.
 * Outer path: 0 -> 1 -> ... -> 19 -> 0 -> finish.
 * Shortcut from corner 5: 5 -> 20 -> 21 -> 22 -> 23 -> 24 -> 15.
 * Shortcut from corner 10: 10 -> 25 -> 26 -> 22 -> 27 -> 28 -> 0.
 */
export type NodeId = number;

/** Start and finish corner (참먹이). */
export const HOME = 0;
/** Board center (방). */
export const CENTER = 22;

/** A piece on the board. `prev` is the node it stood on just before. */
export interface Spot {
  node: NodeId;
  prev: NodeId;
}

export type Landing = Spot | 'FINISHED';

/** Successor while passing through a node. HOME and CENTER are handled in `passNext`. */
const NEXT: Record<NodeId, NodeId> = {
  ...Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i + 1, i + 2])),
  19: HOME,
  20: 21,
  21: CENTER,
  23: 24,
  24: 15,
  25: 26,
  26: CENTER,
  27: 28,
  28: HOME,
};

/** Shortcut taken only when a move starts from this node. */
const TURN_FROM_STOP: Partial<Record<NodeId, NodeId>> = { 5: 20, 10: 25, [CENTER]: 27 };

/** The four corners of the outer path. */
export const CORNERS: readonly NodeId[] = [HOME, 5, 10, 15];

/**
 * How a piece treats shortcuts: NORMAL turns only when a move starts on a corner,
 * ALWAYS also turns when passing one (O-S7), NEVER keeps to the outer path (O-P7).
 */
export type ShortcutMode = 'NORMAL' | 'ALWAYS' | 'NEVER';

/** Fallback predecessor used after a backdo, when the real one is unknown. */
const PREV: Record<NodeId, NodeId> = {
  ...Object.fromEntries(Array.from({ length: 19 }, (_, i) => [i + 1, i])),
  [HOME]: 19,
  20: 5,
  21: 20,
  [CENTER]: 21,
  23: CENTER,
  24: 23,
  25: 10,
  26: 25,
  27: CENTER,
  28: 27,
};

function lookup(table: Record<NodeId, NodeId>, node: NodeId): NodeId {
  const found = table[node];
  if (found === undefined) throw new RangeError(`unknown node ${node}`);
  return found;
}

function passNext(node: NodeId, prev: NodeId): NodeId | 'FINISHED' {
  if (node === HOME) return 'FINISHED';
  if (node === CENTER) return prev === 21 ? 23 : 27;
  return lookup(NEXT, node);
}

/** Move forward `steps` nodes. `from === null` means the piece is still waiting. */
export function stepForward(from: Spot | null, steps: number, mode: ShortcutMode = 'NORMAL'): Landing {
  if (steps < 1) throw new RangeError('steps must be >= 1');

  let node: NodeId;
  let prev: NodeId;
  if (from === null) {
    node = 1;
    prev = HOME;
  } else {
    const turn = mode === 'NEVER' ? undefined : TURN_FROM_STOP[from.node];
    const first = turn ?? passNext(from.node, from.prev);
    if (first === 'FINISHED') return 'FINISHED';
    node = first;
    prev = from.node;
  }

  for (let i = 1; i < steps; i++) {
    const next = (mode === 'ALWAYS' ? TURN_FROM_STOP[node] : undefined) ?? passNext(node, prev);
    if (next === 'FINISHED') return 'FINISHED';
    prev = node;
    node = next;
  }
  return { node, prev };
}

/** Backdo: return to the previous node. */
export function stepBack(from: Spot): Spot {
  return { node: from.prev, prev: lookup(PREV, from.prev) };
}

/** A piece placed directly on a node, coming from its usual previous node. */
export function spotAt(node: NodeId): Spot {
  return { node, prev: lookup(PREV, node) };
}

/** Several backdo steps in a row. */
export function stepsBack(from: Spot, steps: number): Spot {
  let spot = from;
  for (let i = 0; i < steps; i++) spot = stepBack(spot);
  return spot;
}

/** Nodes one step ahead (any branch) or one step behind. */
export function neighbors(from: Spot): NodeId[] {
  const ahead = [TURN_FROM_STOP[from.node], passNext(from.node, from.prev)];
  return [...new Set([...ahead, from.prev])].filter((n): n is NodeId => typeof n === 'number');
}
