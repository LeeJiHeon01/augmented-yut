import {
  CORNERS,
  HOME,
  stepBack,
  stepForward,
  stepsBack,
  type Landing,
  type NodeId,
  type ShortcutMode,
  type Spot,
} from './board';
import {
  finishedCount,
  logEffect,
  playerOf,
  ready,
  retireIfSpent,
  spendUse,
  updatePlayer,
  updateStatus,
} from './effects';
import { RuleError, type GameState, type MoveBonus, type Piece, type PlayerId } from './game';
import { stackOf, type Move } from './moves';
import { stepsLeft } from './standings';
import { YUT_STEPS, type YutResult } from './yut';

/** O-S15: nodes after the last corner on the way home. */
const LAST_STRETCH = new Set<NodeId>([16, 17, 18, 19, 27, 28, HOME]);
/** O-G10: the first three spaces after the start. */
const START_ZONE = new Set<NodeId>([1, 2, 3]);
/** A-S9: first nodes of the two corner shortcuts. */
const SHORTCUT_ENTRY = new Set<NodeId>([20, 25]);

export function spotOf(piece: Piece): Spot | null {
  return piece.state.kind === 'ON_BOARD' ? { node: piece.state.node, prev: piece.state.prev } : null;
}

export function pieceById(state: GameState, pieceId: string | undefined): Piece | undefined {
  return state.pieces.find((p) => p.id === pieceId);
}

