import { CENTER, HOME, neighbors, stepForward, stepsBack, type Landing, type NodeId, type Spot } from './board';
import {
  finishedCount,
  lastPlaceOf,
  leaderOf,
  playerOf,
  RESULT_ORDER,
  updatePlayer,
  updateStatus,
} from './effects';
import { RuleError, type GameState, type Piece, type Player, type PlayerId } from './game';
import { stackOf } from './moves';
import {
  ACTIVE_IDS,
  extraFor,
  finishPieces,
  landPieces,
  leadPiece,
  pieceById,
  sendHome,
  shortcutMode,
  spotOf,
  trailPiece,
} from './play';
import { randomPairs } from './chaos';
import { stepsLeft } from './standings';
import { grantsExtraThrow, throwSticks, type YutResult } from './yut';

export const RESULT_NAME: Record<YutResult, string> = {
  BACKDO: '빽도',
  DO: '도',
  GAE: '개',
  GEOL: '걸',
  YUT: '윷',
  MO: '모',
};

/** What the player picks before an active fires. */
export type TargetKind =
  | 'NONE'
  /** One of my pieces that is not finished (waiting allowed). */
  | 'OWN_PIECE'
  /** One of my pieces on the board. */
  | 'OWN_BOARD_PIECE'
  /** One of my pieces inside a stack. */
  | 'OWN_STACKED_PIECE'
  | 'ENEMY_PIECE'
  | 'ANY_PIECE'
  /** My piece first, then an enemy piece. */
  | 'OWN_AND_ENEMY'
  /** Two of my pieces: the first goes home, the second moves. */
  | 'TWO_OWN'
  | 'OPPONENT'
  | 'EMPTY_NODE'
  | 'RESULT'
  | 'DELTA'
  /** An enemy piece and a direction. */
  | 'ENEMY_DIRECTION';

export interface AugmentTarget {
  pieceId?: string;
  otherPieceId?: string;
  playerId?: PlayerId;
  node?: NodeId;
  result?: YutResult;
  delta?: 1 | -1;
  direction?: 'FORWARD' | 'BACK';
}

/**
 * When an active can be used:
 * THROW before my throw, START before the first throw of my turn, TURN any time in my turn,
 * PENDING with an unused result, RETHROW right after my own throw, OFF_TURN right after someone else's throw.
 */
type When = 'THROW' | 'START' | 'TURN' | 'PENDING' | 'RETHROW' | 'OFF_TURN';

interface Ctx {
  state: GameState;
  playerId: PlayerId;
  augmentId: string;
  target: AugmentTarget;
  random: () => number;
}

interface ActiveDef {
  limit: number;
  when: When;
  target: TargetKind;
  /** Results to pick from for RESULT targets. */
  choices?: readonly YutResult[];
  /** Holds a reservation for the next throw. */
  reserve?: boolean;
  /** Reason the active cannot be used right now, if any. */
  blocked?: (state: GameState, playerId: PlayerId) => string | null;
  run: (ctx: Ctx) => { state: GameState; detail: string };
}

export interface ActiveSpec {
  target: TargetKind;
  choices?: readonly YutResult[];
  /** Steps for ENEMY_DIRECTION targets. */
  steps?: number;
}

// --- helpers -------------------------------------------------------------

const PUSH_STEPS: Record<string, number> = { 'C-S3': 2, 'A-P2': 4 };

function round(state: GameState): number {
  return Math.min(...state.players.map((p) => p.regularTurnsCompleted));
}

function ctxLand(ctx: Ctx, headId: string) {
  // Augment moves: the target's defences apply, no capture rewards.
  return { actor: ctx.playerId, headId, full: false, defend: true, leader: null, random: ctx.random };
}

/** Move a piece (with its stack when `withStack`) by steps, forward or back; augment moves only capture. */
function shift(ctx: Ctx, state: GameState, piece: Piece, steps: number, withStack = true): GameState {
  const spot = spotOf(piece);
  const ids = withStack && spot ? stackOf(state.pieces, piece).map((p) => p.id) : [piece.id];
  let landing: Landing;
  if (steps < 0) {
    if (!spot) return state;
    landing = stepsBack(spot, -steps);
  } else {
    landing = stepForward(spot, steps, shortcutMode(state, piece.owner));
  }
  return landPieces(state, ids, landing, ctxLand(ctx, piece.id)).state;
}

/** Put a piece (and its stack) on a node directly. */
function putAt(ctx: Ctx, state: GameState, piece: Piece, spot: Spot, withStack = true): GameState {
  const ids = withStack && spotOf(piece) ? stackOf(state.pieces, piece).map((p) => p.id) : [piece.id];
  return landPieces(state, ids, spot, ctxLand(ctx, piece.id)).state;
}

function swapPlaces(state: GameState, a: Piece, b: Piece): GameState {
  return {
    ...state,
    pieces: state.pieces.map((p) => (p.id === a.id ? { ...p, state: b.state } : p.id === b.id ? { ...p, state: a.state } : p)),
  };
}

function cornerSpot(node: NodeId): Spot {
  return node === CENTER ? { node, prev: 21 } : { node, prev: node === HOME ? 19 : node - 1 };
}

function pick<T>(list: readonly T[], random: () => number): T | undefined {
  return list[Math.floor(random() * list.length)];
}

function opponents(state: GameState, playerId: PlayerId): Player[] {
  return state.players.filter((p) => p.id !== playerId);
}

function nextSeat(state: GameState, playerId: PlayerId): Player | undefined {
  const i = state.players.findIndex((p) => p.id === playerId);
  return state.players[(i + 1) % state.players.length];
}

function previousSeat(state: GameState, playerId: PlayerId): Player | undefined {
  const i = state.players.findIndex((p) => p.id === playerId);
  return state.players[(i - 1 + state.players.length) % state.players.length];
}

