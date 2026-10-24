import { AUGMENTS, MIN_PLAYERS_FOR, type AugmentDefinition, type AugmentRarity } from './augment';
import { RuleError, type DraftOffer, type GameState, type PlayerId } from './game';

/** One draft at game start, then one after every full round. */
export const CARDS_PER_OFFER = 3;
/** A hand holds at most this many augments; a full hand may swap one or keep it. */
export const MAX_AUGMENTS = 6;
/** All chaos augments of a rarity share this chance; the rest split what remains. */
const CHAOS_SHARE = 0.05;

/** Silver 40% / Gold 40% / Prism 20%. */
export function rarityFor(roll: number): AugmentRarity {
  if (roll < 0.4) return 'SILVER';
  if (roll < 0.8) return 'GOLD';
  return 'PRISM';
}

/** Weighted draw: chaos augments together get 5%, the others share the rest evenly. */
export function drawAugment(pool: readonly AugmentDefinition[], random: () => number): AugmentDefinition | null {
  const chaos = pool.filter((a) => a.kind === 'CHAOS');
  const normal = pool.filter((a) => a.kind !== 'CHAOS');
  if (pool.length === 0) return null;
  if (chaos.length === 0 || normal.length === 0) return pool[Math.floor(random() * pool.length)] ?? null;

  const roll = random();
  if (roll < CHAOS_SHARE) return chaos[Math.floor((roll / CHAOS_SHARE) * chaos.length)] ?? null;
  return normal[Math.floor(((roll - CHAOS_SHARE) / (1 - CHAOS_SHARE)) * normal.length)] ?? null;
}

function poolFor(rarity: AugmentRarity, excluded: ReadonlySet<string>, players: number): AugmentDefinition[] {
  return AUGMENTS.filter(
    (a) => a.enabled && a.rarity === rarity && !excluded.has(a.id) && players >= (MIN_PLAYERS_FOR[a.id] ?? 0),
  );
}

function finishedCount(state: GameState, playerId: PlayerId): number {
  return state.pieces.filter((p) => p.owner === playerId && p.state.kind === 'FINISHED').length;
}

/** The single player with the fewest finished pieces, or null on a tie. */
function soleLastPlace(state: GameState): PlayerId | null {
  const counts = state.players.map((p) => ({ id: p.id, finished: finishedCount(state, p.id) }));
  const lowest = Math.min(...counts.map((c) => c.finished));
  const last = counts.filter((c) => c.finished === lowest);
  return last.length === 1 ? (last[0]?.id ?? null) : null;
}

/** Pause the game and deal every player three candidates of one rolled rarity. */
export function openDraft(state: GameState, random: () => number): GameState {
  const rarity = rarityFor(random());
  const lastPlace = soleLastPlace(state);
  const offers: Record<PlayerId, DraftOffer> = {};
  for (const player of state.players) {
    const excluded = new Set(player.augmentIds);
    const cards: string[] = [];
    for (let i = 0; i < CARDS_PER_OFFER; i++) {
      const card = drawAugment(poolFor(rarity, excluded, state.players.length), random);
      if (!card) break;
      cards.push(card.id);
      excluded.add(card.id);
    }
    offers[player.id] = {
      cards,
      rerolled: cards.map(() => false),
      // Sole last place gets one; O-S11 captures add their charges.
      freeRerolls: (player.id === lastPlace ? 1 : 0) + player.status.bonusRerolls,
      discarded: [],
      picked: null,
      replace: null,
      passed: false,
      auto: false,
    };
  }
  return {
    ...state,
    phase: 'AUGMENT_PICK',
    draft: { index: state.draftsDone, rarity, offers },
    players: state.players.map((p) => ({ ...p, status: { ...p.status, bonusRerolls: 0 } })),
  };
}

/** Called when a regular turn ends: open the next draft when a full round has just ended. */
export function draftDue(before: GameState, after: GameState): boolean {
  const round = (s: GameState) => Math.min(...s.players.map((p) => p.regularTurnsCompleted));
  const now = round(after);
  // Draft k belongs to round k and needs every earlier draft, starting with the one at game start.
  return now !== round(before) && after.draftsDone === now;
}

/** True once the offer is settled: picked, or passed with a full hand. */
export function offerDone(offer: DraftOffer): boolean {
  return offer.picked !== null || offer.passed;
}

function offerFor(state: GameState, playerId: PlayerId): DraftOffer {
  if (state.phase !== 'AUGMENT_PICK' || !state.draft) throw new RuleError('지금은 증강을 고를 수 없어요');
  const offer = state.draft.offers[playerId];
  if (!offer) throw new RuleError('증강 후보가 없는 플레이어예요');
  if (offerDone(offer)) throw new RuleError('이미 증강을 골랐어요');
  return offer;
}

function withOffer(state: GameState, playerId: PlayerId, offer: DraftOffer): GameState {
  if (!state.draft) return state;
  return { ...state, draft: { ...state.draft, offers: { ...state.draft.offers, [playerId]: offer } } };
}