/** True while `a` and `b` are on the same temporary team. */
export function allied(state: GameState, a: PlayerId, b: PlayerId): boolean {
  const alliance = state.field.alliance;
  if (!alliance || a === b) return false;
  const now =
    alliance.clock === 'ROUND'
      ? Math.min(...state.players.map((p) => p.regularTurnsCompleted))
      : (state.players.find((p) => p.id === alliance.clock)?.regularTurnsCompleted ?? Infinity);
  return now < alliance.until && alliance.pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** True while a lasting chaos event (E3, E4, E7) is running. */
export function chaosOn(state: GameState, eventId: string): boolean {
  const now = Math.min(...state.players.map((p) => p.regularTurnsCompleted));
  return state.field.chaosActive.some((e) => e.eventId === eventId && now < e.untilRound);
}

/** Extra throw for a thrown result: Yut and Mo, unless E7 blocks it. */
export function extraFor(state: GameState, result: YutResult): boolean {
  return (result === 'YUT' || result === 'MO') && !chaosOn(state, 'E7');
}

/** Shortcut rule for a piece owner: E4 opens every corner for everyone, O-S7 turns while it has uses. */
export function shortcutMode(state: GameState, owner: PlayerId): ShortcutMode {
  return chaosOn(state, 'E4') || ready(state, owner, 'O-S7') ? 'ALWAYS' : 'NORMAL';
}

/** Results a thrown result may be used as; the first entry is the result itself. */
export function resultChoices(state: GameState, playerId: PlayerId, result: YutResult): YutResult[] {
  const choices = [result];
  if (result === 'BACKDO' && (ready(state, playerId, 'O-S1') || ready(state, playerId, 'A-S14'))) choices.push('DO');
  if (result === 'DO' && ready(state, playerId, 'O-S9')) choices.push('GAE');
  return choices;
}

export interface MovePlan {
  piece: Piece;
  movers: Piece[];
  /** Result actually used after conversions. */
  used: YutResult;
  backward: boolean;
  /** Nodes passed, ending on the landing node (HOME when finishing). */
  route: NodeId[];
  landing: Landing;
  bonuses: MoveBonus[];
  /** Status the move spends; `passives` lose one use each when the move is made. */
  spends: { moveBonus: boolean; lonely: boolean; enemy: boolean; passives: string[] };
}

function isFrozen(state: GameState, piece: Piece): boolean {
  const owner = state.players.find((p) => p.id === piece.owner);
  return state.field.frozen.some((f) => f.pieceId === piece.id && f.turn === owner?.regularTurnsCompleted);
}

function routeForward(from: Spot | null, steps: number, mode: ShortcutMode): { route: NodeId[]; landing: Landing } {
  const route: NodeId[] = [];
  for (let k = 1; k <= steps; k++) {
    const landing = stepForward(from, k, mode);
    if (landing === 'FINISHED') {
      if (route.at(-1) !== HOME) route.push(HOME);
      return { route, landing: 'FINISHED' };
    }
    route.push(landing.node);
  }
  return { route, landing: stepForward(from, steps, mode) };
}

function routeBack(from: Spot, steps: number): { route: NodeId[]; landing: Spot } {
  const route: NodeId[] = [];
  let spot = from;
  for (let k = 0; k < steps; k++) {
    spot = stepBack(spot);
    route.push(spot.node);
  }
  return { route, landing: spot };
}

/** An enemy piece stands one step ahead (A-S6). */
function enemyAhead(state: GameState, spot: Spot, owner: PlayerId, mode: ShortcutMode): boolean {
  const ahead = stepForward(spot, 1, mode);
  if (ahead === 'FINISHED') return false;
  return state.pieces.some((p) => p.owner !== owner && p.state.kind === 'ON_BOARD' && p.state.node === ahead.node);
}

/** Round number used by board-wide reversal (C-P5). */
function round(state: GameState): number {
  return Math.min(...state.players.map((p) => p.regularTurnsCompleted));
}

/** Work out a move with every augment applied, or throw when it is not allowed. */
export function planMove(state: GameState, playerId: PlayerId, move: Move): MovePlan {
  const piece = pieceById(state, move.pieceId);
  if (!piece || piece.state.kind === 'FINISHED') throw new RuleError('움직일 수 없는 말이에요');
  const player = playerOf(state, playerId);
  const enemy = piece.owner !== playerId;
  if (enemy && !(player.status.turn.controlEnemy && piece.state.kind === 'ON_BOARD')) {
    throw new RuleError('내 말이 아니에요');
  }
  const movers = stackOf(state.pieces, piece);
  if (movers.some((p) => isFrozen(state, p))) throw new RuleError('이번 턴에는 움직일 수 없는 말이에요');
  if (move.as && !resultChoices(state, playerId, move.result).includes(move.as)) {
    throw new RuleError('그 결과로는 쓸 수 없어요');
  }

  const spot = spotOf(piece);
  const mode = shortcutMode(state, piece.owner);
  let used = move.as ?? move.result;
  const passives: string[] = [];
  // Using a result as another one spends the augment that allowed it.
  if (move.as === 'DO') passives.push(ready(state, playerId, 'O-S1') ? 'O-S1' : 'A-S14');
  if (move.as === 'GAE') passives.push('O-S9');
  // O-S15: Backdo counts as Do once a piece is past the last corner.
  if (used === 'BACKDO' && !enemy && spot && LAST_STRETCH.has(spot.node) && ready(state, playerId, 'O-S15')) {
    used = 'DO';
    passives.push('O-S15');
  }
  const base = YUT_STEPS[used];
  if (base < 0 && !spot) throw new RuleError('빽도로는 새 말을 낼 수 없어요');

  // E3 / C-P5 reverse every move once: forward results go back, Backdo goes forward one.
  const worldReversed = state.field.reverseUntilRound > round(state) || chaosOn(state, 'E3');
  const reversed =
    base > 0 &&
    ((!enemy && ['DO', 'GAE', 'GEOL'].includes(used) && player.status.reverseUntil > player.regularTurnsCompleted) ||
      worldReversed);
  const spends = { moveBonus: false, lonely: false, enemy, passives };
  const bonuses: MoveBonus[] = [];

  if (base < 0 && worldReversed && spot) {
    const path = routeForward(spot, 1, mode);
    return { piece, movers, used, backward: false, route: path.route, landing: path.landing, bonuses, spends };
  }
  if (base < 0 || reversed) {
    if (!spot) throw new RuleError('대기 말은 뒤로 갈 수 없어요');
    const { route, landing } = routeBack(spot, Math.abs(base));
    return { piece, movers, used, backward: true, route, landing, bonuses, spends };
  }

  if (!enemy) {
    if (!spot && ready(state, playerId, 'O-S2')) bonuses.push({ augmentId: 'O-S2', steps: 1 });
    if (!spot && ready(state, playerId, 'A-S1')) bonuses.push({ augmentId: 'A-S1', steps: 1 });
    if (spot && ready(state, playerId, 'A-S6') && enemyAhead(state, spot, playerId, mode)) {
      bonuses.push({ augmentId: 'A-S6', steps: 1 });
    }
    // O-P7 천리마: a Yut or Mo move goes three spaces further.
    if ((used === 'YUT' || used === 'MO') && ready(state, playerId, 'O-P7')) bonuses.push({ augmentId: 'O-P7', steps: 3 });
    if (ready(state, playerId, 'A-S13') && movers.length === 1 && !player.status.turn.lonelyUsed) {
      bonuses.push({ augmentId: 'A-S13', steps: 1 });
      spends.lonely = true;
    }
    if (player.status.moveBonus !== 0) {
      bonuses.push({ augmentId: '', steps: player.status.moveBonus });
      spends.moveBonus = true;
    }
    if (player.status.turn.bonus !== 0) bonuses.push({ augmentId: 'A-G9', steps: player.status.turn.bonus });
  }
  const total = () => Math.max(1, base + bonuses.reduce((sum, b) => sum + b.steps, 0));
  let path = routeForward(spot, total(), mode);

  if (!enemy) {
    // A-S9: entering a shortcut adds one step.
    if (ready(state, playerId, 'A-S9') && path.route.some((n) => SHORTCUT_ENTRY.has(n))) {
      bonuses.push({ augmentId: 'A-S9', steps: 1 });
      path = routeForward(spot, total(), mode);
    }
    // A-S15: one space short of finishing still finishes.
    if (path.landing !== 'FINISHED' && path.landing.node === HOME && ready(state, playerId, 'A-S15')) {
      bonuses.push({ augmentId: 'A-S15', steps: 1 });
      path = { route: path.route, landing: 'FINISHED' };
    }
    // O-S7 counts only when passing a corner really took a shortcut.
    if (mode === 'ALWAYS' && !chaosOn(state, 'E4')) {
      const plain = routeForward(spot, total(), 'NORMAL');
      if (plain.route.join() !== path.route.join()) passives.push('O-S7');
    }
  }

  // A-G6: enemies cannot pass a blocked node (landing on it is allowed).
  const blocked = state.field.blocks
    .filter((b) => b.owner !== piece.owner && playerOf(state, b.owner).regularTurnsCompleted < b.until)
    .map((b) => b.node);
  if (path.route.slice(0, -1).some((n) => blocked.includes(n))) throw new RuleError('길목이 막혀 있어요');

  return { piece, movers, used, backward: false, route: path.route, landing: path.landing, bonuses, spends };
}

/** Every legal move for the player with augments applied: waiting piece plus one per stack. */
export function movesFor(state: GameState, playerId: PlayerId, results: readonly YutResult[] = state.pendingResults): Move[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];
  const heads: Piece[] = [];
  const firstWaiting = state.pieces.find((p) => p.owner === playerId && p.state.kind === 'WAITING');
  if (firstWaiting) heads.push(firstWaiting);
  const seen = new Set<string>();
  for (const p of state.pieces) {
    if (p.state.kind !== 'ON_BOARD') continue;
    if (p.owner !== playerId && !player.status.turn.controlEnemy) continue;
    const key = `${p.owner}:${p.state.node}`;
    if (seen.has(key)) continue;
    seen.add(key);
    heads.push(p);
  }

  const moves: Move[] = [];
  for (const result of new Set(results)) {
    for (const as of resultChoices(state, playerId, result)) {
      for (const head of heads) {
        const move: Move = as === result ? { pieceId: head.id, result } : { pieceId: head.id, result, as };
        try {
          planMove(state, playerId, move);
          moves.push(move);
        } catch {
          // Not allowed for this piece.
        }
      }
    }
  }
  return moves;
}