function onBoard(state: GameState, owner?: PlayerId): Piece[] {
  return state.pieces.filter((p) => p.state.kind === 'ON_BOARD' && (owner === undefined || p.owner === owner));
}

// --- target checks --------------------------------------------------------

function ownPiece(ctx: Ctx, id: string | undefined, boardOnly: boolean): Piece {
  const piece = pieceById(ctx.state, id);
  if (!piece || piece.owner !== ctx.playerId || piece.state.kind === 'FINISHED' || (boardOnly && piece.state.kind !== 'ON_BOARD')) {
    throw new RuleError(boardOnly ? '판 위의 내 말을 골라 주세요' : '내 말을 골라 주세요');
  }
  return piece;
}

function enemyPiece(ctx: Ctx, id: string | undefined): Piece {
  const piece = pieceById(ctx.state, id);
  if (!piece || piece.owner === ctx.playerId || piece.state.kind !== 'ON_BOARD') throw new RuleError('판 위의 상대 말을 골라 주세요');
  return piece;
}

function anyBoardPiece(ctx: Ctx, id: string | undefined): Piece {
  const piece = pieceById(ctx.state, id);
  if (!piece || piece.state.kind !== 'ON_BOARD') throw new RuleError('판 위의 말을 골라 주세요');
  return piece;
}

function opponent(ctx: Ctx): Player {
  const player = ctx.state.players.find((p) => p.id === ctx.target.playerId);
  if (!player || player.id === ctx.playerId) throw new RuleError('상대를 골라 주세요');
  return player;
}

/** The latest unused result of the current turn. */
function latestPending(state: GameState): YutResult {
  const result = state.pendingResults.at(-1);
  if (!result) throw new RuleError('바꿀 결과가 없어요');
  return result;
}

function replaceLatest(state: GameState, result: YutResult): GameState {
  return { ...state, pendingResults: [...state.pendingResults.slice(0, -1), result] };
}

/** The thrown result a rethrow would discard: my last throw, still unused. */
function rethrowTarget(state: GameState, playerId: PlayerId): YutResult | null {
  const last = state.log.at(-1);
  if (state.turn !== playerId || (state.phase !== 'THROW' && state.phase !== 'MOVE')) return null;
  if (last?.kind !== 'THROW' || last.playerId !== playerId) return null;
  return state.pendingResults.at(-1) === last.result ? last.result : null;
}

/** Someone else's result thrown just now (O-G3). */
function freshEnemyThrow(state: GameState, playerId: PlayerId): YutResult | null {
  if (!state.turn || state.turn === playerId) return null;
  return rethrowTarget(state, state.turn);
}

// --- definitions ------------------------------------------------------------

const rethrow: ActiveDef = {
  limit: 2,
  when: 'RETHROW',
  target: 'NONE',
  run: ({ state, playerId }) => {
    const discarded = rethrowTarget(state, playerId);
    if (!discarded) throw new RuleError('지금은 사용할 수 없어요');
    return {
      state: {
        ...state,
        phase: 'THROW',
        pendingResults: state.pendingResults.slice(0, -1),
        // The discarded throw no longer grants its extra throw; the rethrow replaces it.
        throwsRemaining: state.throwsRemaining - (extraFor(state, discarded) ? 1 : 0) + 1,
      },
      detail: `${RESULT_NAME[discarded]} 버리고 다시 던지기`,
    };
  },
};

function reserve(limit: number, detail: string, choices?: readonly YutResult[]): ActiveDef {
  return {
    limit,
    when: 'THROW',
    target: choices ? 'RESULT' : 'NONE',
    reserve: true,
    ...(choices ? { choices } : {}),
    run: ({ state, playerId, augmentId, target }) => {
      if (choices && (!target.result || !choices.includes(target.result))) throw new RuleError('결과를 골라 주세요');
      const result = choices ? target.result : undefined;
      return {
        state: updatePlayer(state, playerId, (p) => ({ ...p, reserved: { augmentId, ...(result ? { result } : {}) } })),
        detail: result ? `다음 던지기 ${RESULT_NAME[result]} 확정` : detail,
      };
    },
  };
}

function push(steps: number): ActiveDef {
  return {
    limit: 1,
    when: 'TURN',
    target: 'ENEMY_DIRECTION',
    run: (ctx) => {
      const piece = enemyPiece(ctx, ctx.target.pieceId);
      const back = ctx.target.direction === 'BACK';
      return { state: shift(ctx, ctx.state, piece, back ? -steps : steps), detail: `상대 말 ${steps}칸 ${back ? '뒤로' : '앞으로'}` };
    },
  };
}

/** Enemy pieces next to my piece go home (O-P4, A-P5). */
const blast: ActiveDef = {
  limit: 1,
  when: 'TURN',
  target: 'OWN_BOARD_PIECE',
  run: (ctx) => {
    const piece = ownPiece(ctx, ctx.target.pieceId, true);
    const near = neighbors(spotOf(piece)!);
    const hit = onBoard(ctx.state).filter((p) => p.owner !== ctx.playerId && p.state.kind === 'ON_BOARD' && near.includes(p.state.node));
    return { state: sendHome(ctx.state, hit.map((p) => p.id)), detail: `주변 상대 말 ${hit.length}개 귀환` };
  },
};

const noLeaderTarget = (state: GameState, playerId: PlayerId) => {
  const leader = leaderOf(state);
  return !leader || leader === playerId ? '내가 1위라 쓸 수 없어요' : null;
};

const ALL_RESULTS = RESULT_ORDER;

