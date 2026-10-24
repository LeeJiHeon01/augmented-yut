import { HOME, stepBack, stepForward, type Landing, type NodeId } from './board';
import { RuleError, type Piece, type PieceState, type PlayerId } from './game';
import { YUT_STEPS, type YutResult } from './yut';

export interface Move {
  pieceId: string;
  result: YutResult;
  /** Use the result as another one an augment allows (O-S1, O-S9, A-S14). */
  as?: YutResult;
}

export interface MoveOutcome {
  pieces: Piece[];
  /** Enemy pieces sent back to waiting. */
  capturedCount: number;
  /** Own pieces that finished with this move. */
  finishedCount: number;
  /** Own pieces already on the landing node that joined the stack. */
  stackedCount: number;
}

/** Own pieces sharing the board node with `piece`. They always move together. */
export function stackOf(pieces: readonly Piece[], piece: Piece): Piece[] {
  const { state } = piece;
  if (state.kind !== 'ON_BOARD') return [piece];
  return pieces.filter(
    (p) => p.owner === piece.owner && p.state.kind === 'ON_BOARD' && p.state.node === state.node,
  );
}

/** One candidate per distinct result: a waiting piece plus one piece per board stack. */
export function legalMoves(
  pieces: readonly Piece[],
  playerId: PlayerId,
  results: readonly YutResult[],
): Move[] {
  const own = pieces.filter((p) => p.owner === playerId);
  const firstWaiting = own.find((p) => p.state.kind === 'WAITING');
  const stackHeads: Piece[] = [];
  const seenNodes = new Set<number>();
  for (const p of own) {
    if (p.state.kind !== 'ON_BOARD' || seenNodes.has(p.state.node)) continue;
    seenNodes.add(p.state.node);
    stackHeads.push(p);
  }

  const moves: Move[] = [];
  for (const result of new Set(results)) {
    if (firstWaiting && YUT_STEPS[result] > 0) moves.push({ pieceId: firstWaiting.id, result });
    for (const head of stackHeads) moves.push({ pieceId: head.id, result });
  }
  return moves;
}

function stateAt(landing: Landing): PieceState {
  return landing === 'FINISHED'
    ? { kind: 'FINISHED' }
    : { kind: 'ON_BOARD', node: landing.node, prev: landing.prev };
}

/** Steps for a result; augment bonus steps only add to forward moves. */
function stepsFor(result: YutResult, extraSteps: number): number {
  const steps = YUT_STEPS[result];
  return steps > 0 ? steps + extraSteps : steps;
}

/** Where `piece` would land with `result`. Also used for move previews. */
export function landingOf(piece: Piece, result: YutResult, extraSteps = 0): Landing {
  if (piece.state.kind === 'FINISHED') throw new RuleError('움직일 수 없는 말이에요');
  const steps = stepsFor(result, extraSteps);
  if (piece.state.kind === 'WAITING') {
    if (steps < 0) throw new RuleError('빽도로는 새 말을 낼 수 없어요');
    return stepForward(null, steps);
  }
  const spot = { node: piece.state.node, prev: piece.state.prev };
  return steps < 0 ? stepBack(spot) : stepForward(spot, steps);
}

/** Nodes passed on the way, ending on the landing node (HOME when finishing). For move previews. */
export function routeOf(piece: Piece, result: YutResult, extraSteps = 0): NodeId[] {
  const steps = stepsFor(result, extraSteps);
  if (steps < 0) {
    const landing = landingOf(piece, result);
    return landing === 'FINISHED' ? [HOME] : [landing.node];
  }
  if (piece.state.kind === 'FINISHED') throw new RuleError('움직일 수 없는 말이에요');
  const from = piece.state.kind === 'WAITING' ? null : { node: piece.state.node, prev: piece.state.prev };
  const route: NodeId[] = [];
  for (let k = 1; k <= steps; k++) {
    const landing = stepForward(from, k);
    if (landing === 'FINISHED') {
      // Passing the start node: the route ends there.
      if (route.at(-1) !== HOME) route.push(HOME);
      break;
    }
    route.push(landing.node);
  }
  return route;
}

/** Move a piece (with its stack), then stack onto own pieces or capture enemy pieces. */
export function applyMove(pieces: readonly Piece[], move: Move, extraSteps = 0): MoveOutcome {
  const piece = pieces.find((p) => p.id === move.pieceId);
  if (!piece) throw new RuleError('움직일 수 없는 말이에요');
  const landing = landingOf(piece, move.result, extraSteps);

  const movers = new Set(stackOf(pieces, piece).map((p) => p.id));
  const landed = stateAt(landing);
  let capturedCount = 0;
  let stackedCount = 0;

  const next = pieces.map((p): Piece => {
    if (movers.has(p.id)) return { ...p, state: landed };
    if (landing === 'FINISHED' || p.state.kind !== 'ON_BOARD' || p.state.node !== landing.node) return p;
    // Own piece already there joins the stack and shares its route memory.
    if (p.owner === piece.owner) {
      stackedCount++;
      return { ...p, state: landed };
    }
    capturedCount++;
    return { ...p, state: { kind: 'WAITING' } };
  });

  return {
    pieces: next,
    capturedCount,
    finishedCount: landing === 'FINISHED' ? movers.size : 0,
    stackedCount,
  };
}
