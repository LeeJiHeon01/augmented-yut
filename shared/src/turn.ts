import { useAugment, type AugmentTarget } from './actives';
import { chaosDue, runChaos } from './chaos';
import { autoPick, draftDue, openDraft } from './draft';
import { lastPlaceOf, leaderOf, logEffect, owns, playerOf, rollFor, updateStatus, type Roll } from './effects';
import {
  newFieldState,
  newPlayerStatus,
  newTurnStatus,
  PIECES_PER_PLAYER,
  RuleError,
  type GameState,
  type Piece,
  type PlayerId,
} from './game';
import type { Move } from './moves';
import { executeMove, extraFor, hasFinishedAll, movesFor, sendHome } from './play';
import { grantsExtraThrow, throwSticks, YUT_STEPS, type YutResult } from './yut';

export { standings, stepsLeft } from './standings';

export function startGame(
  roomId: string,
  players: ReadonlyArray<{ id: PlayerId; name: string }>,
): GameState {
  const pieces: Piece[] = players.flatMap(({ id }) =>
    Array.from({ length: PIECES_PER_PLAYER }, (_, i) => ({
      id: `${id}-${i}`,
      owner: id,
      state: { kind: 'WAITING' } as const,
    })),
  );
  return {
    roomId,
    phase: 'THROW',
    players: players.map(({ id, name }) => ({
      id,
      name,
      augmentIds: [],
      regularTurnsCompleted: 0,
      captures: 0,
      augmentUses: {},
      reserved: null,
      status: newPlayerStatus(),
    })),
    pieces,
    turn: players[0]?.id ?? null,
    throwsRemaining: 1,
    pendingResults: [],
    winner: null,
    throwCount: 0,
    log: [],
    draft: null,
    draftsDone: 0,
    chaosDone: 0,
    lastChaos: null,
    field: newFieldState(pieces),
  };
}

function assertTurn(state: GameState, playerId: PlayerId): void {
  if (state.phase === 'FINISHED') throw new RuleError('게임이 끝났어요');
  if (state.turn !== playerId) throw new RuleError('내 차례가 아니에요');
}

export function throwYut(state: GameState, playerId: PlayerId, random: () => number = Math.random): GameState {
  assertTurn(state, playerId);
  if (state.phase !== 'THROW') throw new RuleError('지금은 윷을 던질 수 없어요');
  const player = playerOf(state, playerId);

  // O-P8: the first throw of each turn is thrown twice and the player keeps one.
  if (owns(state, playerId, 'O-P8') && player.status.turn.throws === 0 && !player.status.forced && !player.reserved) {
    return { ...state, phase: 'CHOOSE', field: { ...state.field, choice: [throwSticks(random), throwSticks(random)] } };
  }
  // C-S4: throw for me and a random opponent, then swap the results.
  if (!player.status.forced && player.reserved?.augmentId === 'C-S4') {
    const others = state.players.filter((p) => p.id !== playerId);
    const other = others[Math.floor(random() * others.length)];
    const mine = throwSticks(random);
    const theirs = throwSticks(random);
    const swapped = other ? updateStatus(state, other.id, () => ({ forced: mine })) : state;
    return acceptThrow(swapped, playerId, { result: other ? theirs : mine, augmentId: 'C-S4' }, random);
  }
  return acceptThrow(state, playerId, rollFor(player, random), random);
}

/** O-P8: keep one of the two thrown results. */
export function chooseThrow(state: GameState, playerId: PlayerId, index: number, random: () => number = Math.random): GameState {
  assertTurn(state, playerId);
  const result = state.phase === 'CHOOSE' ? state.field.choice?.[index] : undefined;
  if (!result) throw new RuleError('고를 수 있는 결과가 아니에요');
  const cleared = { ...state, field: { ...state.field, choice: null } };
  return acceptThrow(cleared, playerId, { result, augmentId: 'O-P8' }, random);
}

