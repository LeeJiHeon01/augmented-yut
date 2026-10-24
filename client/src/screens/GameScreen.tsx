import { useEffect, useState, type ReactNode } from 'react';
import {
  activeSpec,
  allied,
  activeStatus,
  augmentById,
  CHAOS_EVERY_ROUNDS,
  chaosEventById,
  completedRound,
  isImplemented,
  moverOf,
  movesFor,
  planMove,
  resultChoices,
  stackOf,
  usesLeft,
  YUT_STEPS,
  type ActiveStatus,
  type AugmentTarget,
  type GameState,
  type Move,
  type Player,
  type RoomView,
  type Seat,
  type YutResult,
} from '@yut/shared';
import dices from '../assets/figma/dices.svg';
import hourglass from '../assets/figma/hourglass.svg';
import list from '../assets/figma/list.svg';
import lock from '../assets/figma/lock.svg';
import sparkles from '../assets/figma/sparkles.svg';
import sun from '../assets/figma/sun.svg';
import crown from '../assets/figma/crown-sm.svg';
import { KIND_LABEL, TIER_META } from '../augmentMeta';
import { COLOR_META } from '../colors';
import { chipLabel, entryLine, formatClock, RESULT_LABEL, stepsText } from '../format';
import { Board, type BoardMarks, type Preview } from '../game/Board';
import { useGame } from '../store';
import { Frame } from '../ui/Frame';
import { AugmentSlots, Emblem, GoldButton, Pill } from '../ui/parts';
import { useServerNow } from '../ui/useNow';
import { AugmentPick } from './AugmentPick';
import { nextStep, pickableNodes, pickablePieces, stepHint, type Targeting } from './targeting';

export const GAME_HEIGHT = 1160;

/** How long the "just moved" ring and the timeout banner stay up. */
const NOTICE_MS = 2500;
/** How long the chaos entrance stays up; input waits meanwhile. */
const CHAOS_NOTICE_MS = 3500;
const AUGMENT_SLOTS = 6;

/** A pending result to move with, optionally used as another result (O-S1, O-S9, A-S14). */
interface ResultChoice {
  result: YutResult;
  as?: YutResult;
}

const sameChoice = (a: ResultChoice | null, b: ResultChoice) => a?.result === b.result && a.as === b.as;
const RESULT_BY_STEPS: Record<number, YutResult> = { 1: 'DO', 2: 'GAE', 3: 'GEOL', 4: 'YUT' };

/** Panel slots in seat order: top-left, top-right, bottom-left, bottom-right. */
const PANEL_POSITIONS = [
  { left: 48, top: 192 },
  { left: 1094, top: 192 },
  { left: 48, top: 642 },
  { left: 1094, top: 642 },
];