const ACTIVES: Record<string, ActiveDef> = {
  'O-S3': rethrow,
  'A-S8': rethrow,
  'O-S13': reserve(1, '다음 던지기 걸 확정'),
  'A-G12': reserve(2, '다음 던지기 모 아니면 빽도'),
  'C-S2': reserve(1, '다음 던지기 윷·모·빽도 확률 상승'),
  'C-S5': reserve(1, '다음 던지기 도 아니면 모'),
  'C-S4': reserve(1, '다음 던지기 결과를 무작위 상대와 교환'),
  'A-S11': reserve(1, '', ['DO', 'GAE', 'GEOL']),
  'O-P1': reserve(1, '', ALL_RESULTS),
  'A-P1': reserve(2, '', ALL_RESULTS),
  'C-S7': {
    limit: 1,
    when: 'THROW',
    target: 'NONE',
    reserve: true,
    blocked: (state, playerId) => (copiedResult(state, playerId) ? null : '따라 할 결과가 없어요'),
    run: ({ state, playerId, augmentId }) => {
      const result = copiedResult(state, playerId);
      if (!result) throw new RuleError('따라 할 결과가 없어요');
      return {
        state: updatePlayer(state, playerId, (p) => ({ ...p, reserved: { augmentId, result } })),
        detail: `다음 던지기 ${RESULT_NAME[result]} (직전 플레이어 결과)`,
      };
    },
  },
  'O-S12': {
    limit: 1,
    when: 'TURN',
    target: 'EMPTY_NODE',
    run: ({ state, playerId, target }) => {
      const node = target.node;
      const valid = typeof node === 'number' && Number.isInteger(node) && node >= 0 && node <= 28;
      if (!valid || state.pieces.some((p) => p.state.kind === 'ON_BOARD' && p.state.node === node) || state.field.traps.some((t) => t.node === node)) {
        throw new RuleError('빈 칸을 골라 주세요');
      }
      return { state: { ...state, field: { ...state.field, traps: [...state.field.traps, { node, owner: playerId }] } }, detail: '빈 칸에 함정 설치' };
    },
  },
  'C-S1': {
    limit: 1,
    when: 'TURN',
    target: 'NONE',
    run: ({ state, playerId }) => ({
      state: updateStatus(state, playerId, () => ({ reverseUntil: playerOf(state, playerId).regularTurnsCompleted + 2 })),
      detail: '이번·다음 턴 도·개·걸 이동 방향 반대',
    }),
  },
  'C-S3': push(PUSH_STEPS['C-S3']!),
  'A-P2': push(PUSH_STEPS['A-P2']!),
  'C-S6': {
    limit: 1,
    when: 'TURN',
    target: 'OWN_BOARD_PIECE',
    run: (ctx) => {
      const piece = ownPiece(ctx, ctx.target.pieceId, true);
      const slip = ctx.random() < 0.5;
      return { state: shift(ctx, ctx.state, piece, slip ? -3 : 3), detail: slip ? '미끄러져 3칸 뒤로' : '3칸 앞으로' };
    },
  },
  'C-S8': {
    limit: 1,
    when: 'TURN',
    target: 'OWN_AND_ENEMY',
    run: (ctx) => {
      const mine = ownPiece(ctx, ctx.target.pieceId, false);
      const theirs = enemyPiece(ctx, ctx.target.otherPieceId);
      const moved = shift(ctx, ctx.state, mine, 2);
      const enemyNow = pieceById(moved, theirs.id);
      const both = enemyNow?.state.kind === 'ON_BOARD' ? shift(ctx, moved, enemyNow, 2) : moved;
      return { state: both, detail: '내 말과 상대 말 모두 2칸 앞으로' };
    },
  },
  'C-S10': {
    limit: 1,
    when: 'TURN',
    target: 'NONE',
    blocked: (state, playerId) => (state.pieces.some((p) => p.owner === playerId && p.state.kind === 'WAITING') ? null : '대기 말이 없어요'),
    run: (ctx) => {
      const piece = ctx.state.pieces.find((p) => p.owner === ctx.playerId && p.state.kind === 'WAITING');
      if (!piece) throw new RuleError('대기 말이 없어요');
      const corner = pick([5, 10, 15], ctx.random) ?? 5;
      return { state: putAt(ctx, ctx.state, piece, cornerSpot(corner)), detail: '대기 말을 꼭짓점에 배치' };
    },
  },
  'C-S11': {
    limit: 1,
    when: 'TURN',
    target: 'NONE',
    run: ({ state }) => ({
      state: { ...state, players: state.players.map((p) => ({ ...p, status: { ...p.status, forced: 'BACKDO' } })) },
      detail: '모든 플레이어 다음 던지기 빽도',
    }),
  },
  'C-S12': {
    limit: 1,
    when: 'TURN',
    target: 'NONE',
    run: ({ state, playerId, random }) => {
      const by = pick(opponents(state, playerId), random);
      if (!by) throw new RuleError('고를 상대가 없어요');
      return {
        state: { ...state, field: { ...state.field, delegate: { owner: playerId, by: by.id } } },
        detail: '무작위 상대가 내 다음 이동을 대신 고름',
      };
    },
  },
  'C-S13': {
    limit: 1,
    when: 'TURN',
    target: 'OWN_BOARD_PIECE',
    run: (ctx) => {
      const piece = ownPiece(ctx, ctx.target.pieceId, true);
      if (ctx.random() < 0.3) {
        return { state: sendHome(ctx.state, stackOf(ctx.state.pieces, piece).map((p) => p.id)), detail: '출발점으로 귀환' };
      }
      const corner = pick([5, 10, 15, CENTER], ctx.random) ?? 5;
      return { state: putAt(ctx, ctx.state, piece, cornerSpot(corner)), detail: '무작위 꼭짓점으로 이동' };
    },
  },
  'C-S15': {
    limit: 1,
    when: 'TURN',
    target: 'NONE',
    run: (ctx) => {
      // Everyone steps at once: nobody is captured, pieces may share a node.
      let next = ctx.state;
      const finished: string[] = [];
      next = {
        ...next,
        pieces: next.pieces.map((p) => {
          const spot = spotOf(p);
          if (!spot) return p;
          const landing = stepForward(spot, 1, shortcutMode(ctx.state, p.owner));
          if (landing === 'FINISHED') {
            finished.push(p.id);
            return p;
          }
          return { ...p, state: { kind: 'ON_BOARD', node: landing.node, prev: landing.prev } };
        }),
      };
      next = finishPieces(next, finished).state;
      return { state: next, detail: '판 위 모든 말 1칸 앞으로' };
    },
  },
  'O-G3': {
    limit: 1,
    when: 'OFF_TURN',
    target: 'NONE',
    run: ({ state, playerId }) => {
      const result = freshEnemyThrow(state, playerId);
      if (!result) throw new RuleError('지금은 사용할 수 없어요');
      const lostThrow = extraFor(state, result) && state.throwsRemaining > 0 ? 1 : 0;
      return {
        state: { ...replaceLatest(state, 'BACKDO'), throwsRemaining: state.throwsRemaining - lostThrow },
        detail: `상대 결과 ${RESULT_NAME[result]} → 빽도`,
      };
    },
  },
  'O-G6': {
    limit: 1,
    when: 'TURN',
    target: 'OWN_BOARD_PIECE',
    run: (ctx) => {
      const piece = ownPiece(ctx, ctx.target.pieceId, true);
      const mode = shortcutMode(ctx.state, piece.owner);
      let spot = spotOf(piece)!;
      for (let i = 0; i < 12; i++) {
        const next = stepForward(spot, 1, mode);
        if (next === 'FINISHED') break;
        spot = next;
        if ([5, 10, 15, CENTER, HOME].includes(spot.node)) break;
      }
      return { state: putAt(ctx, ctx.state, piece, spot), detail: '앞쪽 꼭짓점으로 순간이동' };
    },
  },
  'O-G9': {
    limit: 2,
    when: 'PENDING',
    target: 'DELTA',
    run: ({ state, target }) => {
      const result = latestPending(state);
      const index = RESULT_ORDER.indexOf(result) + (target.delta === -1 ? -1 : target.delta === 1 ? 1 : NaN);
      const adjusted = RESULT_ORDER[index];
      if (!adjusted) throw new RuleError('더 조정할 수 없어요');
      return { state: replaceLatest(state, adjusted), detail: `${RESULT_NAME[result]} → ${RESULT_NAME[adjusted]}` };
    },
  },
  'O-G13': {
    limit: 1,
    when: 'TURN',
    target: 'OWN_AND_ENEMY',
    run: (ctx) => {
      const mine = ownPiece(ctx, ctx.target.pieceId, true);
      const theirs = enemyPiece(ctx, ctx.target.otherPieceId);
      if (Math.abs(stepsLeft(mine) - stepsLeft(theirs)) > 5) throw new RuleError('5칸 이내의 상대 말만 바꿀 수 있어요');
      return { state: swapPlaces(ctx.state, mine, theirs), detail: '내 말과 상대 말 위치 교환' };
    },
  },
  'A-G2': {
    limit: 2,
    when: 'TURN',
    target: 'TWO_OWN',
    run: (ctx) => {
      const back = ownPiece(ctx, ctx.target.pieceId, true);
      const forward = ownPiece(ctx, ctx.target.otherPieceId, false);
      if (back.id === forward.id) throw new RuleError('서로 다른 말 두 개를 골라 주세요');
      const home = sendHome(ctx.state, [back.id]);
      const mover = pieceById(home, forward.id)!;
      return { state: shift(ctx, home, mover, 5, false), detail: '말 1개 귀환, 다른 말 5칸 전진' };
    },
  },
  'A-G3': {
    limit: 1,
    when: 'PENDING',
    target: 'NONE',
    run: ({ state, playerId, random }) => {
      const mine = latestPending(state);
      const other = nextSeat(state, playerId);
      if (!other || other.id === playerId) throw new RuleError('바꿀 상대가 없어요');
      const theirs = throwSticks(random);
      const next = updateStatus(replaceLatest(state, theirs), other.id, () => ({ forced: mine }));
      return { state: next, detail: `${RESULT_NAME[mine]} ↔ ${RESULT_NAME[theirs]} 교환` };
    },
  },
  'A-G6': {
    limit: 2,
    when: 'TURN',
    target: 'OWN_BOARD_PIECE',
    run: (ctx) => {
      const piece = ownPiece(ctx, ctx.target.pieceId, true);
      const node = (piece.state as { node: NodeId }).node;
      const until = playerOf(ctx.state, ctx.playerId).regularTurnsCompleted + 1;
      const blocks = [...ctx.state.field.blocks, { node, owner: ctx.playerId, until }];
      return { state: { ...ctx.state, field: { ...ctx.state.field, blocks } }, detail: '이 칸 통과 차단 (다음 내 턴까지)' };
    },
  },
  'A-G9': {
    limit: 2,
    when: 'TURN',
    target: 'NONE',
    blocked: (state, playerId) => (lastPlaceOf(state) === playerId ? null : '꼴찌일 때만 쓸 수 있어요'),
    run: ({ state, playerId }) => ({
      state: updateStatus(state, playerId, (s) => ({ turn: { ...s.turn, bonus: s.turn.bonus + 2 } })),
      detail: '이번 턴 이동마다 +2칸',
    }),
  },
  'A-G10': {
    limit: 2,
    when: 'TURN',
    target: 'OWN_STACKED_PIECE',
    run: (ctx) => {
      const piece = ownPiece(ctx, ctx.target.pieceId, true);
      if (stackOf(ctx.state.pieces, piece).length < 2) throw new RuleError('업힌 말을 골라 주세요');
      return { state: shift(ctx, ctx.state, piece, 3, false), detail: '업힌 말 하나 떼어 3칸 전진' };
    },
  },
  'A-G11': {
    limit: 1,
    when: 'TURN',
    target: 'ENEMY_PIECE',
    run: (ctx) => {
      const piece = enemyPiece(ctx, ctx.target.pieceId);
      const until = playerOf(ctx.state, piece.owner).regularTurnsCompleted + 2;
      const shadows = [...ctx.state.field.shadows, { target: piece.id, owner: ctx.playerId, until }];
      return { state: { ...ctx.state, field: { ...ctx.state.field, shadows } }, detail: '상대 말 추적 (2턴)' };
    },
  },
  'C-G1': {
    limit: 1,
    when: 'TURN',
    target: 'NONE',
    run: ({ state, playerId, random }) => {
      const other = pick(opponents(state, playerId), random);
      if (!other) throw new RuleError('동맹할 상대가 없어요');
      const until = playerOf(state, playerId).regularTurnsCompleted + 2;
      const alliance = { source: 'C-G1' as const, pairs: [[playerId, other.id]] as [string, string][], clock: playerId, until };
      return { state: { ...state, field: { ...state.field, alliance } }, detail: '무작위 상대와 2턴 동맹' };
    },
  },
  'C-P2': {
    limit: 1,
    when: 'TURN',
    target: 'NONE',
    blocked: (state) => (state.players.length === 4 ? null : '4명일 때만 쓸 수 있어요'),
    run: ({ state, random }) => {
      const now = round(state);
      const pairs = randomPairs(state.players.map((p) => p.id), random);
      const alliance = { source: 'C-P2' as const, pairs, clock: 'ROUND' as const, until: now + 2 };
      return { state: { ...state, field: { ...state.field, alliance } }, detail: '2:2 팀 셔플 (2라운드)' };
    },
  },
  'C-G2': {
    limit: 1,
    when: 'TURN',
    target: 'NONE',
    blocked: noLeaderTarget,
    run: (ctx) => {
      const leader = leaderOf(ctx.state)!;
      let next = ctx.state;
      const seen = new Set<NodeId>();
      for (const piece of onBoard(ctx.state, leader)) {
        const node = (piece.state as { node: NodeId }).node;
        if (seen.has(node)) continue;
        seen.add(node);
        const now = pieceById(next, piece.id);
        if (now?.state.kind === 'ON_BOARD') next = shift(ctx, next, now, -3);
      }
      return { state: next, detail: '1위의 판 위 말 모두 3칸 후퇴' };
    },
  },
  'C-G3': {
    limit: 1,
    when: 'TURN',
    target: 'OWN_AND_ENEMY',
    run: (ctx) => {
      const mine = ownPiece(ctx, ctx.target.pieceId, true);
      const theirs = enemyPiece(ctx, ctx.target.otherPieceId);
      return { state: swapPlaces(ctx.state, mine, theirs), detail: '내 말과 상대 말 위치 교환' };
    },
  },
  'C-G4': {
    limit: 1,
    when: 'TURN',
    target: 'NONE',
    run: ({ state, playerId }) => ({
      state: updateStatus(state, playerId, (s) => ({ turn: { ...s.turn, controlEnemy: true } })),
      detail: '이번 턴 상대 말 하나를 내 말처럼 이동',
    }),
  },
  'C-G5': {
    limit: 1,
    when: 'TURN',
    target: 'ANY_PIECE',
    run: (ctx) => {
      const piece = anyBoardPiece(ctx, ctx.target.pieceId);
      const node = (piece.state as { node: NodeId }).node;
      const hit = onBoard(ctx.state).filter((p) => p.state.kind === 'ON_BOARD' && p.state.node === node);
      return { state: sendHome(ctx.state, hit.map((p) => p.id)), detail: `같은 칸의 말 ${hit.length}개 귀환` };
    },
  },
  'C-G6': {
    limit: 1,
    when: 'TURN',
    target: 'NONE',
    run: ({ state }) => {
      const hit = state.players.flatMap((p) => leadPiece(state, p.id) ?? []);
      return { state: sendHome(state, hit.map((p) => p.id)), detail: `각 플레이어 말 1개씩 귀환 (${hit.length}개)` };
    },
  },
  'C-G7': {
    limit: 1,
    when: 'TURN',
    target: 'NONE',
    run: ({ state, random }) => {
      const pool = [...onBoard(state)];
      const chosen: Piece[] = [];
      while (chosen.length < 4 && pool.length > 0) chosen.push(pool.splice(Math.floor(random() * pool.length), 1)[0]!);
      const states = chosen.map((p) => p.state);
      for (let i = states.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [states[i], states[j]] = [states[j]!, states[i]!];
      }
      const pieces = state.pieces.map((p) => {
        const i = chosen.findIndex((c) => c.id === p.id);
        return i < 0 ? p : { ...p, state: states[i]! };
      });
      return { state: { ...state, pieces }, detail: `판 위 말 ${chosen.length}개 위치 뒤섞기` };
    },
  },
  'C-G8': {
    limit: 1,
    when: 'TURN',
    target: 'OWN_PIECE',
    run: (ctx) => {
      const mine = ownPiece(ctx, ctx.target.pieceId, false);
      let next = shift(ctx, ctx.state, mine, 5);
      const enemy = pick(onBoard(next).filter((p) => p.owner !== ctx.playerId), ctx.random);
      if (enemy) next = shift(ctx, next, enemy, 5);
      return { state: next, detail: enemy ? '내 말과 무작위 상대 말 5칸 전진' : '내 말 5칸 전진' };
    },
  },
  'C-G9': {
    limit: 1,
    when: 'TURN',
    target: 'NONE',
    blocked: (state) => {
      const first = leaderOf(state);
      const last = lastPlaceOf(state);
      if (!first || !last || first === last) return '바꿀 대상이 없어요';
      return leadPiece(state, first) && leadPiece(state, last) ? null : '판 위에 말이 없는 플레이어가 있어요';
    },
    run: ({ state }) => {
      const a = leadPiece(state, leaderOf(state)!)!;
      const b = leadPiece(state, lastPlaceOf(state)!)!;
      return { state: swapPlaces(state, a, b), detail: '1위와 꼴찌의 선두 말 위치 교환' };
    },
  },
  'C-G10': {
    limit: 1,
    when: 'TURN',
    target: 'OPPONENT',
    run: (ctx) => {
      const target = opponent(ctx);
      return { state: updateStatus(ctx.state, target.id, (s) => ({ skipTurns: s.skipTurns + 1 })), detail: '상대 다음 턴 정지' };
    },
  },
  'C-G11': {
    limit: 1,
    when: 'TURN',
    target: 'ENEMY_PIECE',
    run: (ctx) => {
      const piece = enemyPiece(ctx, ctx.target.pieceId);
      const until = playerOf(ctx.state, piece.owner).regularTurnsCompleted + 2;
      const bombs = [...ctx.state.field.bombs, { pieceId: piece.id, owner: piece.owner, until }];
      return { state: { ...ctx.state, field: { ...ctx.state.field, bombs } }, detail: '상대 말에 폭탄 (2턴 뒤 귀환)' };
    },
  },
  'C-G12': {
    limit: 1,
    when: 'TURN',
    target: 'OWN_AND_ENEMY',
    run: (ctx) => {
      const mine = ownPiece(ctx, ctx.target.pieceId, true);
      const theirs = enemyPiece(ctx, ctx.target.otherPieceId);
      const until = playerOf(ctx.state, ctx.playerId).regularTurnsCompleted + 2;
      const links = [...ctx.state.field.links, { a: mine.id, b: theirs.id, owner: ctx.playerId, until }];
      return { state: { ...ctx.state, field: { ...ctx.state.field, links } }, detail: '내 말과 상대 말 연결 (2턴)' };
    },
  },
  'C-G13': {
    limit: 1,
    when: 'TURN',
    target: 'OWN_PIECE',
    run: (ctx) => {
      const piece = ownPiece(ctx, ctx.target.pieceId, false);
      return { state: putAt(ctx, ctx.state, piece, { node: HOME, prev: 19 }), detail: '골인 직전 칸으로 도약' };
    },
  },
  'O-P2': {
    limit: 1,
    when: 'TURN',
    target: 'OWN_BOARD_PIECE',
    run: (ctx) => {
      const piece = ownPiece(ctx, ctx.target.pieceId, true);
      const clone: Piece = { id: `${ctx.playerId}-clone`, owner: ctx.playerId, state: piece.state, clone: true };
      return { state: { ...ctx.state, pieces: [...ctx.state.pieces, clone] }, detail: '분신 생성' };
    },
  },
  'O-P4': blast,
  'A-P5': blast,
  'O-P5': {
    limit: 1,
    when: 'START',
    target: 'NONE',
    blocked: (state, playerId) => {
      const previous = state.field.previousTurn;
      return previous && previous.playerId !== playerId ? null : '되돌릴 상대 턴이 없어요';
    },
    run: ({ state }) => ({ state: { ...state, pieces: state.field.previousTurn!.pieces }, detail: '직전 상대 턴 되돌리기' }),
  },
  'O-P6': {
    limit: 1,
    when: 'TURN',
    target: 'NONE',
    run: ({ state, playerId }) => ({ state: updateStatus(state, playerId, () => ({ extraTurn: true })), detail: '이번 턴 뒤 한 번 더' }),
  },
  'A-P4': {
    limit: 1,
    when: 'TURN',
    target: 'NONE',
    blocked: (state, playerId) => {
      const leader = leaderOf(state);
      if (!leader || leader === playerId) return '내가 1위라 쓸 수 없어요';
      return leadPiece(state, leader) && trailPiece(state, playerId) ? null : '바꿀 말이 없어요';
    },
    run: ({ state, playerId }) => {
      const theirs = leadPiece(state, leaderOf(state)!)!;
      const mine = trailPiece(state, playerId)!;
      return { state: swapPlaces(state, mine, theirs), detail: '1위의 선두 말과 내 꼴찌 말 위치 교환' };
    },
  },
  'A-P6': {
    limit: 1,
    when: 'TURN',
    target: 'NONE',
    run: ({ state, playerId }) => ({
      state: updateStatus(state, playerId, (s) => ({ turn: { ...s.turn, endlessMarch: true } })),
      detail: '이번 턴 골인마다 추가 던지기',
    }),
  },
  'A-P7': {
    limit: 2,
    when: 'PENDING',
    target: 'NONE',
    run: ({ state }) => {
      const result = latestPending(state);
      return { state: { ...state, pendingResults: [...state.pendingResults, result] }, detail: `${RESULT_NAME[result]} 복제` };
    },
  },
  'A-P8': {
    limit: 1,
    when: 'TURN',
    target: 'ENEMY_PIECE',
    blocked: (state, playerId) => (finishedCount(state, playerId) >= 2 ? null : '말 2개 이상 골인해야 쓸 수 있어요'),
    run: (ctx) => {
      const piece = enemyPiece(ctx, ctx.target.pieceId);
      return { state: sendHome(ctx.state, [piece.id]), detail: '상대 말 1개 귀환' };
    },
  },
  'C-P1': {
    limit: 1,
    when: 'TURN',
    target: 'NONE',
    run: ({ state }) => ({ state: sendHome(state, onBoard(state).map((p) => p.id)), detail: '판 위 모든 말 출발점으로' }),
  },
  'C-P3': {
    limit: 1,
    when: 'TURN',
    target: 'OWN_PIECE',
    run: (ctx) => {
      const piece = ownPiece(ctx, ctx.target.pieceId, false);
      let next = finishPieces(ctx.state, [piece.id]).state;
      for (const other of opponents(next, ctx.playerId)) {
        next = updateStatus(next, other.id, (s) => ({ bonusThrows: s.bonusThrows + 1 }));
      }
      return { state: next, detail: '말 1개 즉시 골인 · 다른 플레이어 추가 던지기 1회' };
    },
  },
  'C-P4': {
    limit: 1,
    when: 'TURN',
    target: 'OPPONENT',
    run: (ctx) => {
      const other = opponent(ctx);
      // Swap board places pairwise from the lead piece down; extra pieces of either side stay put.
      const mine = onBoard(ctx.state, ctx.playerId).sort((a, b) => stepsLeft(a) - stepsLeft(b));
      const theirs = onBoard(ctx.state, other.id).sort((a, b) => stepsLeft(a) - stepsLeft(b));
      let next = ctx.state;
      for (let i = 0; i < Math.min(mine.length, theirs.length); i++) next = swapPlaces(next, mine[i]!, theirs[i]!);
      return { state: next, detail: `판 위 말 ${Math.min(mine.length, theirs.length)}쌍 자리 교환` };
    },
  },
  'C-P5': {
    limit: 1,
    when: 'TURN',
    target: 'NONE',
    run: ({ state }) => ({
      state: { ...state, field: { ...state.field, reverseUntilRound: round(state) + 1 } },
      detail: '이번 라운드 모든 이동 방향 반대',
    }),
  },
  'C-P6': {
    limit: 1,
    when: 'TURN',
    target: 'NONE',
    run: (ctx) => {
      const roll = Math.floor(ctx.random() * 4);
      const { state, playerId } = ctx;
      if (roll === 0 || roll === 1) {
        const mineSide = roll === 0;
        let next = state;
        const heads = new Map<string, Piece>();
        for (const p of onBoard(state)) {
          if ((p.owner === playerId) !== mineSide) continue;
          heads.set(`${p.owner}:${(p.state as { node: NodeId }).node}`, p);
        }
        for (const head of heads.values()) {
          const now = pieceById(next, head.id);
          if (now?.state.kind === 'ON_BOARD') next = shift(ctx, next, now, 5);
        }
        return { state: next, detail: mineSide ? '내 말 전체 5칸 전진' : '상대 말 전체 5칸 전진' };
      }
      if (roll === 2) {
        const pieces = onBoard(state);
        const states = pieces.map((p) => p.state);
        for (let i = states.length - 1; i > 0; i--) {
          const j = Math.floor(ctx.random() * (i + 1));
          [states[i], states[j]] = [states[j]!, states[i]!];
        }
        const shuffled = state.pieces.map((p) => {
          const i = pieces.findIndex((x) => x.id === p.id);
          return i < 0 ? p : { ...p, state: states[i]! };
        });
        return { state: { ...state, pieces: shuffled }, detail: '판 위 모든 말 위치 섞기' };
      }
      return {
        state: { ...state, players: state.players.map((p) => ({ ...p, status: { ...p.status, bonusThrows: p.status.bonusThrows + 1 } })) },
        detail: '모든 플레이어 다음 차례 추가 던지기',
      };
    },
  },
  'C-P7': {
    limit: 1,
    when: 'TURN',
    target: 'NONE',
    blocked: (state, playerId) => {
      const leader = leaderOf(state);
      if (!leader || leader === playerId) return '내가 1위라 쓸 수 없어요';
      return finishedCount(state, leader) > finishedCount(state, playerId) ? null : '1위보다 골인 수가 적을 때만 쓸 수 있어요';
    },
    run: ({ state, playerId }) => {
      const leader = leaderOf(state)!;
      const gap = finishedCount(state, leader) - finishedCount(state, playerId);
      const unfinished = state.pieces.filter((p) => p.owner === playerId && !p.clone && p.state.kind !== 'FINISHED');
      const mine = [
        ...unfinished.filter((p) => p.state.kind === 'WAITING'),
        ...unfinished.filter((p) => p.state.kind === 'ON_BOARD').sort((a, b) => stepsLeft(b) - stepsLeft(a)),
      ].slice(0, gap);
      const theirs = state.pieces.filter((p) => p.owner === leader && p.state.kind === 'FINISHED').slice(0, gap);
      const next = sendHome(finishPieces(state, mine.map((p) => p.id)).state, theirs.map((p) => p.id));
      return { state: next, detail: `1위와 골인 수 교환 (${gap}개)` };
    },
  },
  'C-P8': {
    limit: 1,
    when: 'TURN',
    target: 'NONE',
    run: (ctx) => {
      let next = sendHome(ctx.state, onBoard(ctx.state).map((p) => p.id));
      for (const player of next.players) {
        const piece = next.pieces.find((p) => p.owner === player.id && p.state.kind === 'WAITING');
        const corner = pick([5, 10, 15], ctx.random) ?? 5;
        if (piece) {
          const spot = cornerSpot(corner);
          next = { ...next, pieces: next.pieces.map((p) => (p.id === piece.id ? { ...p, state: { kind: 'ON_BOARD', ...spot } } : p)) };
        }
      }
      return { state: next, detail: '판 초기화 · 각자 말 1개 꼭짓점 배치' };
    },
  },
};

