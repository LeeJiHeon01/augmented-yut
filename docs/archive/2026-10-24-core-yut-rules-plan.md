# 기본 윷놀이 규칙 엔진 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 증강 없이 4인 전통 윷놀이 한 판을 끝까지 진행할 수 있는 순수 함수 규칙 엔진을 `shared/`에 만든다.

**Architecture:** 29칸 윷판 그래프(`board.ts`) → 말 이동·업기·잡기·골인(`moves.ts`) → 던지기·추가 던지기·턴 종료·승리·시간 초과 자동 행동(`turn.ts`) 순으로 쌓는다. 모든 함수는 상태를 받아 새 상태를 돌려주고, 난수는 인자로 주입한다. 서버 연결(방·타이머·소켓)은 다음 계획에서 한다.

**Tech Stack:** TypeScript 7, Vitest 5, pnpm workspace (`@yut/shared`는 빌드 없이 TS 소스 공유)

**Spec:** `docs/progress.md` (사용자 확정 사항 2장, 전통 규칙 가정 3장), `docs/augmented_yutnori_claude_spec_v3.md` 2장

## Global Constraints

- 판정은 서버만 한다 — 규칙은 `shared/`의 순수 함수, 난수는 인자로 주입 (`throwSticks(random)` 패턴)
- 코드 주석은 영어, 사용자에게 보이는 에러 메시지는 한국어
- 들여쓰기 스페이스 2칸, 세미콜론 사용, 작은따옴표 (기존 코드 컨벤션)
- UTF-8 / LF / No-BOM
- `console.log` 금지
- 1인당 말 4개, 4개 모두 먼저 골인한 1명이 승리하고 즉시 종료
- 골인: 참먹이(노드 0)에 정확히 도착하면 아직 판 위, 그 너머로 나가야 골인
- 지름길: 모서리(5, 10)나 중앙(22)에 **멈춘 뒤** 출발할 때만 꺾음
- 빽도: 판 위 말이 없으면 쓸 수 없음(버려짐). 대기 말에는 쓸 수 없음
- 잡기: 상대 말(업힌 말 전부)을 대기로 돌려보내고 한 번 더 던짐. 윷·모도 한 번 더 던짐
- 시간 초과는 모두 랜덤 자동 진행 (던지기 → 자동 던지기, 이동 → 합법 이동 중 랜덤)
- `noUncheckedIndexedAccess: true` — 배열·Record 인덱스 접근은 `undefined` 처리 필요 (테스트 파일도 타입 검사 대상)
- **커밋은 사용자가 요청할 때만 한다** (전역 규칙). 각 Task 끝에는 커밋 대신 검증만 한다

## Review Focus

1. 업힌 말이 빽도로 함께 뒤로 가야 한다 → Task 3 테스트 `moves stacked pieces back together on backdo`
2. 참먹이(노드 0)에 서 있는 상대 말도 잡을 수 있어야 한다 → Task 3 테스트 `captures on the home corner`
3. 업혀 있는 상대 말 묶음에 도착하면 묶음 전부를 잡아야 한다 → Task 3 테스트 `captures every piece of an enemy stack`
4. 업힌 말 묶음이 골인하면 묶음 전부가 골인해야 한다 → Task 3 테스트 `finishes the whole stack`
5. 빽도와 다른 결과가 함께 쌓였을 때, 다른 결과로 말을 낸 뒤 빽도를 쓸 수 있어야 한다 → Task 4 테스트 `keeps a backdo usable once a piece enters`

---

## 윷판 노드 번호

```text
 10 ─ 9 ─ 8 ─ 7 ─ 6 ─ 5        5  = 모 (오른쪽 위 모서리)
 │ 25                20 │      10 = 뒷모 (왼쪽 위 모서리)
 11    26        21    4       15 = 찌모 (왼쪽 아래 모서리)
 12        22        3         0  = 참먹이 (오른쪽 아래, 출발·골인)
 13    23        27    2       22 = 방 (중앙)
 14 24                28 1
 15 ─16 ─17 ─18 ─19 ─ 0
```

- 바깥길: 0 → 1 → … → 19 → 0 → 골인
- 모 지름길: 5 → 20 → 21 → 22 → 23 → 24 → 15
- 뒷모 지름길: 10 → 25 → 26 → 22 → 27 → 28 → 0
- 22에 **멈춘** 말은 다음에 27 쪽(골인 방향)으로 간다. 21에서 22를 **지나가는** 말은 23 쪽으로 계속 간다

## File Structure

| 파일 | 역할 |
|---|---|
| Create `shared/src/board.ts` | 노드 그래프, `stepForward`, `stepBack` |
| Create `shared/src/board.test.ts` | 경로·지름길·골인·빽도 테스트 |
| Modify `shared/src/game.ts` | `PieceState`, `Player.regularTurnsCompleted`, `GameState.throwsRemaining`, `RuleError`, `PIECES_PER_PLAYER` |
| Create `shared/src/moves.ts` | `legalMoves`, `applyMove`, `stackOf` (업기·잡기·골인) |
| Create `shared/src/moves.test.ts` | 이동 규칙 테스트 |
| Create `shared/src/turn.ts` | `startGame`, `throwYut`, `movePiece`, `autoAct`, `completedRound` |
| Create `shared/src/turn.test.ts` | 턴 진행 테스트 |
| Modify `shared/src/index.ts` | 새 모듈 export |
| Modify `server/src/rooms.ts`, `server/src/index.ts` | 바뀐 타입에 맞춰 필드만 추가 (동작 변경 없음) |