function setPieces(state: GameState, change: (p: Piece) => Piece | null): GameState {
  return {
    ...state,
    pieces: state.pieces.flatMap((p) => {
      const next = change(p);
      return next ? [next] : [];
    }),
  };
}

/** Pieces sent home: clones disappear, the rest wait again. */
export function sendHome(state: GameState, ids: readonly string[]): GameState {
  return setPieces(state, (p) => (!ids.includes(p.id) ? p : p.clone ? null : { ...p, state: { kind: 'WAITING' } }));
}

/** Finish pieces. A finishing clone instead finishes one other unfinished piece of its owner. */
export function finishPieces(state: GameState, ids: readonly string[]): { state: GameState; finished: number } {
  let next = setPieces(state, (p) => (ids.includes(p.id) && !p.clone ? { ...p, state: { kind: 'FINISHED' } } : p));
  let finished = ids.filter((id) => !pieceById(state, id)?.clone).length;
  for (const clone of state.pieces.filter((p) => ids.includes(p.id) && p.clone)) {
    next = setPieces(next, (p) => (p.id === clone.id ? null : p));
    const own = next.pieces.filter((p) => p.owner === clone.owner && !p.clone && p.state.kind !== 'FINISHED');
    const stand = own.find((p) => p.state.kind === 'WAITING') ?? own.sort((a, b) => stepsLeft(b) - stepsLeft(a))[0];
    if (stand) {
      next = setPieces(next, (p) => (p.id === stand.id ? { ...p, state: { kind: 'FINISHED' } } : p));
      next = logEffect(next, clone.owner, 'O-P2', '분신 골인 · 말 1개 골인 인정');
      finished++;
    }
  }
  return { state: next, finished };
}

