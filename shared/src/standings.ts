import { stepForward } from './board';
import type { GameState, Piece, Player, PlayerId } from './game';

/** Final order: winner first, then more finished pieces, then fewer steps left. Ties keep seat order. */
export function standings(state: GameState): Player[] {
  const score = (id: PlayerId) => {
    const own = state.pieces.filter((p) => p.owner === id && !p.clone);
    return {
      won: id === state.winner ? 1 : 0,
      finished: own.filter((p) => p.state.kind === 'FINISHED').length,
      left: own.reduce((sum, p) => sum + stepsLeft(p), 0),
    };
  };
  return [...state.players].sort((x, y) => {
    const a = score(x.id);
    const b = score(y.id);
    return b.won - a.won || b.finished - a.finished || a.left - b.left;
  });
}

/** Steps a piece still needs to finish along its own route. */
export function stepsLeft(piece: Piece): number {
  if (piece.state.kind === 'FINISHED') return 0;
  if (piece.state.kind === 'WAITING') return WAITING_STEPS;
  let spot = { node: piece.state.node, prev: piece.state.prev };
  for (let steps = 1; ; steps++) {
    const next = stepForward(spot, 1);
    if (next === 'FINISHED') return steps;
    spot = next;
  }
}

/** A waiting piece needs 20 steps to reach home and one more to finish. */
const WAITING_STEPS = 21;