---

### Task 1: 윷판 그래프

**Files:**
- Create: `shared/src/board.ts`
- Test: `shared/src/board.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `type NodeId = number`
  - `const HOME = 0`, `const CENTER = 22`
  - `interface Spot { node: NodeId; prev: NodeId }` — `prev`는 이 노드 직전에 있던 노드(빽도·중앙 통과 판정용)
  - `type Landing = Spot | 'FINISHED'`
  - `stepForward(from: Spot | null, steps: number): Landing` — `from === null`은 대기 말
  - `stepBack(from: Spot): Spot`

- [ ] **Step 1: Write the failing test**

`shared/src/board.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { stepBack, stepForward } from './board';

describe('stepForward', () => {
  it('enters a waiting piece counting from the home corner', () => {
    expect(stepForward(null, 1)).toEqual({ node: 1, prev: 0 });
    expect(stepForward(null, 5)).toEqual({ node: 5, prev: 4 });
  });

  it('turns into the shortcut only when starting from a corner', () => {
    expect(stepForward({ node: 5, prev: 4 }, 1)).toEqual({ node: 20, prev: 5 });
    expect(stepForward({ node: 4, prev: 3 }, 2)).toEqual({ node: 6, prev: 5 });
    expect(stepForward({ node: 10, prev: 9 }, 3)).toEqual({ node: 22, prev: 26 });
  });

  it('heads to the finish after stopping at the center', () => {
    expect(stepForward({ node: 22, prev: 21 }, 1)).toEqual({ node: 27, prev: 22 });
    expect(stepForward({ node: 22, prev: 26 }, 2)).toEqual({ node: 28, prev: 27 });
  });

  it('keeps going straight when passing the center', () => {
    expect(stepForward({ node: 21, prev: 20 }, 2)).toEqual({ node: 23, prev: 22 });
    expect(stepForward({ node: 26, prev: 25 }, 2)).toEqual({ node: 27, prev: 22 });
  });

  it('rejoins the outer path at the bottom-left corner', () => {
    expect(stepForward({ node: 24, prev: 23 }, 1)).toEqual({ node: 15, prev: 24 });
    expect(stepForward({ node: 24, prev: 23 }, 2)).toEqual({ node: 16, prev: 15 });
  });

  it('stays on the board when landing exactly on the home corner', () => {
    expect(stepForward({ node: 19, prev: 18 }, 1)).toEqual({ node: 0, prev: 19 });
    expect(stepForward({ node: 28, prev: 27 }, 1)).toEqual({ node: 0, prev: 28 });
    expect(stepForward(null, 20)).toEqual({ node: 0, prev: 19 });
  });

  it('finishes when moving past the home corner', () => {
    expect(stepForward({ node: 19, prev: 18 }, 2)).toBe('FINISHED');
    expect(stepForward({ node: 0, prev: 19 }, 1)).toBe('FINISHED');
    expect(stepForward(null, 21)).toBe('FINISHED');
  });

  it('rejects non-positive steps', () => {
    expect(() => stepForward(null, 0)).toThrow(RangeError);
  });
});