export interface LandingContext {
  /** Who acts (gets capture rewards). */
  actor: PlayerId;
  /** The moving piece (C-S9 sends it back). */
  headId: string;
  /** Normal moves: capture rewards and the victim's on-capture effects. */
  full: boolean;
  /** The victim's capture defences apply (normal and augment-driven moves alike). */
  defend: boolean;
  /** First place before the move (O-G7, A-G1). */
  leader: PlayerId | null;
  random: () => number;
}

export interface LandingOutcome {
  state: GameState;
  captured: number;
  stacked: number;
  extraThrows: number;
}

/** Put pieces on a spot; own pieces there join the stack. */
function place(state: GameState, ids: readonly string[], spot: Spot): GameState {
  const owner = pieceById(state, ids[0])?.owner;
  return setPieces(state, (p) => {
    const there = p.owner === owner && p.state.kind === 'ON_BOARD' && p.state.node === spot.node;
    return ids.includes(p.id) || there ? { ...p, state: { kind: 'ON_BOARD', node: spot.node, prev: spot.prev } } : p;
  });
}

/** Protections of the captured player; returns the pieces that really go home. */
function protect(
  state: GameState,
  victimOwner: PlayerId,
  victims: Piece[],
  node: NodeId,
  random: () => number,
): { state: GameState; victims: Piece[] } {
  const has = (id: string) => ready(state, victimOwner, id);
  const keep = (next: GameState, id: string, detail: string) => ({
    state: logEffect(next, victimOwner, id, detail),
    victims: [] as Piece[],
  });
  if (has('O-S5') && CORNERS.includes(node)) return keep(state, 'O-S5', '꼭짓점에서 잡히지 않음');
  if (has('O-G10') && START_ZONE.has(node)) return keep(state, 'O-G10', '출발 3칸 안에서 잡히지 않음');
  if (has('O-P3') && victims.length >= 3) return keep(state, 'O-P3', '3개 이상 업힌 말은 잡히지 않음');
  if (has('A-G4')) return keep(state, 'A-G4', '잡힘 방어 · 그 자리 유지');
  let next = state;
  // Chance defences spend a use on every try, hit or miss.
  if (has('C-S14')) {
    if (random() < 0.5) return keep(next, 'C-S14', '50% 생존 성공');
    next = logEffect(next, victimOwner, 'C-S14', '50% 생존 실패');
  }
  if (has('A-S2')) {
    if (random() < 0.25) return keep(next, 'A-S2', '잡힘 회피');
    next = logEffect(next, victimOwner, 'A-S2', '잡힘 회피 실패');
  }

  let left = victims;
  // A-P3: pieces caught for the first time survive where they are.
  if (ready(next, victimOwner, 'A-P3')) {
    const saved = left.filter((p) => !next.field.hits[p.id]);
    if (saved.length > 0) {
      next = logEffect(next, victimOwner, 'A-P3', `첫 잡힘 생존 · 말 ${saved.length}개`);
      left = left.filter((p) => !saved.includes(p));
    }
  }
  const stackShield = ready(next, victimOwner, 'A-S5') ? 'A-S5' : ready(next, victimOwner, 'O-G2') ? 'O-G2' : null;
  if (stackShield && left.length >= 2) {
    next = logEffect(next, victimOwner, stackShield, `업힌 말 중 1개만 귀환`);
    left = left.slice(0, 1);
  }
  return { state: next, victims: left };
}