export function GameScreen({ room, game }: { room: RoomView; game: GameState }) {
  const { me, throwYut, movePiece, pickAugment, passAugment, rerollAugment, activateAugment, splitResult, chooseThrow } = useGame();
  const now = useServerNow();
  const [picked, setPicked] = useState<ResultChoice | null>(null);
  const [targeting, setTargeting] = useState<Targeting | null>(null);

  const seatOf = (id: string | null) => room.seats.find((s) => s.id === id);
  const turnSeat = seatOf(game.turn);
  const myTurn = game.turn === me;

  const lastIndex = game.log.length - 1;
  const last = game.log[lastIndex];
  const lastAge = room.logTimes[lastIndex] ? now - room.logTimes[lastIndex] : Infinity;
  const autoNotice = last?.auto === true && lastAge < NOTICE_MS;

  const chaosIndex = game.log.map((e) => e.kind).lastIndexOf('CHAOS');
  const chaosEntry = game.log[chaosIndex];
  const chaosAge = room.logTimes[chaosIndex] ? now - room.logTimes[chaosIndex] : Infinity;
  const chaosShown = chaosEntry?.kind === 'CHAOS' && chaosAge < CHAOS_NOTICE_MS ? chaosEntry : null;

  const locked = autoNotice || chaosShown !== null;
  // C-S12: a delegate picks the turn player's move; they act on the turn player's pieces.
  const delegate = game.field.delegate?.owner === game.turn ? game.field.delegate : null;
  const isMover = moverOf(game) === me;
  const owner = isMover && game.turn ? game.turn : me;
  const canThrow = myTurn && game.phase === 'THROW' && !locked && !targeting;
  const canMove = isMover && game.phase === 'MOVE' && !locked && !targeting;

  // Chips: every pending result plus the alternatives augments allow. One option needs no choice.
  const distinct = [...new Set(game.pendingResults)];
  const options: ResultChoice[] = distinct.flatMap((result) =>
    (owner ? resultChoices(game, owner, result) : [result]).map((as) => (as === result ? { result } : { result, as })),
  );
  const selected = options.find((o) => sameChoice(picked, o)) ?? (options.length === 1 ? (options[0] ?? null) : null);
  const moveOf = (pieceId: string): Move | null =>
    selected ? (selected.as ? { pieceId, result: selected.result, as: selected.as } : { pieceId, result: selected.result }) : null;
  const allMoves = canMove && owner ? movesFor(game, owner) : [];
  const moves = selected ? allMoves.filter((m) => m.result === selected.result && m.as === selected.as) : [];
  const movable = new Set(moves.map((m) => m.pieceId));
  const waitingPieces = game.pieces.filter((p) => p.owner === owner && p.state.kind === 'WAITING');
  const enterMove = moves.find((m) => waitingPieces.some((p) => p.id === m.pieceId));

  // Targets go stale once the turn moves on.
  useEffect(() => setTargeting(null), [game.turn, game.phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') setTargeting(null);
      if (e.code !== 'Space' || !canThrow) return;
      e.preventDefault();
      throwYut();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canThrow, throwYut]);

  /** Fire the active once every target is picked. */
  const advance = (t: Targeting) => {
    if (nextStep(t) === 'DONE') {
      activateAugment(t.augmentId, t.target);
      setTargeting(null);
    } else setTargeting(t);
  };
  const startActive = (augmentId: string) => {
    const spec = activeSpec(augmentId);
    if (spec) advance({ augmentId, spec, target: {} });
  };
  const pickTarget = (patch: AugmentTarget) => {
    if (targeting) advance({ ...targeting, target: { ...targeting.target, ...patch } });
  };
  const step = targeting ? nextStep(targeting) : null;
  const boardTargeting =
    targeting && me && (step === 'PIECE' || step === 'OTHER_PIECE' || step === 'NODE')
      ? {
          pieces: step === 'NODE' ? new Set<string>() : pickablePieces(game, me, targeting, step),
          nodes: step === 'NODE' ? pickableNodes(game) : new Set<number>(),
          onPiece: (pieceId: string) => pickTarget(step === 'OTHER_PIECE' ? { otherPieceId: pieceId } : { pieceId }),
          onNode: (node: number) => pickTarget({ node }),
        }
      : null;

  const turnOf = (id: string) => game.players.find((p) => p.id === id)?.regularTurnsCompleted ?? 0;
  const ownerOf = (pieceId: string) => game.pieces.find((p) => p.id === pieceId)?.owner ?? '';
  const marks: BoardMarks = {
    traps: game.field.traps.map((t) => t.node),
    blocks: game.field.blocks.filter((b) => turnOf(b.owner) < b.until).map((b) => b.node),
    tags: new Map<string, string>([
      ...game.pieces.filter((p) => p.clone).map((p): [string, string] => [p.id, '분신']),
      ...game.field.frozen.filter((f) => turnOf(ownerOf(f.pieceId)) <= f.turn).map((f): [string, string] => [f.pieceId, '정지']),
      ...game.field.bombs.map((b): [string, string] => [b.pieceId, '폭탄']),
    ]),
  };

  const total = selected ? YUT_STEPS[selected.result] : 0;
  const canSplit = canMove && selected && !selected.as && game.players.find((p) => p.id === me)?.augmentIds.includes('O-G1');
  const splits = canSplit
    ? Array.from({ length: Math.max(0, total - 1) }, (_, i) => i + 1)
        .filter((a) => a <= total - a && RESULT_BY_STEPS[total - a])
        .map((a) => ({ first: RESULT_BY_STEPS[a]!, second: RESULT_BY_STEPS[total - a]! }))
    : [];

  const secondsLeft = room.deadline ? Math.max(0, Math.ceil((room.deadline - now) / 1000)) : 0;

  const previewOf = (pieceId: string): Preview | null => {
    const piece = game.pieces.find((p) => p.id === pieceId);
    const move = moveOf(pieceId);
    if (!piece || !move || !me || piece.state.kind === 'FINISHED') return null;
    let plan;
    try {
      plan = planMove(game, owner ?? me, move);
    } catch {
      return null;
    }
    const carried = stackOf(game.pieces, piece).length - 1;
    const notes = [chipLabel(plan.used)];
    for (const b of plan.bonuses) {
      notes.push(`${b.augmentId ? augmentById(b.augmentId)?.name : '보너스'} ${b.steps >= 0 ? '+' : ''}${b.steps}`);
    }
    if (plan.backward && YUT_STEPS[plan.used] > 0) notes.push('뒤로 이동');
    if (carried > 0) notes.push(`업힌 말 ${carried}개`);
    return {
      from: piece.state.kind === 'ON_BOARD' ? piece.state.node : null,
      landing: plan.landing,
      route: plan.route,
      label: notes.join(' · '),
    };
  };

  let moved: { node: number; text: string } | null = null;
  if (last?.kind === 'MOVE' && lastAge < NOTICE_MS) {
    const piece = game.pieces.find((p) => p.id === last.pieceId);
    if (piece?.state.kind === 'ON_BOARD') moved = { node: piece.state.node, text: `${stepsText(last.result)} 완료` };
  }

  return (
    <Frame section="친구 대전" roomCode={room.code} height={GAME_HEIGHT}>
      <TurnTimer seconds={secondsLeft} auto={autoNotice} />

      <div className="absolute top-[167px] left-[408px] z-10 flex h-[36px] w-[624px] items-center justify-center gap-[14px]">
        <div className="h-px w-[70px] bg-bronze" />
        <img alt="" src={sun} className="size-[21px]" />
        <p className="font-serif text-[24px] font-semibold text-gold-light">
          {game.phase === 'AUGMENT_PICK' ? '증강 선택 중' : `${turnSeat?.name}님의 차례`}
        </p>
        {myTurn && game.phase !== 'AUGMENT_PICK' && <Pill>내 턴</Pill>}
        <div className="h-px w-[70px] bg-bronze" />
      </div>

      {game.players.map((player, i) => {
        const seat = seatOf(player.id);
        const pos = PANEL_POSITIONS[i];
        return seat && pos ? (
          <PlayerPanel key={player.id} player={player} seat={seat} game={game} isMe={player.id === me} position={pos} />
        ) : null;
      })}

      <Board
        pieces={game.pieces}
        colorOf={(id) => seatOf(id)?.color ?? 'RED'}
        movable={movable}
        waiting={waitingPieces}
        myColor={seatOf(owner)?.color ?? 'RED'}
        canEnter={enterMove !== undefined}
        previewOf={previewOf}
        moved={moved}
        onPiece={(pieceId) => {
          const move = moveOf(pieceId);
          if (!move) return;
          movePiece(move);
          setPicked(null);
        }}
        onEnter={() => {
          if (!enterMove) return;
          movePiece(enterMove);
          setPicked(null);
        }}
        targeting={boardTargeting}
        marks={marks}
      />

      {targeting && step && step !== 'DONE' ? (
        <TargetPanel
          title={augmentById(targeting.augmentId)?.name ?? targeting.augmentId}
          hint={stepHint(targeting, step)}
          onCancel={() => setTargeting(null)}
        >
          {step === 'RESULT' &&
            (targeting.spec.choices ?? []).map((r) => (
              <ChoiceButton key={r} onClick={() => pickTarget({ result: r })}>
                {RESULT_LABEL[r]}
              </ChoiceButton>
            ))}
          {step === 'DELTA' && (
            <>
              <ChoiceButton onClick={() => pickTarget({ delta: -1 })}>한 칸 내리기</ChoiceButton>
              <ChoiceButton onClick={() => pickTarget({ delta: 1 })}>한 칸 올리기</ChoiceButton>
            </>
          )}
          {step === 'DIRECTION' && (
            <>
              <ChoiceButton onClick={() => pickTarget({ direction: 'BACK' })}>{targeting.spec.steps}칸 뒤로</ChoiceButton>
              <ChoiceButton onClick={() => pickTarget({ direction: 'FORWARD' })}>{targeting.spec.steps}칸 앞으로</ChoiceButton>
            </>
          )}
          {step === 'OPPONENT' &&
            room.seats
              .filter((s) => s.id !== me)
              .map((s) => (
                <ChoiceButton key={s.id} onClick={() => pickTarget({ playerId: s.id })}>
                  {s.name}
                </ChoiceButton>
              ))}
        </TargetPanel>
      ) : game.phase === 'CHOOSE' && myTurn && game.field.choice ? (
        <TargetPanel title="윷의 지배자" hint="두 번 던진 결과 중 하나를 고르세요">
          {game.field.choice.map((r, i) => (
            <ChoiceButton key={`${r}-${i}`} onClick={() => chooseThrow(i)}>
              {chipLabel(r)}
            </ChoiceButton>
          ))}
        </TargetPanel>
      ) : autoNotice ? (
        <TimeoutBanner
          name={last?.kind === 'AUGMENT' || !last || !('playerId' in last) ? '고르지 않은 플레이어' : (seatOf(last.playerId)?.name ?? '')}
        />
      ) : (
        <Notice game={game} nameOf={(id) => seatOf(id)?.name ?? ''} />
      )}

      <ChaosPanel round={completedRound(game)} lastEventId={game.lastChaos} active={game.field.chaosActive} />
      <GameLog room={room} game={game} />

      <div className="absolute top-[853px] left-[48px] flex h-[110px] w-[1344px] items-center justify-between rounded-[14px] border border-line bg-panel px-[24px]">
        <ResultBar
          count={game.pendingResults.length}
          options={options}
          selected={selected}
          active={canMove}
          dimmed={autoNotice}
          usable={(o) => allMoves.some((m) => m.result === o.result && m.as === o.as)}
          onPick={setPicked}
          splits={splits}
          onSplit={(first) => selected && splitResult(selected.result, first)}
          status={statusText({
            delegateName: delegate ? (seatOf(delegate.by)?.name ?? '') : null,
            isDelegate: delegate !== null && delegate.by === me,
            interrupting: game.field.interrupting === me,
            myTurn,
            phase: game.phase,
            auto: autoNotice,
            selected: selected ? (selected.as ?? selected.result) : null,
            justMoved: last?.kind === 'MOVE' && last.playerId === me && picked === null && options.length > 1,
            turnName: turnSeat?.name ?? '',
          })}
        />

        <div className="flex flex-col items-center gap-[8px]">
          {autoNotice || chaosShown ? (
            <div className="flex h-[58px] w-[302px] items-center justify-center gap-[10px] rounded-[8px] border border-line bg-[rgba(52,67,90,0.5)] text-[16px] font-bold text-mist">
              <img alt="" src={lock} className="size-[20px]" />
              {chaosShown ? '이벤트 적용 중' : '자동 처리 중'}
            </div>
          ) : (
            <GoldButton icon={dices} className="h-[58px] w-[302px]" disabled={!canThrow} onClick={throwYut}>
              윷 던지기
            </GoldButton>
          )}
          <p className="text-[10px] text-dim">{autoNotice || chaosShown ? '잠시만 기다려 주세요' : '스페이스 키로도 던질 수 있어요'}</p>
        </div>
      </div>

      <MyAugments game={game} me={me} locked={locked} picking={targeting?.augmentId ?? null} onUse={startActive} />

      {game.phase === 'AUGMENT_PICK' && game.draft && me && game.draft.offers[me] && (
        <AugmentPick
          draft={game.draft}
          offer={game.draft.offers[me]}
          secondsLeft={secondsLeft}
          pickedCount={room.draftPicked.length}
          playerCount={game.players.length}
          owned={game.players.find((p) => p.id === me)?.augmentIds ?? []}
          onPick={pickAugment}
          onPass={passAugment}
          onReroll={rerollAugment}
        />
      )}

      {chaosShown && <ChaosEntrance eventId={chaosShown.eventId} round={chaosShown.round} />}
    </Frame>
  );
}

