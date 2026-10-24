import { stackOf, type ActiveSpec, type AugmentTarget, type GameState, type NodeId } from '@yut/shared';

/** An active augment waiting for its target picks. */
export interface Targeting {
  augmentId: string;
  spec: ActiveSpec;
  target: AugmentTarget;
}

export type TargetStep = 'PIECE' | 'OTHER_PIECE' | 'DIRECTION' | 'RESULT' | 'DELTA' | 'OPPONENT' | 'NODE' | 'DONE';

/** What still has to be picked. */
export function nextStep({ spec, target }: Targeting): TargetStep {
  switch (spec.target) {
    case 'NONE':
      return 'DONE';
    case 'RESULT':
      return target.result ? 'DONE' : 'RESULT';
    case 'DELTA':
      return target.delta ? 'DONE' : 'DELTA';
    case 'OPPONENT':
      return target.playerId ? 'DONE' : 'OPPONENT';
    case 'EMPTY_NODE':
      return target.node !== undefined ? 'DONE' : 'NODE';
    case 'ENEMY_DIRECTION':
      return !target.pieceId ? 'PIECE' : !target.direction ? 'DIRECTION' : 'DONE';
    case 'OWN_AND_ENEMY':
    case 'TWO_OWN':
      return !target.pieceId ? 'PIECE' : !target.otherPieceId ? 'OTHER_PIECE' : 'DONE';
    default:
      return target.pieceId ? 'DONE' : 'PIECE';
  }
}

/** Instruction shown while picking. */
export function stepHint(t: Targeting, step: TargetStep): string {
  const kind = t.spec.target;
  if (step === 'NODE') return '함정을 놓을 빈 칸을 고르세요';
  if (step === 'DIRECTION') return '움직일 방향을 고르세요';
  if (step === 'RESULT') return '다음 던지기 결과를 고르세요';
  if (step === 'DELTA') return '결과를 한 칸 올릴지 내릴지 고르세요';
  if (step === 'OPPONENT') return '상대를 고르세요';
  if (kind === 'TWO_OWN') return step === 'PIECE' ? '출발점으로 돌려보낼 내 말을 고르세요' : '5칸 전진할 내 말을 고르세요';
  if (kind === 'OWN_AND_ENEMY') return step === 'PIECE' ? '내 말을 고르세요' : '상대 말을 고르세요';
  if (kind === 'ENEMY_PIECE' || kind === 'ENEMY_DIRECTION') return '상대 말을 고르세요';
  if (kind === 'ANY_PIECE') return '판 위의 말을 고르세요';
  if (kind === 'OWN_STACKED_PIECE') return '업힌 내 말을 고르세요';
  return '내 말을 고르세요';
}

/** Pieces the current step can pick (the server checks again). */
export function pickablePieces(game: GameState, me: string, t: Targeting, step: TargetStep): Set<string> {
  const onBoard = game.pieces.filter((p) => p.state.kind === 'ON_BOARD');
  const ownBoard = onBoard.filter((p) => p.owner === me);
  const enemyBoard = onBoard.filter((p) => p.owner !== me);
  const firstWaiting = game.pieces.filter((p) => p.owner === me && p.state.kind === 'WAITING').slice(0, 1);
  const ids = (list: { id: string }[]) => new Set(list.map((p) => p.id));
  const kind = t.spec.target;

  if (step === 'OTHER_PIECE') {
    if (kind === 'TWO_OWN') return ids([...ownBoard, ...firstWaiting].filter((p) => p.id !== t.target.pieceId));
    return ids(enemyBoard);
  }
  if (step !== 'PIECE') return new Set();
  switch (kind) {
    case 'OWN_PIECE':
      return ids([...ownBoard, ...firstWaiting]);
    case 'OWN_BOARD_PIECE':
    case 'TWO_OWN':
      return ids(ownBoard);
    case 'OWN_STACKED_PIECE':
      return ids(ownBoard.filter((p) => stackOf(game.pieces, p).length >= 2));
    case 'ENEMY_PIECE':
    case 'ENEMY_DIRECTION':
      return ids(enemyBoard);
    case 'ANY_PIECE':
      return ids(onBoard);
    case 'OWN_AND_ENEMY':
      // C-S8 can also start a waiting piece.
      return ids(t.augmentId === 'C-S8' ? [...ownBoard, ...firstWaiting] : ownBoard);
    default:
      return new Set();
  }
}

/** Empty nodes for a trap. */
export function pickableNodes(game: GameState): Set<NodeId> {
  const taken = new Set(game.pieces.flatMap((p) => (p.state.kind === 'ON_BOARD' ? [p.state.node] : [])));
  for (const trap of game.field.traps) taken.add(trap.node);
  return new Set(Array.from({ length: 29 }, (_, n) => n).filter((n) => !taken.has(n)));
}