/** Effects on the player whose pieces were captured. */
function onCaptured(state: GameState, victimOwner: PlayerId, victims: Piece[], ctx: LandingContext): GameState {
  const capturer = pieceById(state, ctx.headId)?.owner ?? ctx.actor;
  let next = updateStatus(state, victimOwner, (s) => ({
    capturedBy: s.capturedBy.includes(capturer) ? s.capturedBy : [...s.capturedBy, capturer],
  }));
  const hits = { ...next.field.hits };
  for (const p of victims) hits[p.id] = (hits[p.id] ?? 0) + 1;
  next = { ...next, field: { ...next.field, hits } };
  const has = (id: string) => ready(next, victimOwner, id);

  if (has('A-S12') && victims.some((p) => hits[p.id] === 2)) {
    next = logEffect(updateStatus(next, victimOwner, (s) => ({ moveBonus: s.moveBonus + 2 })), victimOwner, 'A-S12', '다음 이동 +2칸');
  }
  if (has('A-S7')) {
    next = logEffect(updateStatus(next, victimOwner, (s) => ({ moveBonus: s.moveBonus + 1 })), victimOwner, 'A-S7', '다음 이동 +1칸');
  }
  if (has('O-S6')) {
    // Throws once right away, before the capturing player goes on.
    next = { ...next, field: { ...next.field, interruptQueue: [...next.field.interruptQueue, victimOwner] } };
    next = logEffect(next, victimOwner, 'O-S6', '즉시 추가 던지기 1회');
  }
  const avenger = pieceById(next, ctx.headId);
  if (has('C-S9') && avenger?.state.kind === 'ON_BOARD') {
    next = logEffect(sendHome(next, [avenger.id]), victimOwner, 'C-S9', '잡은 상대 말도 귀환');
  }
  if (has('O-G5') || has('A-G13')) {
    const id = has('O-G5') ? 'O-G5' : 'A-G13';
    const turn = playerOf(next, capturer).regularTurnsCompleted + 1;
    const head = pieceById(next, ctx.headId);
    const movers = head?.state.kind === 'ON_BOARD' ? stackOf(next.pieces, head) : [];
    next = { ...next, field: { ...next.field, frozen: [...next.field.frozen, ...movers.map((p) => ({ pieceId: p.id, turn }))] } };
    next = logEffect(next, victimOwner, id, '잡은 말은 다음 턴 이동 불가');
  }
  if (ready(next, capturer, 'A-G7')) {
    next = logEffect(updateStatus(next, victimOwner, (s) => ({ moveBonus: s.moveBonus - 1 })), capturer, 'A-G7', '잡힌 상대 다음 이동 -1칸');
  }
  if (ready(next, capturer, 'O-G11')) next = steal(next, capturer, victimOwner, ctx.random);
  return next;
}

/** O-G11: the captured player loses one use of a random active (nobody gets one back: limits stay hard). */
function steal(state: GameState, capturer: PlayerId, victimOwner: PlayerId, random: () => number): GameState {
  const victim = playerOf(state, victimOwner);
  const theirs = victim.augmentIds.filter((id) => ACTIVE_IDS.has(id));
  const pick = theirs[Math.floor(random() * theirs.length)];
  if (!pick) return state;
  let next = updatePlayer(state, victimOwner, (p) => ({
    ...p,
    augmentUses: { ...p.augmentUses, [pick]: (p.augmentUses[pick] ?? 0) + 1 },
  }));
  next = retireIfSpent(next, victimOwner, pick);
  return logEffect(next, capturer, 'O-G11', '상대 액티브 사용 횟수 1회 강탈');
}