/** Record a thrown result and the status it changes. */
function acceptThrow(state: GameState, playerId: PlayerId, roll: Roll, random: () => number): GameState {
  const player = playerOf(state, playerId);
  const { result } = roll;
  const lastThrow = [...state.log].reverse().find((e) => e.kind === 'THROW' && e.playerId === playerId);
  const fromYutOrMo = player.status.turn.throws > 0 && lastThrow?.kind === 'THROW' && grantsExtraThrow(lastThrow.result);

  let bonus = 0;
  const effects: { augmentId: string; detail: string }[] = [];
  if (fromYutOrMo && owns(state, playerId, 'O-G12')) {
    bonus++;
    effects.push({ augmentId: 'O-G12', detail: '추가 던지기 결과 +1칸' });
  }
  if (player.status.turn.throws === 0 && state.players.length > 1 && lastPlaceOf(state) === playerId && owns(state, playerId, 'A-S3')) {
    bonus++;
    effects.push({ augmentId: 'A-S3', detail: '꼴찌 첫 던지기 +1칸' });
  }

  const usedForced = player.status.forced !== null;
  const usedReserve = !usedForced && player.reserved !== null;
  const small = result === 'DO' || result === 'GAE';
  let next: GameState = {
    ...state,
    players: state.players.map((p) =>
      p.id !== playerId
        ? p
        : {
            ...p,
            reserved: usedReserve ? null : p.reserved,
            status: {
              ...p.status,
              forced: null,
              moveBonus: p.status.moveBonus + bonus,
              smallStreak: roll.augmentId === 'A-G8' || !small ? 0 : p.status.smallStreak + 1,
              dryTurns: roll.augmentId === 'O-S14' ? 0 : p.status.dryTurns,
              turn: {
                ...p.status.turn,
                throws: p.status.turn.throws + 1,
                yutOrMo: p.status.turn.yutOrMo || grantsExtraThrow(result),
              },
            },
          },
    ),
    // An O-S6 interrupt is exactly one throw.
    throwsRemaining: state.throwsRemaining - 1 + (extraFor(state, result) && !state.field.interrupting ? 1 : 0),
    pendingResults: [...state.pendingResults, result],
    throwCount: state.throwCount + 1,
    log: [...state.log, { kind: 'THROW', playerId, auto: false, ...roll }],
  };
  for (const e of effects) next = logEffect(next, playerId, e.augmentId, e.detail);
  return settle(random, next);
}

/** C-S12: who may pick the current move (the delegate while one is set for this turn). */
export function moverOf(state: GameState): PlayerId | null {
  const d = state.field.delegate;
  return d && d.owner === state.turn ? d.by : state.turn;
}

/** `actor` moves for the turn player: themself, or the delegate picked by C-S12. */
export function movePiece(
  state: GameState,
  actor: PlayerId,
  move: Move,
  random: () => number = Math.random,
): GameState {
  if (state.phase === 'FINISHED') throw new RuleError('게임이 끝났어요');
  const delegated = state.field.delegate?.owner === state.turn;
  if (delegated && actor === state.turn) throw new RuleError('상대가 내 이동을 고르는 중이에요');
  if (moverOf(state) !== actor) throw new RuleError('내 차례가 아니에요');
  const playerId = state.turn!;
  if (state.phase !== 'MOVE') throw new RuleError('지금은 말을 움직일 수 없어요');
  if (state.pendingResults.indexOf(move.result) < 0) throw new RuleError('남은 윷 결과가 아니에요');

  const start = delegated ? { ...state, field: { ...state.field, delegate: null } } : state;
  const outcome = executeMove(start, playerId, move, random, leaderOf(state));
  const index = start.pendingResults.indexOf(move.result);
  const moved: GameState = {
    ...outcome.state,
    pendingResults: start.pendingResults.filter((_, i) => i !== index),
    // O-S6 interrupts are a single throw: their captures add nothing.
    throwsRemaining: start.throwsRemaining + (state.field.interrupting ? 0 : outcome.extraThrows),
  };
  return withWinner(moved, playerId) ?? startInterrupt(moved) ?? settle(random, moved);
}

/** O-S6: hand the turn to the next captured player for one throw; remember where to return. */
function startInterrupt(state: GameState): GameState | null {
  const [next, ...rest] = state.field.interruptQueue;
  if (!next || !state.turn) return null;
  const resume = state.field.resume ?? {
    turn: state.turn,
    throwsRemaining: state.throwsRemaining,
    pendingResults: state.pendingResults,
  };
  return {
    ...state,
    turn: next,
    phase: 'THROW',
    throwsRemaining: 1,
    pendingResults: [],
    field: { ...state.field, interruptQueue: rest, interrupting: next, resume },
  };
}