/** Replace one card. Each card has one reroll; free rerolls work on any card. */
export function rerollAugment(state: GameState, playerId: PlayerId, slot: number, random: () => number): GameState {
  const offer = offerFor(state, playerId);
  const old = offer.cards[slot];
  if (old === undefined || !state.draft) throw new RuleError('없는 증강 카드예요');

  const usesFree = offer.rerolled[slot] === true;
  if (usesFree && offer.freeRerolls < 1) throw new RuleError('이 카드는 이미 리롤했어요');

  const player = state.players.find((p) => p.id === playerId);
  const excluded = new Set([...(player?.augmentIds ?? []), ...offer.cards, ...offer.discarded]);
  const card = drawAugment(poolFor(state.draft.rarity, excluded, state.players.length), random);
  if (!card) throw new RuleError('더 뽑을 증강이 없어요');

  return withOffer(state, playerId, {
    ...offer,
    cards: offer.cards.map((c, i) => (i === slot ? card.id : c)),
    rerolled: offer.rerolled.map((r, i) => (i === slot ? true : r)),
    freeRerolls: offer.freeRerolls - (usesFree ? 1 : 0),
    discarded: [...offer.discarded, old],
  });
}

/** Pick a candidate. With a full hand, `replace` names the augment to give up. */
export function pickAugment(state: GameState, playerId: PlayerId, augmentId: string, replace: string | null = null): GameState {
  const offer = offerFor(state, playerId);
  if (!offer.cards.includes(augmentId)) throw new RuleError('후보에 없는 증강이에요');
  const owned = state.players.find((p) => p.id === playerId)?.augmentIds ?? [];
  const full = owned.length >= MAX_AUGMENTS;
  if (full && !replace) throw new RuleError('교체할 증강을 골라 주세요');
  if (full && replace && !owned.includes(replace)) throw new RuleError('가지고 있지 않은 증강이에요');
  return closeIfDone(withOffer(state, playerId, { ...offer, picked: augmentId, replace: full ? replace : null }));
}

/** Keep a full hand as it is. */
export function passDraft(state: GameState, playerId: PlayerId): GameState {
  const offer = offerFor(state, playerId);
  const owned = state.players.find((p) => p.id === playerId)?.augmentIds ?? [];
  if (owned.length < MAX_AUGMENTS) throw new RuleError('증강이 6개가 되기 전에는 넘길 수 없어요');
  return closeIfDone(withOffer(state, playerId, { ...offer, passed: true }));
}

/** Timeout: pick at random for everyone who has not chosen yet. */
export function autoPick(state: GameState, random: () => number): GameState {
  if (!state.draft) throw new RuleError('지금은 증강을 고를 수 없어요');
  let next = state;
  for (const player of state.players) {
    const offer = next.draft?.offers[player.id];
    if (!offer || offerDone(offer)) continue;
    // A full hand is kept on timeout; otherwise a random candidate is picked.
    if (player.augmentIds.length >= MAX_AUGMENTS) {
      next = withOffer(next, player.id, { ...offer, passed: true, auto: true });
      continue;
    }
    const card = offer.cards[Math.floor(random() * offer.cards.length)] ?? null;
    next = withOffer(next, player.id, { ...offer, picked: card, auto: true });
  }
  return closeIfDone(next);
}

/** Once everyone has picked: grant the augments and resume play. */
function closeIfDone(state: GameState): GameState {
  const { draft } = state;
  if (!draft) return state;
  const offers = state.players.map((p) => ({ id: p.id, offer: draft.offers[p.id] }));
  if (offers.some(({ offer }) => offer && !offerDone(offer) && offer.cards.length > 0)) return state;

  const picks = offers.flatMap(({ id, offer }) =>
    offer?.picked ? [{ id, augmentId: offer.picked, replace: offer.replace, auto: offer.auto }] : [],
  );
  return {
    ...state,
    phase: 'THROW',
    draft: null,
    draftsDone: state.draftsDone + 1,
    players: state.players.map((p) => {
      const pick = picks.find((x) => x.id === p.id);
      if (!pick) return p;
      const { replace } = pick;
      if (!replace) return { ...p, augmentIds: [...p.augmentIds, pick.augmentId] };
      // The swapped-out augment loses its uses and any reservation.
      const augmentUses = { ...p.augmentUses };
      delete augmentUses[replace];
      return {
        ...p,
        augmentIds: [...p.augmentIds.filter((id) => id !== replace), pick.augmentId],
        augmentUses,
        reserved: p.reserved?.augmentId === replace ? null : p.reserved,
      };
    }),
    log: [
      ...state.log,
      ...picks.map(({ id, augmentId, replace, auto }) => ({
        kind: 'AUGMENT' as const,
        playerId: id,
        augmentId,
        auto,
        ...(replace ? { replaced: replace } : {}),
      })),
    ],
  };
}