for (const id of Object.keys(ACTIVES)) ACTIVE_IDS.add(id);

/** C-S7: the latest throw of the player before me. */
function copiedResult(state: GameState, playerId: PlayerId): YutResult | null {
  const before = previousSeat(state, playerId);
  if (!before || before.id === playerId) return null;
  for (let i = state.log.length - 1; i >= 0; i--) {
    const entry = state.log[i];
    if (entry?.kind === 'THROW' && entry.playerId === before.id) return entry.result;
  }
  return null;
}

/** Passives with an effect in the rules. */
const PASSIVES = [
  'O-S1', 'O-S2', 'O-S4', 'O-S5', 'O-S6', 'O-S7', 'O-S8', 'O-S9', 'O-S10', 'O-S11', 'O-S14', 'O-S15',
  'A-S1', 'A-S2', 'A-S3', 'A-S4', 'A-S5', 'A-S6', 'A-S7', 'A-S9', 'A-S10', 'A-S12', 'A-S13', 'A-S14', 'A-S15',
  'C-S9', 'C-S14',
  'O-G1', 'O-G2', 'O-G4', 'O-G5', 'O-G7', 'O-G8', 'O-G10', 'O-G11', 'O-G12',
  'A-G1', 'A-G4', 'A-G5', 'A-G7', 'A-G8', 'A-G13',
  'O-P3', 'O-P7', 'O-P8', 'A-P3',
];
const IMPLEMENTED = new Set([...PASSIVES, ...Object.keys(ACTIVES)]);

