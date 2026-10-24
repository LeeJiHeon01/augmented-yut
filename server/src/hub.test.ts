import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pickAugment, startRoomGame, type RoomView } from '@yut/shared';
import { createHub } from './hub';

function setup() {
  const views = new Map<string, RoomView | null>();
  const hub = createHub({
    turnMs: 18_000,
    pickMs: 20_000,
    awayTurnMs: 2_000,
    graceMs: 30_000,
    random: () => 0.1,
    newCode: () => '123456',
    onChange: (code, view) => views.set(code, view),
  });
  return { hub, views };
}

const IDS = ['a', 'b', 'c', 'd'];

/** Starts a four-player game; it opens with the augment draft. */
function startDraft(hub: ReturnType<typeof createHub>) {
  const code = hub.create('a', '달빛선비');
  for (const id of IDS.slice(1)) hub.join(id, code, `손님${id}`);
  hub.update('a', (room, me) => startRoomGame(room, me, () => 0.1));
  return code;
}

function pick(hub: ReturnType<typeof createHub>, id: string) {
  hub.update(id, (room, me) => {
    const card = room.game?.draft?.offers[me]?.cards[0];
    return { ...room, game: room.game && card ? pickAugment(room.game, me, card) : room.game };
  });
}

/** Starts a game and finishes the opening draft. */
function startFullGame(hub: ReturnType<typeof createHub>) {
  const code = startDraft(hub);
  for (const id of IDS) pick(hub, id);
  return code;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createHub', () => {
  it('creates a room and broadcasts its view', () => {
    const { hub, views } = setup();
    const code = hub.create('a', '달빛선비');
    expect(code).toBe('123456');
    expect(views.get(code)).toMatchObject({ code, hostId: 'a', deadline: null });
    expect(hub.roomOf('a')).toBe(code);
  });

  it('rejects joining an unknown room', () => {
    const { hub } = setup();
    expect(() => hub.join('b', '999999', '솔바람')).toThrow('잘못된 방 코드예요');
  });

  it('gives the opening draft 20 seconds and keeps the deadline while players pick', () => {
    const { hub, views } = setup();
    const code = startDraft(hub);
    expect(views.get(code)?.game?.phase).toBe('AUGMENT_PICK');
    const deadline = Date.now() + 20_000;
    expect(views.get(code)?.deadline).toBe(deadline);
    vi.advanceTimersByTime(5_000);
    pick(hub, 'a');
    expect(views.get(code)?.deadline).toBe(deadline);
  });

  it('lists who picked so per-player views can drop the other offers', () => {
    const { hub, views } = setup();
    const code = startDraft(hub);
    expect(views.get(code)?.draftPicked).toEqual([]);
    pick(hub, 'b');
    expect(views.get(code)?.draftPicked).toEqual(['b']);
  });

  it('picks at random for everyone left when the draft times out', () => {
    const { hub, views } = setup();
    const code = startDraft(hub);
    pick(hub, 'a');
    vi.advanceTimersByTime(20_000);
    const game = views.get(code)?.game;
    expect(game?.phase).toBe('THROW');
    expect(game?.players.every((p) => p.augmentIds.length === 1)).toBe(true);
  });

  it('does not wait for a draft that only disconnected players still owe', () => {
    const { hub, views } = setup();
    const code = startDraft(hub);
    for (const id of ['a', 'b', 'c']) pick(hub, id);
    hub.leave('d');
    vi.advanceTimersByTime(2_000);
    expect(views.get(code)?.game?.phase).toBe('THROW');
  });

  it('sets an 18 second deadline once play starts', () => {
    const { hub, views } = setup();
    const code = startFullGame(hub);
    const view = views.get(code);
    expect(view?.game?.phase).toBe('THROW');
    expect(view?.deadline).toBe(Date.now() + 18_000);
    expect(view?.startedAt).toBe(Date.now());
  });

  it('acts automatically when the deadline passes', () => {
    const { hub, views } = setup();
    const code = startFullGame(hub);
    vi.advanceTimersByTime(18_000);
    const view = views.get(code);
    expect(view?.game?.throwCount).toBe(1);
    expect(view?.game?.log.at(-1)).toMatchObject({ kind: 'THROW', auto: true });
    expect(view?.logTimes).toHaveLength(view?.game?.log.length ?? -1);
  });

  it('uses the short timer for a disconnected player', () => {
    const { hub, views } = setup();
    const code = startFullGame(hub);
    hub.leave('a');
    vi.advanceTimersByTime(2_000);
    expect(views.get(code)?.game?.throwCount).toBe(1);
  });

  it('keeps a dropped lobby seat for the grace period, then frees it', () => {
    const { hub, views } = setup();
    const code = hub.create('a', '달빛선비');
    hub.join('b', code, '솔바람');
    hub.disconnect('b');
    expect(views.get(code)?.seats.find((s) => s.id === 'b')?.connected).toBe(false);
    vi.advanceTimersByTime(29_000);
    expect(hub.reconnect('b')).toBe(code);
    expect(views.get(code)?.seats.find((s) => s.id === 'b')?.connected).toBe(true);
    hub.disconnect('b');
    vi.advanceTimersByTime(30_000);
    expect(views.get(code)?.seats.map((s) => s.id)).toEqual(['a']);
    expect(hub.reconnect('b')).toBeUndefined();
  });

  it('lets a player back into a running game at any time', () => {
    const { hub, views } = setup();
    const code = startFullGame(hub);
    hub.disconnect('b');
    vi.advanceTimersByTime(60_000);
    expect(hub.reconnect('b')).toBe(code);
    expect(views.get(code)?.seats.find((s) => s.id === 'b')?.connected).toBe(true);
    expect(views.get(code)?.game?.players.map((p) => p.id)).toEqual(IDS);
  });

  it('closes a game room once everyone has been gone for the grace period', () => {
    const { hub, views } = setup();
    const code = startFullGame(hub);
    for (const id of IDS) hub.disconnect(id);
    expect(views.get(code)).not.toBeNull();
    vi.advanceTimersByTime(30_000);
    expect(views.get(code)).toBeNull();
  });

  it('closes the room when everyone leaves', () => {
    const { hub, views } = setup();
    const code = hub.create('a', '달빛선비');
    hub.leave('a');
    expect(views.get(code)).toBeNull();
    expect(hub.roomOf('a')).toBeUndefined();
  });
});