interface StatusInput {
  myTurn: boolean;
  /** C-S12 delegate of the turn player, if any. */
  delegateName: string | null;
  isDelegate: boolean;
  /** I am throwing out of turn (O-S6). */
  interrupting: boolean;
  phase: GameState['phase'];
  auto: boolean;
  selected: YutResult | null;
  justMoved: boolean;
  turnName: string;
}

function statusText(input: StatusInput): string {
  const { myTurn, phase, auto, selected, justMoved, turnName, delegateName, isDelegate, interrupting } = input;
  if (phase === 'AUGMENT_PICK') return '증강 선택 중 · 대전이 잠시 멈췄어요';
  if (auto) return '자동 처리 중 · 결과 선택과 말 이동을 잠시 사용할 수 없습니다';
  if (isDelegate && phase === 'MOVE') return `${turnName}님의 말을 대신 움직여 주세요`;
  if (!myTurn) return `${turnName}님이 진행하고 있어요`;
  if (delegateName && phase === 'MOVE') return `${delegateName}님이 내 말 이동을 고르는 중이에요`;
  if (interrupting && phase === 'THROW') return '복수의 칼날 · 지금 한 번 던질 수 있어요';
  if (phase === 'THROW') return '윷을 던질 차례예요';
  if (phase === 'CHOOSE') return '두 결과 중 하나를 고르세요';
  if (justMoved) return '이동 완료 · 남은 결과를 선택해 다음 이동을 이어가세요';
  if (selected) return `${chipLabel(selected)} 선택됨 · 이동할 말에 마우스를 올려 도착 칸을 확인하세요`;
  return '사용할 결과를 먼저 골라 주세요';
}