/** Ids of augments used by pressing them (set by actives.ts to avoid an import cycle). */
export const ACTIVE_IDS = new Set<string>();


/** Rewards for the capturing player; `extra` is on top of the normal capture throw. */
function onCapture(state: GameState, victimOwner: PlayerId, count: number, ctx: LandingContext): { state: GameState; extra: number } {
  const me = pieceById(state, ctx.headId)?.owner ?? ctx.actor;
  const has = (id: string) => ready(state, me, id);
  let extra = 0;
  let next = updatePlayer(state, me, (p) => ({
    ...p,
    captures: p.captures + count,
    status: { ...p.status, turn: { ...p.status.turn, captures: p.status.turn.captures + 1 } },
  }));
  if (victimOwner === ctx.leader && has('O-G7')) {
    extra++;
    next = logEffect(next, me, 'O-G7', '1위 말 잡기 · 추가 던지기');
  }
  if (victimOwner === ctx.leader && has('A-G1')) {
    extra++;
    next = logEffect(updateStatus(next, me, (s) => ({ moveBonus: s.moveBonus + 2 })), me, 'A-G1', '추가 던지기 + 다음 이동 2칸');
  }
  if (has('A-S10') && playerOf(state, me).status.capturedBy.includes(victimOwner)) {
    extra++;
    next = logEffect(next, me, 'A-S10', '복수 성공 · 추가 던지기');
  }
  if (has('A-G5')) next = logEffect(updateStatus(next, me, (s) => ({ moveBonus: s.moveBonus + 2 })), me, 'A-G5', '다음 이동 +2칸');
  if (has('O-S11')) next = logEffect(updateStatus(next, me, (s) => ({ bonusRerolls: s.bonusRerolls + 1 })), me, 'O-S11', '증강 리롤 1회 충전');
  if (has('O-G8') && playerOf(next, me).status.turn.captures === 2) {
    const others = next.pieces.filter((p) => p.owner !== me && p.state.kind === 'ON_BOARD');
    const target = others[Math.floor(ctx.random() * others.length)];
    const spot = target && spotOf(target);
    if (target && spot) {
      next = landPieces(next, [target.id], stepsBack(spot, 2), { ...ctx, full: false, defend: true }).state;
      next = logEffect(next, me, 'O-G8', '연쇄 사냥 · 상대 말 2칸 후퇴');
    }
  }
  return { state: next, extra };
}

/** Land pieces on a spot or finish them: own pieces stack, enemy pieces are captured. */
export function landPieces(state: GameState, ids: readonly string[], landing: Landing, ctx: LandingContext): LandingOutcome {
  if (landing === 'FINISHED') {
    const { state: next } = finishPieces(state, ids);
    return { state: next, captured: 0, stacked: 0, extraThrows: 0 };
  }
  const owner = pieceById(state, ids[0])?.owner;
  const stacked = state.pieces.filter(
    (p) => p.owner === owner && !ids.includes(p.id) && p.state.kind === 'ON_BOARD' && p.state.node === landing.node,
  ).length;
  let next = place(state, ids, landing);
  // Allies share the node: no capture, no stack.
  const enemies = next.pieces.filter(
    (p) => p.owner !== owner && p.state.kind === 'ON_BOARD' && p.state.node === landing.node && !allied(next, owner ?? '', p.owner),
  );
  let captured = 0;
  let extraThrows = 0;

  for (const victimOwner of new Set(enemies.map((p) => p.owner))) {
    let victims = enemies.filter((p) => p.owner === victimOwner);
    if (ctx.defend) ({ state: next, victims } = protect(next, victimOwner, victims, landing.node, ctx.random));
    if (victims.length === 0) continue;

    const ids2 = victims.map((p) => p.id);
    if (ctx.defend && ready(next, victimOwner, 'O-S10')) {
      // O-S10: the capture only pushes the pieces three spaces back.
      next = logEffect(place(next, ids2, stepsBack(landing, 3)), victimOwner, 'O-S10', '귀환 대신 3칸 후퇴');
    } else {
      next = sendHome(next, ids2);
    }
    captured += victims.length;
    next = breakLinks(next, ids2);
    if (ctx.full) {
      next = onCaptured(next, victimOwner, victims, ctx);
      const reward = onCapture(next, victimOwner, victims.length, ctx);
      next = reward.state;
      extraThrows += reward.extra;
    }
  }
  // One extra throw per capturing move, plus augment rewards.
  if (ctx.full && captured > 0) extraThrows += 1;
  return { state: next, captured, stacked, extraThrows };
}

