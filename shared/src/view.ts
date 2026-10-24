import type { RoomView } from './events';
import type { PlayerId } from './game';

/** Who already picked in the open draft (not what they picked). */
export function draftPickedOf(view: Pick<RoomView, 'game'>): PlayerId[] {
  const draft = view.game?.draft;
  if (!draft) return [];
  return Object.entries(draft.offers)
    .filter(([, offer]) => offer.picked !== null || offer.passed)
    .map(([id]) => id);
}

/** Strip what only one player may see: other players' draft candidates and picks. */
export function viewFor(view: RoomView, viewerId: PlayerId): RoomView {
  const draft = view.game?.draft;
  if (!view.game || !draft) return view;
  const mine = draft.offers[viewerId];
  return {
    ...view,
    draftPicked: draftPickedOf(view),
    game: { ...view.game, draft: { ...draft, offers: mine ? { [viewerId]: mine } : {} } },
  };
}
