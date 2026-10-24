import { describe, expect, it } from 'vitest';
import { openDraft, pickAugment } from './draft';
import type { RoomView } from './events';
import { createRoom, joinRoom, startRoomGame } from './room';
import { viewFor } from './view';

function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

function draftView(): RoomView {
  let room = createRoom('123456', { id: 'a', name: 'AA' });
  room = joinRoom(room, { id: 'b', name: 'BB' });
  room = joinRoom(room, { id: 'c', name: 'CC' });
  room = startRoomGame(room, 'a', seq(0.1, 0.3, 0.5, 0.7, 0.9));
  return { ...room, deadline: 1, serverNow: 0, startedAt: 0, finishedAt: null, logTimes: [], draftPicked: [] };
}

describe('viewFor', () => {
  it('sends a player only their own draft candidates', () => {
    const full = draftView();
    const view = viewFor(full, 'b');
    expect(Object.keys(view.game?.draft?.offers ?? {})).toEqual(['b']);
    expect(view.game?.draft?.offers.b).toEqual(full.game?.draft?.offers.b);
    const others = ['a', 'c'].flatMap((id) => full.game?.draft?.offers[id]?.cards ?? []);
    const own = full.game?.draft?.offers.b?.cards ?? [];
    for (const card of others.filter((id) => !own.includes(id))) expect(JSON.stringify(view)).not.toContain(card);
  });

  it('tells who already picked without telling what', () => {
    const full = draftView();
    const game = full.game!;
    const aPick = game.draft!.offers.a!.cards[0]!;
    const picked = { ...full, game: pickAugment(game, 'a', aPick) };
    const view = viewFor(picked, 'b');
    expect(view.draftPicked).toEqual(['a']);
    expect(view.game?.draft?.offers.a).toBeUndefined();
  });

  it('gives no candidates to someone outside the game', () => {
    const view = viewFor(draftView(), 'stranger');
    expect(view.game?.draft?.offers).toEqual({});
    expect(view.draftPicked).toEqual([]);
  });

  it('leaves views without a draft untouched', () => {
    const full = draftView();
    const lobby = { ...full, game: null };
    expect(viewFor(lobby, 'a')).toEqual(lobby);
    const noDraft = { ...full, game: { ...full.game!, draft: null, phase: 'THROW' as const } };
    expect(viewFor(noDraft, 'a').game).toBe(noDraft.game);
  });

  it('reopened drafts stay hidden too', () => {
    const full = draftView();
    const again = { ...full, game: openDraft({ ...full.game!, draft: null }, seq(0.2, 0.4, 0.6)) };
    expect(Object.keys(viewFor(again, 'c').game?.draft?.offers ?? {})).toEqual(['c']);
  });
});