/** True when the augment already does something in the game. */
export function isImplemented(augmentId: string): boolean {
  return IMPLEMENTED.has(augmentId);
}

/** True for augments the player presses to use. */
export function isActive(augmentId: string): boolean {
  return augmentId in ACTIVES;
}

export function activeSpec(augmentId: string): ActiveSpec | null {
  const def = ACTIVES[augmentId];
  if (!def) return null;
  return {
    target: def.target,
    ...(def.choices ? { choices: def.choices } : {}),
    ...(PUSH_STEPS[augmentId] ? { steps: PUSH_STEPS[augmentId] } : {}),
  };
}

export type ActiveStatus = 'READY' | 'SPENT' | 'BLOCKED' | 'RESERVED';

/** Uses left for an active augment, or null for augments without uses. */
export function usesLeft(player: Player, augmentId: string): number | null {
  const limit = ACTIVES[augmentId]?.limit;
  return limit === undefined ? null : Math.max(0, limit - (player.augmentUses[augmentId] ?? 0));
}

function timingOk(state: GameState, player: Player, when: When): boolean {
  const mine = state.turn === player.id;
  const playing = state.phase === 'THROW' || state.phase === 'MOVE';
  switch (when) {
    case 'THROW':
      return mine && state.phase === 'THROW' && !player.reserved;
    case 'START':
      return mine && state.phase === 'THROW' && player.status.turn.throws === 0;
    case 'TURN':
      return mine && playing;
    case 'PENDING':
      return mine && playing && state.pendingResults.length > 0;
    case 'RETHROW':
      return rethrowTarget(state, player.id) !== null;
    case 'OFF_TURN':
      return freshEnemyThrow(state, player.id) !== null;
  }
}