describe('stepBack', () => {
  it('returns to the node the piece came from', () => {
    expect(stepBack({ node: 20, prev: 5 })).toEqual({ node: 5, prev: 4 });
    expect(stepBack({ node: 0, prev: 28 })).toEqual({ node: 28, prev: 27 });
  });

  it('moves a piece on the first node back to the home corner', () => {
    expect(stepBack({ node: 1, prev: 0 })).toEqual({ node: 0, prev: 19 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @yut/shared test -- board`
Expected: FAIL — `Failed to resolve import "./board"`

- [ ] **Step 3: Write minimal implementation**

`shared/src/board.ts`:

```ts
/**
 * 29-node yut board.
 * Outer path: 0 -> 1 -> ... -> 19 -> 0 -> finish.
 * Shortcut from corner 5: 5 -> 20 -> 21 -> 22 -> 23 -> 24 -> 15.
 * Shortcut from corner 10: 10 -> 25 -> 26 -> 22 -> 27 -> 28 -> 0.
 */
export type NodeId = number;

/** Start and finish corner (참먹이). */
export const HOME = 0;
/** Board center (방). */
export const CENTER = 22;

/** A piece on the board. `prev` is the node it stood on just before. */
export interface Spot {
  node: NodeId;
  prev: NodeId;
}

export type Landing = Spot | 'FINISHED';

/** Successor while passing through a node. HOME and CENTER are handled in `passNext`. */
const NEXT: Record<NodeId, NodeId> = {
  ...Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i + 1, i + 2])),
  19: HOME,
  20: 21,
  21: CENTER,
  23: 24,
  24: 15,
  25: 26,
  26: CENTER,
  27: 28,
  28: HOME,
};

/** Shortcut taken only when a move starts from this node. */
const TURN_FROM_STOP: Partial<Record<NodeId, NodeId>> = { 5: 20, 10: 25, [CENTER]: 27 };

/** Fallback predecessor used after a backdo, when the real one is unknown. */
const PREV: Record<NodeId, NodeId> = {
  ...Object.fromEntries(Array.from({ length: 19 }, (_, i) => [i + 1, i])),
  [HOME]: 19,
  20: 5,
  21: 20,
  [CENTER]: 21,
  23: CENTER,
  24: 23,
  25: 10,
  26: 25,
  27: CENTER,
  28: 27,
};

function passNext(node: NodeId, prev: NodeId): NodeId | 'FINISHED' {
  if (node === HOME) return 'FINISHED';
  if (node === CENTER) return prev === 21 ? 23 : 27;
  return lookup(NEXT, node);
}

function lookup(table: Record<NodeId, NodeId>, node: NodeId): NodeId {
  const found = table[node];
  if (found === undefined) throw new RangeError(`unknown node ${node}`);
  return found;
}

/** Move forward `steps` nodes. `from === null` means the piece is still waiting. */
export function stepForward(from: Spot | null, steps: number): Landing {
  if (steps < 1) throw new RangeError('steps must be >= 1');

  let node: NodeId;
  let prev: NodeId;
  if (from === null) {
    node = 1;
    prev = HOME;
  } else {
    const first = TURN_FROM_STOP[from.node] ?? passNext(from.node, from.prev);
    if (first === 'FINISHED') return 'FINISHED';
    node = first;
    prev = from.node;
  }

  for (let i = 1; i < steps; i++) {
    const next = passNext(node, prev);
    if (next === 'FINISHED') return 'FINISHED';
    prev = node;
    node = next;
  }
  return { node, prev };
}

/** Backdo: return to the previous node. */
export function stepBack(from: Spot): Spot {
  return { node: from.prev, prev: lookup(PREV, from.prev) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @yut/shared test -- board`
Expected: PASS (10 tests)

- [ ] **Step 5: Verify**

Run: `pnpm --filter @yut/shared typecheck`
Expected: 에러 없음

---

### Task 2: 게임 상태 타입 갱신

**Files:**
- Modify: `shared/src/game.ts` (전체 교체)
- Modify: `server/src/rooms.ts:40-48` (`createRoom`)
- Modify: `server/src/index.ts:29` (`joinRoom` 호출)

**Interfaces:**
- Consumes: Task 1 `NodeId`
- Produces:
  - `type PieceState = { kind: 'WAITING' } | { kind: 'ON_BOARD'; node: NodeId; prev: NodeId } | { kind: 'FINISHED' }`
  - `interface Piece { id: string; owner: PlayerId; state: PieceState }`
  - `interface Player { id; name; augmentIds: string[]; regularTurnsCompleted: number }`
  - `interface GameState { roomId; phase; players; pieces; turn; throwsRemaining: number; pendingResults; winner }`
  - `const PIECES_PER_PLAYER = 4`
  - `class RuleError extends Error` — 규칙 위반. 메시지는 사용자에게 그대로 보여준다

타입만 바꾸는 Task라 새 테스트는 없다. 기존 테스트와 타입 검사로 검증한다.

- [ ] **Step 1: Replace `shared/src/game.ts`**

```ts
import type { NodeId } from './board';
import type { YutResult } from './yut';

export type PlayerId = string;

export const PIECES_PER_PLAYER = 4;

export type PieceState =
  | { kind: 'WAITING' }
  | { kind: 'ON_BOARD'; node: NodeId; prev: NodeId }
  | { kind: 'FINISHED' };

export interface Piece {
  id: string;
  owner: PlayerId;
  state: PieceState;
}

export interface Player {
  id: PlayerId;
  name: string;
  augmentIds: string[];
  /** Regular turns finished. Extra throws and bonus turns never add to this. */
  regularTurnsCompleted: number;
}

export type GamePhase = 'LOBBY' | 'AUGMENT_PICK' | 'THROW' | 'MOVE' | 'FINISHED';

export interface GameState {
  roomId: string;
  phase: GamePhase;
  players: Player[];
  pieces: Piece[];
  turn: PlayerId | null;
  /** Throws left in the current turn (Yut, Mo and captures add one). */
  throwsRemaining: number;
  /** Results thrown but not yet used for a move. */
  pendingResults: YutResult[];
  winner: PlayerId | null;
}

/** A rule violation. The message is shown to the player as-is. */
export class RuleError extends Error {
  override name = 'RuleError';
}
```

- [ ] **Step 2: Update `server/src/rooms.ts` `createRoom`**

```ts
function createRoom(roomId: string): GameState {
  return {
    roomId,
    phase: 'LOBBY',
    players: [],
    pieces: [],
    turn: null,
    throwsRemaining: 1,
    pendingResults: [],
    winner: null,
  };
}
```

- [ ] **Step 3: Update `server/src/index.ts` line 29**

```ts
    const state = joinRoom(id, { id: socket.id, name, augmentIds: [], regularTurnsCompleted: 0 });
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: 타입 에러 없음, 기존 테스트 + Task 1 테스트 PASS

---

### Task 3: 말 이동·업기·잡기·골인

**Files:**
- Create: `shared/src/moves.ts`
- Test: `shared/src/moves.test.ts`

**Interfaces:**
- Consumes: Task 1 `stepForward`, `stepBack`, `Spot`, `Landing`; Task 2 `Piece`, `PieceState`, `PlayerId`, `RuleError`; 기존 `YUT_STEPS`, `YutResult`
- Produces:
  - `interface Move { pieceId: string; result: YutResult }`
  - `interface MoveOutcome { pieces: Piece[]; capturedCount: number; finishedCount: number }`
  - `stackOf(pieces: readonly Piece[], piece: Piece): Piece[]` — 같은 칸의 내 말 묶음
  - `legalMoves(pieces: readonly Piece[], playerId: PlayerId, results: readonly YutResult[]): Move[]` — 결과 종류별, 대기 말 1개 + 판 위 묶음마다 대표 말 1개
  - `applyMove(pieces: readonly Piece[], move: Move): MoveOutcome` — 소유자·남은 결과 검사는 호출자(Task 4) 책임

- [ ] **Step 1: Write the failing test**

`shared/src/moves.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Piece, PieceState } from './game';
import { applyMove, legalMoves } from './moves';

const waiting: PieceState = { kind: 'WAITING' };
const at = (node: number, prev: number): PieceState => ({ kind: 'ON_BOARD', node, prev });
const piece = (id: string, owner: string, state: PieceState = waiting): Piece => ({ id, owner, state });
const stateOf = (pieces: Piece[], id: string) => pieces.find((p) => p.id === id)?.state;

describe('legalMoves', () => {
  it('offers one waiting piece and one piece per board stack', () => {
    const pieces = [
      piece('a1', 'a'),
      piece('a2', 'a'),
      piece('a3', 'a', at(3, 2)),
      piece('a4', 'a', at(3, 2)),
      piece('b1', 'b', at(7, 6)),
    ];
    expect(legalMoves(pieces, 'a', ['GAE'])).toEqual([
      { pieceId: 'a1', result: 'GAE' },
      { pieceId: 'a3', result: 'GAE' },
    ]);
  });

  it('lists each distinct result once', () => {
    const pieces = [piece('a1', 'a')];
    expect(legalMoves(pieces, 'a', ['YUT', 'YUT', 'DO'])).toEqual([
      { pieceId: 'a1', result: 'YUT' },
      { pieceId: 'a1', result: 'DO' },
    ]);
  });

  it('allows backdo only for pieces on the board', () => {
    expect(legalMoves([piece('a1', 'a')], 'a', ['BACKDO'])).toEqual([]);
    expect(legalMoves([piece('a1', 'a', at(2, 1))], 'a', ['BACKDO'])).toEqual([
      { pieceId: 'a1', result: 'BACKDO' },
    ]);
  });
});

describe('applyMove', () => {
  it('enters a waiting piece', () => {
    const out = applyMove([piece('a1', 'a')], { pieceId: 'a1', result: 'GEOL' });
    expect(stateOf(out.pieces, 'a1')).toEqual(at(3, 2));
    expect(out).toMatchObject({ capturedCount: 0, finishedCount: 0 });
  });

  it('stacks onto an own piece and moves the stack together afterwards', () => {
    const first = applyMove([piece('a1', 'a'), piece('a2', 'a', at(2, 1))], { pieceId: 'a1', result: 'GAE' });
    expect(stateOf(first.pieces, 'a1')).toEqual(at(2, 1));
    const second = applyMove(first.pieces, { pieceId: 'a2', result: 'DO' });
    expect(stateOf(second.pieces, 'a1')).toEqual(at(3, 2));
    expect(stateOf(second.pieces, 'a2')).toEqual(at(3, 2));
  });

  it('moves stacked pieces back together on backdo', () => {
    const pieces = [piece('a1', 'a', at(6, 5)), piece('a2', 'a', at(6, 5))];
    const out = applyMove(pieces, { pieceId: 'a1', result: 'BACKDO' });
    expect(stateOf(out.pieces, 'a1')).toEqual(at(5, 4));
    expect(stateOf(out.pieces, 'a2')).toEqual(at(5, 4));
  });

  it('captures an enemy piece on the landing node only', () => {
    const pieces = [piece('a1', 'a', at(1, 0)), piece('b1', 'b', at(2, 1)), piece('b2', 'b', at(3, 2))];
    const out = applyMove(pieces, { pieceId: 'a1', result: 'GAE' });
    expect(stateOf(out.pieces, 'b2')).toEqual(waiting);
    expect(stateOf(out.pieces, 'b1')).toEqual(at(2, 1));
    expect(out.capturedCount).toBe(1);
  });

  it('captures every piece of an enemy stack', () => {
    const pieces = [piece('a1', 'a'), piece('b1', 'b', at(4, 3)), piece('b2', 'b', at(4, 3))];
    const out = applyMove(pieces, { pieceId: 'a1', result: 'YUT' });
    expect(stateOf(out.pieces, 'b1')).toEqual(waiting);
    expect(stateOf(out.pieces, 'b2')).toEqual(waiting);
    expect(out.capturedCount).toBe(2);
  });

  it('captures on the home corner', () => {
    const pieces = [piece('a1', 'a', at(19, 18)), piece('b1', 'b', at(0, 19))];
    const out = applyMove(pieces, { pieceId: 'a1', result: 'DO' });
    expect(stateOf(out.pieces, 'b1')).toEqual(waiting);
    expect(stateOf(out.pieces, 'a1')).toEqual(at(0, 19));
  });

  it('finishes the whole stack', () => {
    const pieces = [piece('a1', 'a', at(19, 18)), piece('a2', 'a', at(19, 18))];
    const out = applyMove(pieces, { pieceId: 'a2', result: 'GAE' });
    expect(stateOf(out.pieces, 'a1')).toEqual({ kind: 'FINISHED' });
    expect(stateOf(out.pieces, 'a2')).toEqual({ kind: 'FINISHED' });
    expect(out.finishedCount).toBe(2);
  });

  it('rejects backdo for a waiting piece and moves for finished pieces', () => {
    expect(() => applyMove([piece('a1', 'a')], { pieceId: 'a1', result: 'BACKDO' })).toThrow('빽도');
    expect(() => applyMove([piece('a1', 'a', { kind: 'FINISHED' })], { pieceId: 'a1', result: 'DO' })).toThrow();
  });

  it('does not mutate the input', () => {
    const pieces = [piece('a1', 'a')];
    applyMove(pieces, { pieceId: 'a1', result: 'DO' });
    expect(pieces[0]?.state).toEqual(waiting);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @yut/shared test -- moves`
Expected: FAIL — `Failed to resolve import "./moves"`

- [ ] **Step 3: Write minimal implementation**

`shared/src/moves.ts`:

```ts
import { stepBack, stepForward, type Landing } from './board';
import { RuleError, type Piece, type PieceState, type PlayerId } from './game';
import { YUT_STEPS, type YutResult } from './yut';

export interface Move {
  pieceId: string;
  result: YutResult;
}

export interface MoveOutcome {
  pieces: Piece[];
  /** Enemy pieces sent back to waiting. */
  capturedCount: number;
  /** Own pieces that finished with this move. */
  finishedCount: number;
}

/** Own pieces sharing the board node with `piece`. They always move together. */
export function stackOf(pieces: readonly Piece[], piece: Piece): Piece[] {
  const { state } = piece;
  if (state.kind !== 'ON_BOARD') return [piece];
  return pieces.filter(
    (p) => p.owner === piece.owner && p.state.kind === 'ON_BOARD' && p.state.node === state.node,
  );
}

/** One candidate per distinct result: a waiting piece plus one piece per board stack. */
export function legalMoves(
  pieces: readonly Piece[],
  playerId: PlayerId,
  results: readonly YutResult[],
): Move[] {
  const own = pieces.filter((p) => p.owner === playerId);
  const firstWaiting = own.find((p) => p.state.kind === 'WAITING');
  const stackHeads: Piece[] = [];
  const seenNodes = new Set<number>();
  for (const p of own) {
    if (p.state.kind !== 'ON_BOARD' || seenNodes.has(p.state.node)) continue;
    seenNodes.add(p.state.node);
    stackHeads.push(p);
  }

  const moves: Move[] = [];
  for (const result of new Set(results)) {
    if (firstWaiting && YUT_STEPS[result] > 0) moves.push({ pieceId: firstWaiting.id, result });
    for (const head of stackHeads) moves.push({ pieceId: head.id, result });
  }
  return moves;
}

function stateAt(landing: Landing): PieceState {
  return landing === 'FINISHED'
    ? { kind: 'FINISHED' }
    : { kind: 'ON_BOARD', node: landing.node, prev: landing.prev };
}

/** Move a piece (with its stack), then stack onto own pieces or capture enemy pieces. */
export function applyMove(pieces: readonly Piece[], move: Move): MoveOutcome {
  const piece = pieces.find((p) => p.id === move.pieceId);
  if (!piece || piece.state.kind === 'FINISHED') throw new RuleError('움직일 수 없는 말이에요');

  const steps = YUT_STEPS[move.result];
  let landing: Landing;
  if (piece.state.kind === 'WAITING') {
    if (steps < 0) throw new RuleError('빽도로는 새 말을 낼 수 없어요');
    landing = stepForward(null, steps);
  } else {
    const spot = { node: piece.state.node, prev: piece.state.prev };
    landing = steps < 0 ? stepBack(spot) : stepForward(spot, steps);
  }

  const movers = new Set(stackOf(pieces, piece).map((p) => p.id));
  const landed = stateAt(landing);
  let capturedCount = 0;

  const next = pieces.map((p): Piece => {
    if (movers.has(p.id)) return { ...p, state: landed };
    if (landing === 'FINISHED' || p.state.kind !== 'ON_BOARD' || p.state.node !== landing.node) return p;
    // Own piece already there joins the stack and shares its route memory.
    if (p.owner === piece.owner) return { ...p, state: landed };
    capturedCount++;
    return { ...p, state: { kind: 'WAITING' } };
  });

  return {
    pieces: next,
    capturedCount,
    finishedCount: landing === 'FINISHED' ? movers.size : 0,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @yut/shared test -- moves`
Expected: PASS (12 tests)

- [ ] **Step 5: Verify**

Run: `pnpm --filter @yut/shared typecheck`
Expected: 에러 없음

---

### Task 4: 턴 진행·승리·시간 초과 자동 행동

**Files:**
- Create: `shared/src/turn.ts`
- Test: `shared/src/turn.test.ts`
- Modify: `shared/src/index.ts`

**Interfaces:**
- Consumes: Task 2 `GameState`, `Player`, `Piece`, `PlayerId`, `RuleError`, `PIECES_PER_PLAYER`; Task 3 `Move`, `applyMove`, `legalMoves`; 기존 `throwSticks`, `grantsExtraThrow`
- Produces (다음 계획의 서버가 사용):
  - `startGame(roomId: string, players: ReadonlyArray<{ id: PlayerId; name: string }>): GameState` — 말 id는 `${playerId}-${0..3}`, 첫 플레이어부터 `THROW`
  - `throwYut(state: GameState, playerId: PlayerId, random?: () => number): GameState`
  - `movePiece(state: GameState, playerId: PlayerId, move: Move): GameState`
  - `autoAct(state: GameState, random: () => number): GameState` — 시간 초과 시 현재 플레이어 대신 랜덤 행동
  - `completedRound(state: GameState): number` — 전원 완료 라운드 = `min(regularTurnsCompleted)`

턴 규칙:
1. 던질 횟수가 남아 있으면 `THROW`. 윷·모는 던질 횟수 +1
2. 다 던지면 쓸 수 있는 결과가 있을 때 `MOVE`. 결과는 아무 순서로 쓴다
3. 잡으면 던질 횟수 +1 → `THROW`로 돌아감(남은 결과는 유지)
4. 던질 것도, 쓸 수 있는 결과도 없으면 턴 종료. 쓸 수 없는 결과(말 없는 빽도)는 버린다
5. 턴 종료 시 그 플레이어 `regularTurnsCompleted +1`, 다음 자리로
6. 말 4개가 모두 골인하면 즉시 `FINISHED`, `winner` 설정, 턴 수 증가 없음

- [ ] **Step 1: Write the failing test**

`shared/src/turn.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { GameState, PieceState } from './game';
import { autoAct, completedRound, movePiece, startGame, throwYut } from './turn';
import type { YutResult } from './yut';

/** Random values that make `throwSticks` produce each result (value < 0.5 = flat side). */
const STICKS: Record<YutResult, number[]> = {
  BACKDO: [0.1, 0.9, 0.9, 0.9],
  DO: [0.9, 0.1, 0.9, 0.9],
  GAE: [0.1, 0.1, 0.9, 0.9],
  GEOL: [0.1, 0.1, 0.1, 0.9],
  YUT: [0.1, 0.1, 0.1, 0.1],
  MO: [0.9, 0.9, 0.9, 0.9],
};

function randomFor(...results: YutResult[]): () => number {
  const values = results.flatMap((r) => STICKS[r]);
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

const PLAYERS = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id }));
const at = (node: number, prev: number): PieceState => ({ kind: 'ON_BOARD', node, prev });

function withPieces(state: GameState, states: Record<string, PieceState>): GameState {
  return {
    ...state,
    pieces: state.pieces.map((p) => {
      const next = states[p.id];
      return next ? { ...p, state: next } : p;
    }),
  };
}

describe('startGame', () => {
  it('gives every player four waiting pieces and starts with the first seat', () => {
    const s = startGame('r1', PLAYERS);
    expect(s.pieces).toHaveLength(16);
    expect(s.pieces.every((p) => p.state.kind === 'WAITING')).toBe(true);
    expect(s).toMatchObject({ phase: 'THROW', turn: 'a', throwsRemaining: 1, pendingResults: [], winner: null });
  });
});

describe('throwYut', () => {
  it('moves to MOVE after a normal throw', () => {
    const s = throwYut(startGame('r1', PLAYERS), 'a', randomFor('GAE'));
    expect(s).toMatchObject({ phase: 'MOVE', throwsRemaining: 0, pendingResults: ['GAE'] });
  });

  it('grants another throw for yut and mo', () => {
    const s = throwYut(startGame('r1', PLAYERS), 'a', randomFor('YUT'));
    expect(s).toMatchObject({ phase: 'THROW', throwsRemaining: 1, pendingResults: ['YUT'] });
  });

  it('rejects a throw out of turn', () => {
    expect(() => throwYut(startGame('r1', PLAYERS), 'b', randomFor('DO'))).toThrow('차례');
  });

  it('ends the turn when a lone backdo cannot be used', () => {
    const s = throwYut(startGame('r1', PLAYERS), 'a', randomFor('BACKDO'));
    expect(s).toMatchObject({ phase: 'THROW', turn: 'b', pendingResults: [] });
    expect(s.players[0]?.regularTurnsCompleted).toBe(1);
  });
});

describe('movePiece', () => {
  it('uses the result and passes the turn', () => {
    const thrown = throwYut(startGame('r1', PLAYERS), 'a', randomFor('GAE'));
    const s = movePiece(thrown, 'a', { pieceId: 'a-0', result: 'GAE' });
    expect(s.pieces.find((p) => p.id === 'a-0')?.state).toEqual(at(2, 1));
    expect(s).toMatchObject({ turn: 'b', phase: 'THROW', throwsRemaining: 1 });
    expect(s.players[0]?.regularTurnsCompleted).toBe(1);
  });

  it('rejects moving an enemy piece or an unthrown result', () => {
    const thrown = throwYut(startGame('r1', PLAYERS), 'a', randomFor('GAE'));
    expect(() => movePiece(thrown, 'a', { pieceId: 'b-0', result: 'GAE' })).toThrow('내 말');
    expect(() => movePiece(thrown, 'a', { pieceId: 'a-0', result: 'MO' })).toThrow('결과');
  });

  it('grants an extra throw after a capture and keeps the turn', () => {
    const base = withPieces(startGame('r1', PLAYERS), { 'b-0': at(2, 1) });
    const thrown = throwYut(base, 'a', randomFor('GAE'));
    const s = movePiece(thrown, 'a', { pieceId: 'a-0', result: 'GAE' });
    expect(s.pieces.find((p) => p.id === 'b-0')?.state).toEqual({ kind: 'WAITING' });
    expect(s).toMatchObject({ turn: 'a', phase: 'THROW', throwsRemaining: 1 });
  });

  it('keeps a backdo usable once a piece enters', () => {
    let s = throwYut(startGame('r1', PLAYERS), 'a', randomFor('YUT', 'BACKDO'));
    s = throwYut(s, 'a', randomFor('BACKDO'));
    expect(s).toMatchObject({ phase: 'MOVE', pendingResults: ['YUT', 'BACKDO'] });
    s = movePiece(s, 'a', { pieceId: 'a-0', result: 'YUT' });
    expect(s).toMatchObject({ phase: 'MOVE', turn: 'a', pendingResults: ['BACKDO'] });
    s = movePiece(s, 'a', { pieceId: 'a-0', result: 'BACKDO' });
    expect(s.pieces.find((p) => p.id === 'a-0')?.state).toEqual(at(3, 2));
    expect(s.turn).toBe('b');
  });

  it('ends the game immediately when the fourth piece finishes', () => {
    const done = { kind: 'FINISHED' } as const;
    const base = withPieces(startGame('r1', PLAYERS), { 'a-0': done, 'a-1': done, 'a-2': done, 'a-3': at(19, 18) });
    const thrown = throwYut(base, 'a', randomFor('GAE'));
    const s = movePiece(thrown, 'a', { pieceId: 'a-3', result: 'GAE' });
    expect(s).toMatchObject({ phase: 'FINISHED', winner: 'a' });
    expect(s.players[0]?.regularTurnsCompleted).toBe(0);
    expect(() => throwYut(s, 'a', randomFor('DO'))).toThrow('끝났');
  });
});

describe('completedRound', () => {
  it('counts rounds finished by every player', () => {
    // Different results so nobody lands on (and captures) another piece.
    let s = startGame('r1', PLAYERS);
    const plays: Array<[string, YutResult]> = [['a', 'DO'], ['b', 'GAE'], ['c', 'GEOL']];
    for (const [id, result] of plays) {
      s = throwYut(s, id, randomFor(result));
      s = movePiece(s, id, { pieceId: `${id}-0`, result });
    }
    expect(completedRound(s)).toBe(0);
    s = throwYut(s, 'd', randomFor('BACKDO'));
    expect(completedRound(s)).toBe(1);
  });

  it('does not count extra throws as turns', () => {
    let s = throwYut(startGame('r1', PLAYERS), 'a', randomFor('MO'));
    s = throwYut(s, 'a', randomFor('DO'));
    expect(s.players[0]?.regularTurnsCompleted).toBe(0);
  });
});

describe('autoAct', () => {
  it('throws for the current player during THROW', () => {
    const s = autoAct(startGame('r1', PLAYERS), randomFor('GAE'));
    expect(s.pendingResults).toEqual(['GAE']);
  });

  it('plays a random legal move during MOVE', () => {
    const thrown = throwYut(startGame('r1', PLAYERS), 'a', randomFor('GAE'));
    const s = autoAct(thrown, () => 0);
    expect(s.pieces.find((p) => p.id === 'a-0')?.state).toEqual(at(2, 1));
    expect(s.turn).toBe('b');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @yut/shared test -- turn`
Expected: FAIL — `Failed to resolve import "./turn"`

- [ ] **Step 3: Write minimal implementation**

`shared/src/turn.ts`:

```ts
import { PIECES_PER_PLAYER, RuleError, type GameState, type Piece, type PlayerId } from './game';
import { applyMove, legalMoves, type Move } from './moves';
import { grantsExtraThrow, throwSticks } from './yut';

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
    players: players.map(({ id, name }) => ({ id, name, augmentIds: [], regularTurnsCompleted: 0 })),
    pieces,
    turn: players[0]?.id ?? null,
    throwsRemaining: 1,
    pendingResults: [],
    winner: null,
  };
}

function assertTurn(state: GameState, playerId: PlayerId): void {
  if (state.phase === 'FINISHED') throw new RuleError('게임이 끝났어요');
  if (state.turn !== playerId) throw new RuleError('내 차례가 아니에요');
}

export function throwYut(state: GameState, playerId: PlayerId, random: () => number = Math.random): GameState {
  assertTurn(state, playerId);
  if (state.phase !== 'THROW') throw new RuleError('지금은 윷을 던질 수 없어요');

  const result = throwSticks(random);
  return settle({
    ...state,
    throwsRemaining: state.throwsRemaining - 1 + (grantsExtraThrow(result) ? 1 : 0),
    pendingResults: [...state.pendingResults, result],
  });
}

export function movePiece(state: GameState, playerId: PlayerId, move: Move): GameState {
  assertTurn(state, playerId);
  if (state.phase !== 'MOVE') throw new RuleError('지금은 말을 움직일 수 없어요');
  const piece = state.pieces.find((p) => p.id === move.pieceId);
  if (!piece || piece.owner !== playerId) throw new RuleError('내 말이 아니에요');
  const index = state.pendingResults.indexOf(move.result);
  if (index < 0) throw new RuleError('남은 윷 결과가 아니에요');

  const outcome = applyMove(state.pieces, move);
  const pendingResults = state.pendingResults.filter((_, i) => i !== index);

  if (hasFinishedAll(outcome.pieces, playerId)) {
    return { ...state, pieces: outcome.pieces, pendingResults: [], throwsRemaining: 0, phase: 'FINISHED', winner: playerId };
  }
  return settle({
    ...state,
    pieces: outcome.pieces,
    pendingResults,
    throwsRemaining: state.throwsRemaining + (outcome.capturedCount > 0 ? 1 : 0),
  });
}

/** Timeout: act for the current player at random. */
export function autoAct(state: GameState, random: () => number): GameState {
  if (state.turn === null) throw new RuleError('진행 중인 차례가 없어요');
  if (state.phase === 'THROW') return throwYut(state, state.turn, random);
  if (state.phase === 'MOVE') {
    const moves = legalMoves(state.pieces, state.turn, state.pendingResults);
    const move = moves[Math.floor(random() * moves.length)];
    if (!move) throw new RuleError('움직일 수 있는 말이 없어요');
    return movePiece(state, state.turn, move);
  }
  throw new RuleError('자동으로 진행할 수 없는 단계예요');
}

/** Rounds finished by every player (the minimum of regular turns). */
export function completedRound(state: GameState): number {
  return Math.min(...state.players.map((p) => p.regularTurnsCompleted));
}

function hasFinishedAll(pieces: readonly Piece[], playerId: PlayerId): boolean {
  return pieces.filter((p) => p.owner === playerId).every((p) => p.state.kind === 'FINISHED');
}

/** Choose the next phase, or end the turn when nothing is left to do. */
function settle(state: GameState): GameState {
  if (state.throwsRemaining > 0) return { ...state, phase: 'THROW' };
  if (state.turn !== null && legalMoves(state.pieces, state.turn, state.pendingResults).length > 0) {
    return { ...state, phase: 'MOVE' };
  }
  return endTurn(state);
}

/** Unusable results are discarded; the next seat starts a regular turn. */
function endTurn(state: GameState): GameState {
  const index = state.players.findIndex((p) => p.id === state.turn);
  const players = state.players.map((p, i) =>
    i === index ? { ...p, regularTurnsCompleted: p.regularTurnsCompleted + 1 } : p,
  );
  return {
    ...state,
    players,
    turn: players[(index + 1) % players.length]?.id ?? null,
    phase: 'THROW',
    throwsRemaining: 1,
    pendingResults: [],
  };
}
```

- [ ] **Step 4: Update `shared/src/index.ts`**

```ts
export * from './yut';
export * from './board';
export * from './game';
export * from './moves';
export * from './turn';
export * from './augment';
export * from './events';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @yut/shared test -- turn`
Expected: PASS (14 tests)

- [ ] **Step 6: Verify everything**

Run: `pnpm typecheck && pnpm test && pnpm --filter @yut/client build`
Expected: 타입 에러 없음, 전체 테스트 PASS (기존 4 + 10 + 12 + 14 = 40), 클라이언트 빌드 성공

- [ ] **Step 7: Update `docs/progress.md`**

1장 "구현된 것"의 `shared/` 행에 "윷판 29칸 그래프, 이동·업기·잡기·골인, 턴 진행·추가 던지기·승리, 시간 초과 랜덤 자동 행동"을 추가하고, 테스트 수를 40개로, "미구현"에서 해당 항목을 지운다. 6장 변경 이력에 한 줄 추가한다.

---

## 다음 계획 (이 계획 범위 밖)

1. **서버 방·턴 연결:** 6자리 방 코드, 4인 자리·말 색상·준비·방장 시작, `startGame`/`throwYut`/`movePiece` 소켓 이벤트, 18초 타이머 → `autoAct`
2. **증강 선택 시스템:** 시작 + 2·4·6·8·10라운드 끝 동시 선택, 등급 40/40/20, 대혼란 합계 5%, 중복 제외 재분배, 카드별 리롤 3개 + 자유 리롤, 20초 랜덤 선택
3. **자동 대혼란 이벤트:** 4·8·12라운드, 이벤트 → 선택 순서, E5·E6부터
4. **첫 증강 세트:** 안전한 패시브 3~4개 + 액티브 3~4개, 나머지 `disabled`
5. **UI:** Figma 확정 화면 구현 (UI 결정은 사용자에게 질문)