/** The interrupting player is done: next interrupt, or back to the interrupted turn. */
function endInterrupt(random: () => number, state: GameState): GameState {
  const done = updateStatus(state, state.field.interrupting!, () => ({ turn: newTurnStatus() }));
  const chained = startInterrupt(done);
  if (chained) return chained;
  const resume = state.field.resume!;
  return settle(random, {
    ...done,
    turn: resume.turn,
    throwsRemaining: resume.throwsRemaining,
    pendingResults: resume.pendingResults,
    field: { ...done.field, interrupting: null, resume: null },
  });
}

/** O-G1: split one result into two smaller ones (Geol = Do + Gae). */
export function splitResult(
  state: GameState,
  playerId: PlayerId,
  result: YutResult,
  first: YutResult,
  random: () => number = Math.random,
): GameState {
  assertTurn(state, playerId);
  if (!owns(state, playerId, 'O-G1')) throw new RuleError('분할 이동 증강이 없어요');
  if (state.phase !== 'MOVE' && state.phase !== 'THROW') throw new RuleError('지금은 나눌 수 없어요');
  const index = state.pendingResults.indexOf(result);
  const total = YUT_STEPS[result];
  const a = YUT_STEPS[first];
  const second = RESULT_BY_STEPS[total - a];
  if (index < 0 || a < 1 || !second) throw new RuleError('그렇게는 나눌 수 없어요');
  const pendingResults = [...state.pendingResults.slice(0, index), first, second, ...state.pendingResults.slice(index + 1)];
  const next = logEffect({ ...state, pendingResults }, playerId, 'O-G1', `${RESULT_NAME_SHORT[result]} → ${RESULT_NAME_SHORT[first]}+${RESULT_NAME_SHORT[second]}`);
  return next.phase === 'THROW' ? next : settle(random, next);
}

const RESULT_BY_STEPS: Record<number, YutResult> = { 1: 'DO', 2: 'GAE', 3: 'GEOL', 4: 'YUT' };
const RESULT_NAME_SHORT: Record<YutResult, string> = { BACKDO: '빽도', DO: '도', GAE: '개', GEOL: '걸', YUT: '윷', MO: '모' };

/** Use an active augment, then settle the turn (results or pieces may have changed). */
export function activate(
  state: GameState,
  playerId: PlayerId,
  augmentId: string,
  target: AugmentTarget = {},
  random: () => number = Math.random,
): GameState {
  if (state.phase === 'FINISHED') throw new RuleError('게임이 끝났어요');
  const used = useAugment(state, playerId, augmentId, target, random);
  const won = withWinner(used, playerId);
  if (won) return won;
  return used.phase === 'THROW' || used.phase === 'MOVE' ? settle(random, used) : used;
}

/** Ends the game when someone has finished every piece; the acting player wins a tie. */
function withWinner(state: GameState, actor: PlayerId): GameState | null {
  const order = [actor, ...state.players.map((p) => p.id).filter((id) => id !== actor)];
  const winner = order.find((id) => hasFinishedAll(state, id));
  if (!winner) return null;
  return { ...state, pendingResults: [], throwsRemaining: 0, phase: 'FINISHED', winner };
}

/** Timeout: act for the current player at random, or pick augments for everyone still choosing. */
export function autoAct(state: GameState, random: () => number): GameState {
  if (state.phase === 'AUGMENT_PICK') return autoPick(state, random);
  return markAuto(randomAction(state, random), state.log.length);
}

function randomAction(state: GameState, random: () => number): GameState {
  if (state.turn === null) throw new RuleError('진행 중인 차례가 없어요');
  if (state.phase === 'THROW') return throwYut(state, state.turn, random);
  if (state.phase === 'CHOOSE') return chooseThrow(state, state.turn, Math.floor(random() * 2), random);
  if (state.phase === 'MOVE') {
    const moves = movesFor(state, state.turn);
    const move = moves[Math.floor(random() * moves.length)];
    if (!move) throw new RuleError('움직일 수 있는 말이 없어요');
    return movePiece(state, moverOf(state) ?? state.turn, move, random);
  }
  throw new RuleError('자동으로 진행할 수 없는 단계예요');
}

/** Mark the entry the timed-out action wrote (chaos may log after it). */
function markAuto(state: GameState, index: number): GameState {
  const entry = state.log[index];
  if (!entry) return state;
  return { ...state, log: state.log.map((e, i) => (i === index ? { ...entry, auto: true } : e)) };
}

/** Rounds finished by every player (the minimum of regular turns). */
export function completedRound(state: GameState): number {
  return Math.min(...state.players.map((p) => p.regularTurnsCompleted));
}