/** Whether any piece or node could be picked for this target kind. */
function hasTargets(state: GameState, playerId: PlayerId, kind: TargetKind): boolean {
  const board = onBoard(state);
  const own = board.filter((p) => p.owner === playerId);
  const enemy = board.filter((p) => p.owner !== playerId);
  const waiting = state.pieces.some((p) => p.owner === playerId && p.state.kind === 'WAITING');
  switch (kind) {
    case 'OWN_PIECE':
      return own.length > 0 || waiting;
    case 'OWN_BOARD_PIECE':
      return own.length > 0;
    case 'OWN_STACKED_PIECE':
      return own.some((p) => stackOf(state.pieces, p).length >= 2);
    case 'ENEMY_PIECE':
    case 'ENEMY_DIRECTION':
      return enemy.length > 0;
    case 'ANY_PIECE':
      return board.length > 0;
    case 'OWN_AND_ENEMY':
      return own.length > 0 && enemy.length > 0;
    case 'TWO_OWN':
      return own.length > 0 && own.length + (waiting ? 1 : 0) >= 2;
    default:
      return true;
  }
}

/** Why the active cannot be used right now, or null. */
function blockReason(state: GameState, player: Player, augmentId: string): string | null {
  const def = ACTIVES[augmentId];
  if (!def) return '아직 사용할 수 없는 증강이에요';
  if (!timingOk(state, player, def.when)) {
    if (def.when === 'THROW' && player.reserved && state.turn === player.id) return '이미 예약한 던지기가 있어요';
    return '지금은 사용할 수 없어요';
  }
  if (!hasTargets(state, player.id, def.target)) return '고를 수 있는 대상이 없어요';
  return def.blocked?.(state, player.id) ?? null;
}