/** C-G12: a captured linked piece takes its partner home. */
function breakLinks(state: GameState, captured: readonly string[]): GameState {
  let next = state;
  for (const link of state.field.links) {
    const hit = captured.includes(link.a) ? link.b : captured.includes(link.b) ? link.a : null;
    if (!hit) continue;
    next = { ...next, field: { ...next.field, links: next.field.links.filter((l) => l !== link) } };
    if (pieceById(next, hit)?.state.kind === 'ON_BOARD') next = logEffect(sendHome(next, [hit]), link.owner, 'C-G12', '연결된 말도 함께 귀환');
  }
  return next;
}

export interface PlayResult {
  state: GameState;
  captured: number;
  finished: number;
  stacked: number;
  extraThrows: number;
}

/** Spend what the plan used and record once-per-game or once-per-piece effects. */
function spendPlan(state: GameState, playerId: PlayerId, plan: MovePlan): GameState {
  let next = state;
  if (plan.spends.moveBonus) next = updateStatus(next, playerId, () => ({ moveBonus: 0 }));
  if (plan.spends.lonely) next = updateStatus(next, playerId, (s) => ({ turn: { ...s.turn, lonelyUsed: true } }));
  if (plan.spends.enemy) next = updateStatus(next, playerId, (s) => ({ turn: { ...s.turn, controlEnemy: false } }));
  // Passive step bonuses and choices used by this move each lose one use.
  const passiveBonuses = plan.bonuses.map((b) => b.augmentId).filter((id) => id && id !== 'A-G9');
  for (const id of [...plan.spends.passives, ...passiveBonuses]) next = spendUse(next, playerId, id);
  return next;
}

/** Make a move with every augment applied and log it. Turn bookkeeping stays in turn.ts. */
export function executeMove(state: GameState, playerId: PlayerId, move: Move, random: () => number, leader: PlayerId | null): PlayResult {
  const plan = planMove(state, playerId, move);
  const ids = plan.movers.map((p) => p.id);
  const ctx: LandingContext = { actor: playerId, headId: plan.piece.id, full: !plan.spends.enemy, defend: true, leader, random };
  let next = spendPlan(state, playerId, plan);
  let captured = 0;
  let stacked = 0;
  let extraThrows = 0;
  let finished = 0;

  if (plan.landing === 'FINISHED') {
    ({ state: next, finished } = finishPieces(next, ids));
    if (playerOf(next, playerId).status.turn.endlessMarch && finished > 0) {
      extraThrows += finished;
      next = logEffect(next, playerId, 'A-P6', `골인 ${finished}개 · 추가 던지기 ${finished}회`);
    }
  } else {
    let spot = plan.landing;
    const trap = next.field.traps.find((t) => t.node === spot.node && t.owner !== plan.piece.owner);
    if (trap) {
      spot = stepsBack(spot, 2);
      next = { ...next, field: { ...next.field, traps: next.field.traps.filter((t) => t !== trap) } };
      next = logEffect(next, trap.owner, 'O-S12', '함정 발동 · 상대 말 2칸 후퇴');
    }
    ({ state: next, captured, stacked, extraThrows } = landPieces(next, ids, spot, ctx));
    // O-S8: stacking moves the stack one more space.
    if (stacked > 0 && !plan.spends.enemy && ready(next, playerId, 'O-S8') && pieceById(next, plan.piece.id)?.state.kind === 'ON_BOARD') {
      const stackIds = stackOf(next.pieces, pieceById(next, plan.piece.id)!).map((p) => p.id);
      const extra = stepForward(spot, 1, shortcutMode(next, plan.piece.owner));
      next = logEffect(next, playerId, 'O-S8', '업기 보너스 · 1칸 더 이동');
      if (extra === 'FINISHED') {
        const done = finishPieces(next, stackIds);
        next = done.state;
        finished += done.finished;
      } else {
        const more = landPieces(next, stackIds, extra, ctx);
        next = more.state;
        captured += more.captured;
        extraThrows += more.extraThrows;
      }
    }
  }

  next = passBomb(state, next, ids, plan);
  next = followShadows(next, ids, random);
  next = {
    ...next,
    log: [
      ...next.log,
      {
        kind: 'MOVE',
        playerId,
        pieceId: plan.piece.id,
        result: move.result,
        captured,
        finished,
        stacked,
        auto: false,
        ...(plan.bonuses.length > 0
          ? { bonus: { augmentId: plan.bonuses[0]?.augmentId ?? '', steps: plan.bonuses.reduce((s, b) => s + b.steps, 0) } }
          : {}),
        ...(plan.used !== move.result ? { as: plan.used } : {}),
      },
    ],
  };
  return { state: next, captured, finished, stacked, extraThrows };
}

