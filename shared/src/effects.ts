import { RuleError, type GameState, type Player, type PlayerId, type PlayerStatus } from './game';
import { augmentById } from './augment';
import { standings } from './standings';
import { usageLimit } from './usage';
import { throwSticks, type YutResult } from './yut';

/** Result order used by ±1 adjustments. */
export const RESULT_ORDER: readonly YutResult[] = ['BACKDO', 'DO', 'GAE', 'GEOL', 'YUT', 'MO'];

export function playerOf(state: GameState, playerId: PlayerId): Player {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new RuleError('게임에 없는 플레이어예요');
  return player;
}

export function owns(state: GameState, playerId: PlayerId, augmentId: string): boolean {
  return state.players.find((p) => p.id === playerId)?.augmentIds.includes(augmentId) === true;
}

export function updatePlayer(state: GameState, playerId: PlayerId, change: (p: Player) => Player): GameState {
  return { ...state, players: state.players.map((p) => (p.id === playerId ? change(p) : p)) };
}

export function updateStatus(
  state: GameState,
  playerId: PlayerId,
  change: (s: PlayerStatus) => Partial<PlayerStatus>,
): GameState {
  return updatePlayer(state, playerId, (p) => ({ ...p, status: { ...p.status, ...change(p.status) } }));
}

/**
 * Log an augment effect. For a passive this is the moment it took effect, so it also counts one use
 * (actives are counted when they are used).
 */
export function logEffect(state: GameState, playerId: PlayerId, augmentId: string, detail: string): GameState {
  const logged: GameState = { ...state, log: [...state.log, { kind: 'EFFECT', playerId, augmentId, detail, auto: false }] };
  return augmentById(augmentId)?.kind === 'PASSIVE' ? spendUse(logged, playerId, augmentId) : logged;
}

/** The player holds the augment and still has a use of it left. */
export function hasUse(player: Player, augmentId: string): boolean {
  return player.augmentIds.includes(augmentId) && (player.augmentUses[augmentId] ?? 0) < usageLimit(augmentId);
}

/** Same as `hasUse`, looked up by id. */
export function ready(state: GameState, playerId: PlayerId, augmentId: string): boolean {
  const player = state.players.find((p) => p.id === playerId);
  return player !== undefined && hasUse(player, augmentId);
}

/** Count one use of an augment that just took effect; a used-up one leaves the hand. */
export function spendUse(state: GameState, playerId: PlayerId, augmentId: string): GameState {
  const counted = updatePlayer(state, playerId, (p) => ({
    ...p,
    augmentUses: { ...p.augmentUses, [augmentId]: (p.augmentUses[augmentId] ?? 0) + 1 },
  }));
  return retireIfSpent(counted, playerId, augmentId);
}

/** An augment with no uses left leaves the hand (its slot frees up) and is kept in `retired`. */
export function retireIfSpent(state: GameState, playerId: PlayerId, augmentId: string): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || !player.augmentIds.includes(augmentId)) return state;
  if ((player.augmentUses[augmentId] ?? 0) < usageLimit(augmentId) || player.reserved?.augmentId === augmentId) return state;
  return updatePlayer(state, playerId, (p) => ({
    ...p,
    augmentIds: p.augmentIds.filter((id) => id !== augmentId),
    retired: p.retired.includes(augmentId) ? p.retired : [...p.retired, augmentId],
  }));
}

/** Spend a one-shot passive; false when it was already spent. */
export function spendOnce(state: GameState, playerId: PlayerId, augmentId: string): GameState | null {
  const player = playerOf(state, playerId);
  if (player.status.spent.includes(augmentId)) return null;
  return updateStatus(state, playerId, (s) => ({ spent: [...s.spent, augmentId] }));
}

/** First place by the standings (seat order on a tie). */
export function leaderOf(state: GameState): PlayerId | null {
  return standings(state)[0]?.id ?? null;
}

/** Last place by the standings (later seat on a tie). */
export function lastPlaceOf(state: GameState): PlayerId | null {
  return standings(state).at(-1)?.id ?? null;
}

export function finishedCount(state: GameState, playerId: PlayerId): number {
  return state.pieces.filter((p) => p.owner === playerId && !p.clone && p.state.kind === 'FINISHED').length;
}

/** Passive: a thrown result may turn into a better one. */
const THROW_BOOSTS: ReadonlyArray<{ augmentId: string; from: YutResult; to: YutResult; chance: number }> = [
  { augmentId: 'A-S4', from: 'DO', to: 'GEOL', chance: 0.3 },
  { augmentId: 'O-S4', from: 'GAE', to: 'GEOL', chance: 0.5 },
  { augmentId: 'O-G4', from: 'YUT', to: 'MO', chance: 0.3 },
];

/** O-S14: after this many turns without Yut or Mo the next throw may become Yut. */
const DRY_TURNS = 3;
const DRY_CHANCE = 0.3;
/** A-G8: this many Do/Gae throws in a row make the next throw Yut. */
const SMALL_STREAK = 3;

export interface Roll {
  result: YutResult;
  augmentId?: string;
  from?: YutResult;
}

/** Next-throw reservations made by actives. */
function reservedRoll(player: Player, random: () => number): Roll | null {
  const reserved = player.reserved;
  if (!reserved) return null;
  const augmentId = reserved.augmentId;
  if (reserved.result) return { result: reserved.result, augmentId };
  switch (augmentId) {
    case 'O-S13':
      return { result: 'GEOL', augmentId };
    case 'A-G12':
      return { result: random() < 0.5 ? 'MO' : 'BACKDO', augmentId };
    case 'C-S5':
      return { result: random() < 0.5 ? 'DO' : 'MO', augmentId };
    case 'C-S2': {
      // Yut 25% / Mo 20% / Backdo 20%, otherwise a normal throw.
      const roll = random();
      if (roll < 0.25) return { result: 'YUT', augmentId };
      if (roll < 0.45) return { result: 'MO', augmentId };
      if (roll < 0.65) return { result: 'BACKDO', augmentId };
      return { result: throwSticks(random), augmentId };
    }
    default:
      return null;
  }
}

/** Throw for `player`: forced and reserved results first, then streak passives, then boosts. */
export function rollFor(player: Player, random: () => number): Roll {
  if (player.status.forced) return { result: player.status.forced };
  const reserved = reservedRoll(player, random);
  if (reserved) return reserved;
  const owned = (id: string) => hasUse(player, id);
  if (owned('A-G8') && player.status.smallStreak >= SMALL_STREAK) return { result: 'YUT', augmentId: 'A-G8' };

  const thrown = throwSticks(random);
  if (owned('O-S14') && player.status.dryTurns >= DRY_TURNS && thrown !== 'YUT' && thrown !== 'MO') {
    if (random() < DRY_CHANCE) return { result: 'YUT', augmentId: 'O-S14', from: thrown };
  }
  const boost = THROW_BOOSTS.find((b) => b.from === thrown && owned(b.augmentId));
  if (boost && random() < boost.chance) return { result: boost.to, augmentId: boost.augmentId, from: thrown };
  return { result: thrown };
}