/** Choose the next phase, or end the turn when nothing is left to do. */
function settle(random: () => number, state: GameState): GameState {
  if (state.throwsRemaining > 0) return { ...state, phase: 'THROW' };
  if (state.turn !== null && movesFor(state, state.turn).length > 0) return { ...state, phase: 'MOVE' };
  if (state.field.interrupting) return endInterrupt(random, state);
  const next = endTurn(state);
  // Chaos first, then the augment draft of the same round.
  const afterChaos = chaosDue(state, next) ? runChaos(next, random) : next;
  return draftDue(state, next) ? openDraft(afterChaos, random) : afterChaos;
}

/** Unusable results are discarded; the next seat starts its turn (extra turns and skips applied). */
function endTurn(state: GameState): GameState {
  const count = state.players.length;
  const index = state.players.findIndex((p) => p.id === state.turn);
  const current = state.players[index];
  if (!current) return state;
  const counted = !state.field.bonusTurn;
  const again = current.status.extraTurn;

  let players = state.players.map((p, i) =>
    i !== index
      ? p
      : {
          ...p,
          regularTurnsCompleted: p.regularTurnsCompleted + (counted ? 1 : 0),
          status: {
            ...p.status,
            dryTurns: p.status.turn.yutOrMo ? 0 : p.status.dryTurns + 1,
            extraTurn: false,
            turn: newTurnStatus(),
          },
        },
  );
  let next: GameState = { ...state, players };

  let nextIndex = again ? index : (index + 1) % count;
  // C-G10: a stopped player loses a whole turn.
  for (let guard = 0; !again && guard < count; guard++) {
    const p = next.players[nextIndex];
    if (!p || p.status.skipTurns <= 0) break;
    next = updateStatus(next, p.id, (s) => ({ skipTurns: s.skipTurns - 1 }));
    next = {
      ...next,
      players: next.players.map((x) => (x.id === p.id ? { ...x, regularTurnsCompleted: x.regularTurnsCompleted + 1 } : x)),
    };
    next = logEffect(next, p.id, 'C-G10', '시간 정지 · 차례를 건너뜀');
    nextIndex = (nextIndex + 1) % count;
  }
  players = next.players;
  const upcoming = players[nextIndex];
  if (!upcoming) return next;

  next = expireField(next);
  next = updateStatus(next, upcoming.id, () => ({ bonusThrows: 0 }));
  return {
    ...next,
    turn: upcoming.id,
    phase: 'THROW',
    throwsRemaining: 1 + upcoming.status.bonusThrows,
    pendingResults: [],
    field: {
      ...next.field,
      choice: null,
      bonusTurn: again,
      // C-S12 lasts for the owner's next move only; it ends with that turn.
      delegate: next.field.delegate?.owner === current.id ? null : next.field.delegate,
      previousTurn: { playerId: current.id, pieces: state.field.turnStart },
      turnStart: next.pieces,
    },
  };
}

/** Drop finished timed effects; bombs whose time ran out send their piece home. */
function expireField(state: GameState): GameState {
  const done = (owner: PlayerId) => state.players.find((p) => p.id === owner)?.regularTurnsCompleted ?? 0;
  const ownerOf = (pieceId: string) => state.pieces.find((p) => p.id === pieceId)?.owner ?? '';
  let next = state;
  for (const bomb of state.field.bombs.filter((b) => done(b.owner) >= b.until)) {
    if (next.pieces.find((p) => p.id === bomb.pieceId)?.state.kind === 'ON_BOARD') {
      next = logEffect(sendHome(next, [bomb.pieceId]), bomb.owner, 'C-G11', '폭탄 폭발 · 말 귀환');
    }
  }
  const f = next.field;
  const round = Math.min(...next.players.map((p) => p.regularTurnsCompleted));
  return {
    ...next,
    field: {
      ...f,
      chaosActive: f.chaosActive.filter((e) => round < e.untilRound),
      alliance: f.alliance && (f.alliance.clock === 'ROUND' ? round : done(f.alliance.clock)) < f.alliance.until ? f.alliance : null,
      bombs: f.bombs.filter((b) => done(b.owner) < b.until),
      blocks: f.blocks.filter((b) => done(b.owner) < b.until),
      links: f.links.filter((l) => done(l.owner) < l.until),
      shadows: f.shadows.filter((s) => done(ownerOf(s.target)) < s.until),
      frozen: f.frozen.filter((x) => done(ownerOf(x.pieceId)) <= x.turn),
    },
  };
}