/**
 * C-G11: a bomb carried past another player's piece, or onto a node where that piece survives,
 * jumps to that piece and keeps its remaining turns.
 */
function passBomb(before: GameState, after: GameState, movedIds: readonly string[], plan: MovePlan): GameState {
  const bomb = after.field.bombs.find((b) => movedIds.includes(b.pieceId));
  if (!bomb) return after;
  const carrier = pieceById(before, bomb.pieceId);
  const others = (state: GameState, node: NodeId) =>
    state.pieces.find((p) => p.owner !== carrier?.owner && p.state.kind === 'ON_BOARD' && p.state.node === node);
  const passed = plan.route.slice(0, -1).map((n) => others(before, n)).find(Boolean);
  const landingNode = plan.landing === 'FINISHED' ? null : plan.landing.node;
  const target = passed ?? (landingNode === null ? undefined : others(after, landingNode));
  if (!target) return after;
  const left = bomb.until - (playerOf(after, bomb.owner).regularTurnsCompleted);
  const until = playerOf(after, target.owner).regularTurnsCompleted + Math.max(1, left);
  const bombs = after.field.bombs.map((b) => (b === bomb ? { pieceId: target.id, owner: target.owner, until } : b));
  return logEffect({ ...after, field: { ...after.field, bombs } }, bomb.owner, 'C-G11', '폭탄이 다른 말로 넘어감');
}

/** A-G11: when a shadowed piece moves, the shadow owner's lead piece steps forward. */
function followShadows(state: GameState, movedIds: readonly string[], random: () => number): GameState {
  let next = state;
  for (const shadow of state.field.shadows) {
    if (!movedIds.includes(shadow.target)) continue;
    const lead = leadPiece(next, shadow.owner);
    const spot = lead && spotOf(lead);
    if (!lead || !spot) continue;
    const landing = stepForward(spot, 1, shortcutMode(next, shadow.owner));
    const ids = stackOf(next.pieces, lead).map((p) => p.id);
    next = landPieces(next, ids, landing, { actor: shadow.owner, headId: lead.id, full: false, defend: true, leader: null, random }).state;
    next = logEffect(next, shadow.owner, 'A-G11', '그림자 추적 · 말 1칸 이동');
  }
  return next;
}

/** The player's on-board piece closest to finishing. */
export function leadPiece(state: GameState, playerId: PlayerId): Piece | undefined {
  return state.pieces
    .filter((p) => p.owner === playerId && p.state.kind === 'ON_BOARD')
    .sort((a, b) => stepsLeft(a) - stepsLeft(b))[0];
}

/** The player's on-board piece furthest from finishing. */
export function trailPiece(state: GameState, playerId: PlayerId): Piece | undefined {
  return state.pieces
    .filter((p) => p.owner === playerId && p.state.kind === 'ON_BOARD')
    .sort((a, b) => stepsLeft(b) - stepsLeft(a))[0];
}

/** True when every real piece of the player has finished. */
export function hasFinishedAll(state: GameState, playerId: PlayerId): boolean {
  return finishedCount(state, playerId) === state.pieces.filter((p) => p.owner === playerId && !p.clone).length;
}
