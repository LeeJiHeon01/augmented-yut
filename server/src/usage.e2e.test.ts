import { describe, expect, it } from 'vitest';
import { activate, movePiece, pickAugment, startRoomGame, throwYut, type RoomView } from '@yut/shared';
import { createHub } from './hub';

/** Through the hub, the way the socket handlers call it. */
function setup() {
  const views = new Map<string, RoomView | null>();
  const hub = createHub({
    turnMs: 60_000,
    pickMs: 60_000,
    awayTurnMs: 2_000,
    graceMs: 30_000,
    lobbyGraceMs: 5_000,
    random: () => 0.1,
    newCode: () => '123456',
    onChange: (code, view) => views.set(code, view),
  });
  const code = hub.create('a', '확인하나');
  hub.join('b', code, '확인둘');
  hub.update('a', (room, me) => startRoomGame(room, me, () => 0.1));
  for (const id of ['a', 'b']) {
    hub.update(id, (room, me) => ({ ...room, game: pickAugment(room.game!, me, room.game!.draft!.offers[me]!.cards[0]!) }));
  }
  return { hub, view: () => views.get(code)! };
}

/** Give a player a hand directly (draws are random). */
function give(hub: ReturnType<typeof createHub>, id: string, augmentIds: string[]) {
  hub.update(id, (room) => ({
    ...room,
    game: { ...room.game!, players: room.game!.players.map((p) => (p.id === id ? { ...p, augmentIds, augmentUses: {} } : p)) },
  }));
}

const me = (view: RoomView, id: string) => view.game!.players.find((p) => p.id === id)!;

describe('usage limits through the server hub', () => {
  it('an active (O-S13, 2 uses) counts each use and leaves the hand after the second', () => {
    const { hub, view } = setup();
    give(hub, 'a', ['O-S13']);
    hub.update('a', (r, id) => ({ ...r, game: activate(r.game!, id, 'O-S13') }));
    expect(me(view(), 'a').augmentUses['O-S13']).toBe(1);
    hub.update('a', (r, id) => ({ ...r, game: throwYut(r.game!, id, () => 0.9) }));
    // Next turn of a: b plays, then a uses it again.
    if (view().game!.turn === 'a') hub.update('a', (r, id) => ({ ...r, game: { ...r.game!, phase: 'THROW', throwsRemaining: 1, pendingResults: [] } }));
    hub.update('a', (r) => ({ ...r, game: { ...r.game!, turn: 'a', phase: 'THROW', throwsRemaining: 1, pendingResults: [] } }));
    hub.update('a', (r, id) => ({ ...r, game: activate(r.game!, id, 'O-S13') }));
    hub.update('a', (r, id) => ({ ...r, game: throwYut(r.game!, id, () => 0.9) }));
    expect(me(view(), 'a').augmentIds).toEqual([]);
    expect(me(view(), 'a').retired).toEqual(['O-S13']);
    expect(() => hub.update('a', (r, id) => ({ ...r, game: activate(r.game!, id, 'O-S13') }))).toThrow();
  });

  it('a passive (O-S2, 3 uses) stops after three entries', () => {
    const { hub, view } = setup();
    give(hub, 'a', ['O-S2']);
    const enter = (pieceId: string) => {
      hub.update('a', (r) => ({ ...r, game: { ...r.game!, turn: 'a', phase: 'MOVE', throwsRemaining: 0, pendingResults: ['DO'] } }));
      hub.update('a', (r, id) => ({ ...r, game: movePiece(r.game!, id, { pieceId, result: 'DO' }) }));
      return view().game!.pieces.find((p) => p.id === pieceId)!.state;
    };
    for (let i = 0; i < 3; i++) {
      // Each entry gets the extra space (node 2); move it on so the next one does not stack.
      expect(enter(`a-${i}`)).toMatchObject({ node: 2 });
      hub.update('a', (r) => ({ ...r, game: { ...r.game!, pieces: r.game!.pieces.map((p) => (p.id === `a-${i}` ? { ...p, state: { kind: 'ON_BOARD', node: 12 + i, prev: 11 + i } } : p)) } }));
    }
    expect(enter('a-3')).toMatchObject({ node: 1 });
    expect(me(view(), 'a').retired).toEqual(['O-S2']);
    expect(me(view(), 'a').augmentUses['O-S2']).toBe(3);
  });
});
