import { spotAt, stepForward } from './board';
import type { GameState, Piece } from './game';
import { standings, stepsLeft } from './standings';

export interface ChaosEvent {
  id: string;
  name: string;
  description: string;
  /** Drawn by the server. Events without an effect yet stay off. */
  enabled: boolean;
  /** Rounds a lasting event stays on; 0 for events that act at once. */
  rounds: number;
  /** Drawn only with at least this many players. */
  minPlayers?: number;
}

/** Automatic chaos events, owned by nobody (spec v3 appendix B). */
export const CHAOS_EVENTS: readonly ChaosEvent[] = [
  { id: 'E1', name: '말 대이동', description: '판 위의 모든 말이 무작위 칸으로 옮겨집니다', enabled: true, rounds: 0 },
  // 4 players: 2:2. 3 players: two allies and one alone. Not drawn with 2 players.
  { id: 'E2', name: '임시 동맹', description: '무작위로 2명씩 동맹, 동맹끼리는 잡지 못합니다', enabled: true, rounds: 1, minPlayers: 3 },
  { id: 'E3', name: '뒤집힌 세계', description: '모든 이동 방향이 반대가 됩니다 (빽도는 앞으로)', enabled: true, rounds: 1 },
  { id: 'E4', name: '황금 지름길', description: '지나가는 꼭짓점에서도 지름길로 들어갑니다', enabled: true, rounds: 1 },
  { id: 'E5', name: '왕의 몰락', description: '1위의 가장 앞선 판 위 말 1개가 출발점으로 돌아갑니다', enabled: true, rounds: 0 },
  { id: 'E6', name: '전원 출동', description: '모든 플레이어의 대기 말 1개가 도만큼 출발합니다', enabled: true, rounds: 0 },
  { id: 'E7', name: '혼돈의 윷', description: '윷·모가 나와도 한 번 더 던지지 못합니다', enabled: true, rounds: 1 },
  { id: 'E8', name: '운명의 자리 교환', description: '서로 다른 플레이어의 말 2쌍이 자리를 바꿉니다', enabled: true, rounds: 0 },
];

/** A chaos event fires each time every player finishes four more regular turns. */
export const CHAOS_EVERY_ROUNDS = 4;

export function chaosEventById(id: string): ChaosEvent | undefined {
  return CHAOS_EVENTS.find((e) => e.id === id);
}

const round = (s: GameState) => Math.min(...s.players.map((p) => p.regularTurnsCompleted));

/** Called when a regular turn ends: true when this turn completed round 4, 8, 12... */
export function chaosDue(before: GameState, after: GameState): boolean {
  const now = round(after);
  if (now === round(before) || now % CHAOS_EVERY_ROUNDS !== 0) return false;
  return after.chaosDone < now / CHAOS_EVERY_ROUNDS;
}

/** Draw an enabled event (not the previous one when another is possible) and apply it. */
export function runChaos(state: GameState, random: () => number): GameState {
  const enabled = CHAOS_EVENTS.filter((e) => e.enabled && state.players.length >= (e.minPlayers ?? 0));
  const fresh = enabled.filter((e) => e.id !== state.lastChaos);
  const pool = fresh.length > 0 ? fresh : enabled;
  const event = pool[Math.floor(random() * pool.length)];
  return event ? applyChaos(state, event.id, random) : state;
}

/** Apply one chaos event. */
export function applyChaos(state: GameState, eventId: string, random: () => number): GameState {
  const event = chaosEventById(eventId);
  if (!event) return state;
  const moved = MOVES[event.id]?.(state, random) ?? [];
  const changed = new Set(moved.map((p) => p.id));
  const now = round(state);
  const lasting = event.rounds > 0 ? [{ eventId: event.id, untilRound: now + event.rounds }] : [];
  const alliance =
    event.id === 'E2'
      ? { source: 'E2' as const, pairs: randomPairs(state.players.map((p) => p.id), random), clock: 'ROUND' as const, until: now + 1 }
      : state.field.alliance;
  return {
    ...state,
    pieces: state.pieces.map((p) => moved.find((m) => m.id === p.id) ?? p),
    chaosDone: state.chaosDone + 1,
    lastChaos: event.id,
    field: { ...state.field, chaosActive: [...state.field.chaosActive, ...lasting], alliance },
    log: [
      ...state.log,
      { kind: 'CHAOS', eventId: event.id, round: round(state), pieceIds: [...changed], auto: false },
    ],
  };
}

/** E5: the leader's most advanced board piece goes back to waiting (one piece, even from a stack). */
function kingsFall(state: GameState): Piece[] {
  const leader = standings(state)[0];
  const onBoard = state.pieces.filter((p) => p.owner === leader?.id && !p.clone && p.state.kind === 'ON_BOARD');
  const target = onBoard.reduce<Piece | null>((best, p) => (!best || stepsLeft(p) < stepsLeft(best) ? p : best), null);
  return target ? [{ ...target, state: { kind: 'WAITING' } }] : [];
}

/** E6: one waiting piece per player enters one space. Nobody is captured; pieces may share the spot. */
function allOut(state: GameState): Piece[] {
  const spot = stepForward(null, 1);
  if (spot === 'FINISHED') return [];
  return state.players.flatMap((player) => {
    const waiting = state.pieces.find((p) => p.owner === player.id && p.state.kind === 'WAITING');
    return waiting ? [{ ...waiting, state: { kind: 'ON_BOARD' as const, node: spot.node, prev: spot.prev } }] : [];
  });
}

/** E1: every board piece lands on a random node. Nobody is captured; pieces may share a node. */
function scatter(state: GameState, random: () => number): Piece[] {
  return state.pieces
    .filter((p) => p.state.kind === 'ON_BOARD')
    .map((p) => ({ ...p, state: { kind: 'ON_BOARD' as const, ...spotAt(Math.floor(random() * NODE_COUNT)) } }));
}

/** E8: up to two pairs of pieces of different players swap places. */
function swapPairs(state: GameState, random: () => number): Piece[] {
  const pool = state.pieces.filter((p) => p.state.kind === 'ON_BOARD');
  const moved: Piece[] = [];
  for (let pair = 0; pair < 2; pair++) {
    const a = pool.splice(Math.floor(random() * pool.length), 1)[0];
    const others = pool.filter((p) => p.owner !== a?.owner);
    const b = others[Math.floor(random() * others.length)];
    if (!a || !b) break;
    pool.splice(pool.indexOf(b), 1);
    moved.push({ ...a, state: b.state }, { ...b, state: a.state });
  }
  return moved;
}

/** Board nodes 0-28. */
const NODE_COUNT = 29;

/** Pieces each event moves; lasting events (E3, E4, E7) move nothing. */
const MOVES: Record<string, (state: GameState, random: () => number) => Piece[]> = {
  E1: scatter,
  E5: (state) => kingsFall(state),
  E6: (state) => allOut(state),
  E8: swapPairs,
};

/** Shuffle players into pairs; with an odd count the last one stays alone. */
export function randomPairs(ids: readonly string[], random: () => number): [string, string][] {
  const pool = [...ids];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < pool.length; i += 2) pairs.push([pool[i]!, pool[i + 1]!]);
  return pairs;
}