export function activeStatus(state: GameState, playerId: PlayerId, augmentId: string): ActiveStatus {
  const player = state.players.find((p) => p.id === playerId);
  const def = ACTIVES[augmentId];
  if (!player || !def || !player.augmentIds.includes(augmentId)) return 'BLOCKED';
  if (player.reserved?.augmentId === augmentId) return 'RESERVED';
  if ((player.augmentUses[augmentId] ?? 0) >= def.limit) return 'SPENT';
  if (state.phase === 'FINISHED' || state.phase === 'AUGMENT_PICK') return 'BLOCKED';
  return blockReason(state, player, augmentId) ? 'BLOCKED' : 'READY';
}

/** Use an active augment. The server checks ownership, timing, uses left and the target. */
export function useAugment(
  state: GameState,
  playerId: PlayerId,
  augmentId: string,
  target: AugmentTarget = {},
  random: () => number = Math.random,
): GameState {
  const player = playerOf(state, playerId);
  if (!player.augmentIds.includes(augmentId)) throw new RuleError('가지고 있지 않은 증강이에요');
  const def = ACTIVES[augmentId];
  if (!def) throw new RuleError('아직 사용할 수 없는 증강이에요');
  const status = activeStatus(state, playerId, augmentId);
  if (status === 'SPENT') throw new RuleError('남은 사용 횟수가 없어요');
  if (status === 'RESERVED') throw new RuleError('이미 다음 던지기에 예약했어요');
  if (status === 'BLOCKED') throw new RuleError(blockReason(state, player, augmentId) ?? '지금은 사용할 수 없어요');

  const { state: done, detail } = def.run({ state, playerId, augmentId, target, random });
  const next = updatePlayer(done, playerId, (p) => ({
    ...p,
    augmentUses: { ...p.augmentUses, [augmentId]: (p.augmentUses[augmentId] ?? 0) + 1 },
  }));
  const discarded = def === rethrow ? rethrowTarget(state, playerId) : null;
  return {
    ...next,
    log: [
      ...next.log,
      { kind: 'USE', playerId, augmentId, auto: false, detail, ...(discarded ? { discarded } : {}) },
    ],
  };
}