/** Pill text and look for each active state (게임 화면.png bottom cards). */
const ACTIVE_PILL: Record<ActiveStatus, { label: string; className: string }> = {
  READY: { label: '사용 가능', className: 'border-bronze text-gold-light' },
  RESERVED: { label: '예약됨', className: 'border-[#c7a4f5] text-[#c7a4f5]' },
  BLOCKED: { label: '사용 불가', className: 'border-line text-dim' },
  SPENT: { label: '소진', className: 'border-line text-dim' },
};

interface MyAugmentsProps {
  game: GameState;
  me: string | null;
  /** Input is paused (timeout notice). */
  locked: boolean;
  /** Active currently waiting for its target. */
  picking: string | null;
  onUse: (augmentId: string) => void;
}

/** My augments as cards under the result bar. A ready active card is clicked to use it. */
function MyAugments({ game, me, locked, picking, onUse }: MyAugmentsProps) {
  const player = game.players.find((p) => p.id === me);
  const augmentIds = player?.augmentIds ?? [];
  return (
    <div className="absolute top-[984px] left-[48px] flex gap-[14px]">
      {Array.from({ length: AUGMENT_SLOTS }, (_, i) => {
        const augment = augmentById(augmentIds[i] ?? '');
        if (!augment || !player) {
          return (
            <div
              key={i}
              aria-disabled="true"
              className="flex h-[137px] w-[212px] flex-col justify-between rounded-[8px] border border-line-soft bg-panel-soft p-[12px] opacity-60"
            >
              <div className="flex items-center gap-[10px]">
                <AugmentSlots size={32} count={1} />
                <p className="text-[14px] font-bold text-dim">빈 증강 칸</p>
              </div>
              <p className="text-[11px] text-dim">증강을 고르면 이곳에 표시돼요</p>
              <span className="self-start rounded-full border border-line px-[10px] py-[3px] text-[11px] text-dim">비어 있음</span>
            </div>
          );
        }
        const tier = TIER_META[augment.rarity];
        const left = usesLeft(player, augment.id);
        const status = left === null ? null : activeStatus(game, player.id, augment.id);
        const ready = status === 'READY' && !locked && picking === null;
        const pill = status ? ACTIVE_PILL[status] : null;
        return (
          <button
            key={i}
            type="button"
            disabled={!ready}
            onClick={() => onUse(augment.id)}
            title={ready ? '클릭하면 사용해요' : undefined}
            className={`flex h-[137px] w-[212px] flex-col justify-between rounded-[8px] border bg-panel p-[12px] text-left transition enabled:cursor-pointer enabled:hover:-translate-y-[3px] ${
              status === 'SPENT' ? 'opacity-60' : ''
            }`}
            style={{
              borderColor: tier.border,
              boxShadow: picking === augment.id ? `0 0 24px ${tier.border}` : ready ? `0 0 18px ${tier.border}66` : undefined,
            }}
          >
            <div className="flex items-center gap-[10px]">
              <div
                className="flex size-[32px] shrink-0 items-center justify-center rounded-[8px] border bg-slot"
                style={{ borderColor: tier.border }}
              >
                <img alt="" src={tier.icon} className="size-[16px]" />
              </div>
              <p className="truncate text-[15px] font-bold text-ink">{augment.name}</p>
            </div>
            <p className="line-clamp-2 text-[11px] leading-[16px] text-mist">
              {status === 'BLOCKED' ? `조건 미충족 · ${augment.description}` : augment.description}
            </p>
            {pill ? (
              <span className={`self-start rounded-full border px-[10px] py-[3px] text-[11px] ${pill.className}`}>
                {pill.label} · {left}회
              </span>
            ) : (
              <span
                className="self-start rounded-full border px-[10px] py-[3px] text-[11px]"
                style={{ borderColor: `${tier.color}66`, color: tier.color }}
              >
                {KIND_LABEL[augment.kind]}
                {isImplemented(augment.id) ? '' : ' · 효과 준비 중'}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Big countdown above the board; red from five seconds, then "자동 처리 중". */
function TurnTimer({ seconds, auto }: { seconds: number; auto: boolean }) {
  const urgent = auto || seconds <= 5;
  const note = auto || seconds === 0 ? '자동 처리 중' : urgent ? `${seconds}초 남았습니다` : null;
  return (
    <div className="absolute top-[102px] left-0 flex w-[1440px] justify-center">
      <div
        className={`flex h-[65px] items-center gap-[12px] rounded-full border px-[24px] ${
          urgent ? 'border-[#d87b73] bg-[rgba(237,130,125,0.12)]' : 'border-bronze bg-panel'
        }`}
      >
        <p className={`text-[13px] ${urgent ? 'font-bold text-[#f29b92]' : 'text-mist'}`}>남은 시간</p>
        <p className={`font-serif text-[40px] leading-none font-bold ${urgent ? 'text-[#f29b92]' : 'text-gold-light'}`}>
          {String(auto ? 0 : seconds).padStart(2, '0')}초
        </p>
        {note && <p className="text-[14px] font-bold text-[#f29b92]">{note}</p>}
      </div>
    </div>
  );
}

/** Latest move or throw under the board. */
function Notice({ game, nameOf }: { game: GameState; nameOf: (id: string) => string }) {
  const finishedSoFar = new Map<string, number>();
  for (const entry of game.log) {
    if (entry.kind === 'MOVE') finishedSoFar.set(entry.playerId, (finishedSoFar.get(entry.playerId) ?? 0) + entry.finished);
  }
  const last = game.log.at(-1);
  if (!last) return null;
  const total = 'playerId' in last ? (finishedSoFar.get(last.playerId) ?? 0) : 0;
  return (
    <div className="absolute top-[803px] left-[415px] flex h-[38px] w-[609px] items-center rounded-[8px] border border-green bg-[rgba(116,199,174,0.1)] px-[15px]">
      <p className="truncate text-[14px] font-bold text-[#a8e6d2]">
        {entryLine(last, total, nameOf)}
      </p>
    </div>
  );
}

function TimeoutBanner({ name }: { name: string }) {
  return (
    <div className="absolute top-[743px] left-[415px] z-30 flex h-[85px] w-[609px] items-center gap-[18px] rounded-[8px] border border-[#d87b73] bg-[rgba(62,30,40,0.95)] px-[24px]">
      <img alt="" src={hourglass} className="size-[30px]" />
      <div className="flex flex-col gap-[4px]">
        <p className="text-[22px] font-bold text-[#f29b92]">시간 초과로 자동 진행</p>
        <p className="text-[13px] text-mist">{name}의 선택을 자동 처리하고 있습니다 · 입력 잠시 비활성</p>
      </div>
    </div>
  );
}

const CHAOS_ICON: Record<string, string> = { E5: crown };

interface ChaosPanelProps {
  round: number;
  lastEventId: string | null;
  active: { eventId: string; untilRound: number }[];
}

/** Running chaos event with rounds left, otherwise the countdown and the last event. */
function ChaosPanel({ round, lastEventId, active }: ChaosPanelProps) {
  const left = CHAOS_EVERY_ROUNDS - (round % CHAOS_EVERY_ROUNDS);
  const running = active.find((e) => round < e.untilRound);
  const event = running ? chaosEventById(running.eventId) : undefined;
  const lastEvent = lastEventId ? chaosEventById(lastEventId) : undefined;
  return (
    <div className="absolute top-[409px] left-[48px] flex h-[208px] w-[298px] flex-col items-start gap-[14px] rounded-[14px] border border-line-soft bg-panel-soft p-[24px]">
      {running && event ? (
        <>
          <span className="flex items-center gap-[8px] rounded-full border border-bronze bg-[rgba(8,15,32,0.4)] px-[12px] py-[5px] text-[12px] font-bold text-gold">
            <span className="size-[8px] rounded-full bg-gold" />
            대혼란 · {event.name}
          </span>
          <span className="flex items-center gap-[8px] rounded-full border border-line bg-[rgba(8,15,32,0.4)] px-[12px] py-[5px] text-[12px] text-mist">
            <span className="size-[8px] rounded-full bg-mist" />
            남은 라운드 {running.untilRound - round}
          </span>
          <p className="text-[15px] leading-[21px] font-bold text-gold-light">{event.description}</p>
        </>
      ) : (
        <>
          <span className="flex items-center gap-[8px] rounded-full border border-line bg-[rgba(8,15,32,0.4)] px-[12px] py-[5px] text-[12px] text-dim">
            <span className="size-[8px] rounded-full bg-dim" />
            {lastEvent ? `지난 대혼란 · ${lastEvent.name}` : '대혼란 대기'}
          </span>
          <span className="flex items-center gap-[8px] rounded-full border border-line bg-[rgba(8,15,32,0.4)] px-[12px] py-[5px] text-[12px] text-mist">
            <span className="size-[8px] rounded-full bg-mist" />
            다음 발동까지 {left}라운드
          </span>
          <p className="text-[15px] font-bold text-ink">진행 중인 대혼란이 없어요</p>
        </>
      )}
      <p className="mt-auto text-[12px] text-dim">전원 {CHAOS_EVERY_ROUNDS}라운드 완료마다 발동</p>
    </div>
  );
}

/** Entrance card over the board when a chaos event fires (게임 · 대혼란 등장.png). */
function ChaosEntrance({ eventId, round }: { eventId: string; round: number }) {
  const event = chaosEventById(eventId);
  const icon = CHAOS_ICON[eventId] ?? sparkles;
  return (
    <div className="absolute top-[293px] left-[351px] z-50 h-[407px] w-[738px] rounded-[16px] border-2 border-gold bg-[#111d30] p-[10px] shadow-[0_0_60px_rgba(217,184,120,0.35)]">
      <div className="flex h-full flex-col items-center rounded-[10px] border border-line pt-[28px]">
        <div className="flex items-center gap-[12px]">
          <div className="h-px w-[52px] bg-bronze" />
          <p className="text-[13px] text-gold">전원 {round}라운드 완료</p>
          <div className="h-px w-[52px] bg-bronze" />
        </div>
        <p className="mt-[18px] font-serif text-[64px] leading-none font-bold text-gold-light">대혼란</p>
        <div className="mt-[26px] flex items-center gap-[14px]">
          {icon && <img alt="" src={icon} className="size-[30px]" />}
          <p className="font-serif text-[34px] font-semibold text-ink">{event?.name ?? eventId}</p>
        </div>
        <div className="mt-[18px] h-px w-[380px] bg-line" />
        <p className="mt-[20px] text-[22px] font-bold text-gold-light">{event?.description}</p>
        <span className="mt-[18px] rounded-full border border-bronze px-[20px] py-[5px] text-[14px] font-bold text-gold-light">
          {event?.rounds ? `${event.rounds}라운드 동안 적용` : '즉시 적용'}
        </span>
        <p className="mt-[18px] text-[12px] text-mist">전원 {CHAOS_EVERY_ROUNDS}라운드 완료마다 발동</p>
      </div>
    </div>
  );
}

interface PlayerPanelProps {
  player: Player;
  seat: Seat;
  game: GameState;
  isMe: boolean;
  position: { left: number; top: number };
}

function PlayerPanel({ player, seat, game, isMe, position }: PlayerPanelProps) {
  const meta = COLOR_META[seat.color];
  const own = game.pieces.filter((p) => p.owner === player.id);
  const finished = own.filter((p) => p.state.kind === 'FINISHED').length;
  const remaining = own.length - finished;
  const active = game.turn === player.id;
  const ally = game.players.find((p) => allied(game, player.id, p.id));

  return (
    <div
      className={`absolute flex h-[186px] w-[298px] flex-col gap-[12px] rounded-[14px] bg-panel p-[18px] ${
        active ? 'border-[1.5px] border-gold shadow-[0_0_24px_rgba(221,182,108,0.21)]' : 'border border-line shadow-[0_16px_40px_rgba(0,0,0,0.25)]'
      } ${seat.connected ? '' : 'opacity-60'}`}
      style={position}
    >
      <div className="flex items-center gap-[12px]">
        <Emblem color={seat.color} size={46} />
        <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
          <p className="truncate text-[16px] font-bold text-ink">
            {seat.name}
            {isMe && ' · 나'}
          </p>
          <p className="text-[11px]" style={{ color: meta.hex }}>
            {meta.label} 말{seat.connected ? '' : ' · 연결 끊김'}
            {ally && <span className="ml-[6px] text-[#a8e6d2]">동맹 · {ally.name}</span>}
          </p>
        </div>
        {active && <Pill>{isMe ? '내 턴' : '차례'}</Pill>}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-[5px]">
          {own.map((p) => (
            <span
              key={p.id}
              className="size-[9px] rounded-full border"
              style={p.state.kind === 'FINISHED' ? { borderColor: meta.hex } : { background: meta.hex, borderColor: meta.hex }}
            />
          ))}
        </div>
        <p className="text-[12px] whitespace-pre text-mist">{`남은 말 ${remaining}  ·  골인 ${finished}`}</p>
      </div>
      <div className="flex gap-[9px]">
        {Array.from({ length: AUGMENT_SLOTS }, (_, i) => {
          const augment = augmentById(player.augmentIds[i] ?? '');
          if (!augment) return <AugmentSlots key={i} size={33} count={1} />;
          const tier = TIER_META[augment.rarity];
          return (
            <div
              key={i}
              title={`${augment.name} · ${augment.description}`}
              className="flex size-[33px] shrink-0 items-center justify-center rounded-[8px] border bg-slot"
              style={{ borderColor: tier.border }}
            >
              <span className="text-[13px] font-bold" style={{ color: tier.color }}>
                {augment.name.slice(0, 1)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-dim">보유 증강 {player.augmentIds.length}</p>
    </div>
  );
}

function GameLog({ room, game }: { room: RoomView; game: GameState }) {
  // Running finished count per player, so each line knows "두 번째 말 골인".
  const finishedSoFar = new Map<string, number>();
  const lines = game.log.flatMap((entry, i) => {
    // Plain throws show up as moves; augment-changed throws get their own line.
    if (entry.kind === 'THROW' && !entry.augmentId) return [];
    const owner = 'playerId' in entry ? entry.playerId : '';
    const total = (finishedSoFar.get(owner) ?? 0) + (entry.kind === 'MOVE' ? entry.finished : 0);
    finishedSoFar.set(owner, total);
    const time = room.startedAt && room.logTimes[i] ? room.logTimes[i] - room.startedAt : 0;
    return [{ i, entry, total, time }];
  });
  const latest = lines.slice(-6).reverse();

  return (
    <div className="absolute top-[409px] left-[1094px] flex h-[216px] w-[298px] flex-col gap-[9px] overflow-hidden rounded-[14px] border border-line-soft bg-panel-soft p-[18px]">
      <div className="flex justify-between">
        <p className="text-[13px] font-bold text-mist">대전 기록</p>
        <img alt="" src={list} className="size-[15px]" />
      </div>
      {latest.map(({ i, entry, total, time }) => {
        const seat = 'playerId' in entry ? room.seats.find((s) => s.id === entry.playerId) : undefined;
        return (
          <div key={i} className="flex items-center gap-[10px]">
            <p className="w-[34px] shrink-0 text-[10px] text-dim">{formatClock(time)}</p>
            <p
              className="line-clamp-2 text-[11px] leading-[15px] text-gold-light"
              style={{ color: seat ? COLOR_META[seat.color].hex : undefined }}
            >
              {entryLine(entry, total, (id) => room.seats.find((s) => s.id === id)?.name ?? '')}
            </p>
          </div>
        );
      })}
      {latest.length === 0 && <p className="text-[11px] text-dim">아직 기록이 없어요</p>}
    </div>
  );
}

interface ResultBarProps {
  /** Results still unused. */
  count: number;
  /** Distinct pending results plus the alternatives augments allow. */
  options: ResultChoice[];
  selected: ResultChoice | null;
  /** Chips can be picked (my move phase). */
  active: boolean;
  dimmed: boolean;
  usable: (option: ResultChoice) => boolean;
  onPick: (option: ResultChoice) => void;
  /** O-G1 ways to split the selected result. */
  splits: { first: YutResult; second: YutResult }[];
  onSplit: (first: YutResult) => void;
  status: string;
}

/** Results as chips (alternatives as "빽도→도"), split buttons, and a one-line status. */
function ResultBar({ count, options, selected, active, dimmed, usable, onPick, splits, onSplit, status }: ResultBarProps) {
  return (
    <div className={`flex flex-col gap-[8px] ${dimmed ? 'opacity-50' : ''}`}>
      <p className="text-[11px] text-dim">누적 결과 · {count}개 남음</p>
      <div className="flex h-[25px] gap-[8px]">
        {options.map((o) => {
          const on = active && sameChoice(selected, o);
          return (
            <button
              key={`${o.result}-${o.as ?? ''}`}
              type="button"
              disabled={!active || !usable(o)}
              onClick={() => onPick(o)}
              className={`rounded-full border px-[10px] text-[12px] font-bold whitespace-nowrap transition enabled:cursor-pointer ${
                on ? 'border-gold-light bg-gold-light text-button-ink' : 'border-bronze bg-[rgba(217,184,120,0.08)] text-gold-light'
              } ${active && !usable(o) ? 'opacity-40' : ''}`}
            >
              {o.as ? `${RESULT_LABEL[o.result]}→${chipLabel(o.as)}` : chipLabel(o.result)}
            </button>
          );
        })}
        {splits.length > 0 && <span className="ml-[6px] text-[11px] leading-[25px] text-dim">나누기</span>}
        {splits.map(({ first, second }) => (
          <button
            key={`split-${first}`}
            type="button"
            onClick={() => onSplit(first)}
            className="cursor-pointer rounded-full border border-[#c7a4f5] px-[10px] text-[12px] font-bold text-[#c7a4f5] hover:bg-[rgba(199,164,245,0.12)]"
          >
            {RESULT_LABEL[first]}+{RESULT_LABEL[second]}
          </button>
        ))}
        {options.length === 0 && <span className="text-[12px] leading-[25px] text-dim">윷을 던지면 결과가 쌓여요</span>}
      </div>
      <p className="text-[18px] font-bold text-ink">{status}</p>
    </div>
  );
}

interface TargetPanelProps {
  title: string;
  hint: string;
  onCancel?: () => void;
  children?: ReactNode;
}

/** Picks for an active augment (or the O-P8 choice), shown under the board. */
function TargetPanel({ title, hint, onCancel, children }: TargetPanelProps) {
  return (
    <div className="absolute top-[799px] left-[395px] z-30 flex h-[46px] w-[650px] items-center gap-[10px] rounded-[8px] border border-gold bg-[rgba(17,29,48,0.97)] px-[14px] shadow-[0_0_24px_rgba(217,184,120,0.25)]">
      <p className="shrink-0 text-[14px] font-bold text-gold-light">{title}</p>
      <p className="shrink-0 text-[12px] text-mist">{hint}</p>
      <div className="flex flex-1 justify-end gap-[6px]">{children}</div>
      {onCancel && (
        <button type="button" onClick={onCancel} className="shrink-0 cursor-pointer text-[11px] text-dim hover:text-ink">
          취소 (Esc)
        </button>
      )}
    </div>
  );
}

function ChoiceButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-[6px] border border-bronze bg-[rgba(217,184,120,0.08)] px-[10px] py-[4px] text-[12px] font-bold whitespace-nowrap text-gold-light hover:bg-[rgba(217,184,120,0.2)]"
    >
      {children}
    </button>
  );
}
