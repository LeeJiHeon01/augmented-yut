import { useState } from 'react';
import { motion } from 'motion/react';
import { HOME, type Landing, type NodeId, type Piece, type PieceColor, type PlayerId } from '@yut/shared';
import boardDiagonals from '../assets/figma/board-diagonals.svg';
import boardKnot from '../assets/figma/board-knot.svg';
import boardOuterPath from '../assets/figma/board-outer-path.svg';
import boardRingInner from '../assets/figma/board-ring-inner.svg';
import boardRingOuter from '../assets/figma/board-ring-outer.svg';
import moveTarget from '../assets/figma/move-target.svg';
import nodeCorner from '../assets/figma/node-corner.svg';
import nodeSmall from '../assets/figma/node.svg';
import { COLOR_META } from '../colors';
import { isBigNode, NODE_POSITIONS } from './boardLayout';

interface BoardProps {
  pieces: Piece[];
  colorOf: (playerId: PlayerId) => PieceColor;
  /** Piece ids the player may move with the selected result. */
  movable: Set<string>;
  /** My waiting pieces, shown in a column right of the board. */
  waiting: Piece[];
  myColor: PieceColor;
  canEnter: boolean;
  /** Hover preview of a piece with the selected result. */
  previewOf: (pieceId: string) => Preview | null;
  /** Ring and caption on the piece that just moved. */
  moved: { node: NodeId; text: string } | null;
  onPiece: (pieceId: string) => void;
  onEnter: () => void;
  /** Picking a target for an active augment: these pieces / nodes become clickable instead. */
  targeting?: BoardTargeting | null;
  /** Augment marks on the board. */
  marks: BoardMarks;
}

export interface BoardTargeting {
  pieces: Set<string>;
  nodes: Set<NodeId>;
  onPiece: (pieceId: string) => void;
  onNode: (node: NodeId) => void;
}

export interface BoardMarks {
  traps: NodeId[];
  blocks: NodeId[];
  /** Small tag per piece id: 폭탄, 정지, 분신. */
  tags: Map<string, string>;
}

export interface Preview {
  from: NodeId | null;
  landing: Landing;
  /** Nodes passed, ending on the landing node. */
  route: NodeId[];
  /** Caption above the hovered piece, e.g. 걸 +3 · 업힌 말 2개. */
  label: string;
}

interface Stack {
  head: Piece;
  members: Piece[];
  node: NodeId;
  size: number;
  /** Horizontal nudge when other players' pieces share the node (chaos events). */
  offset: number;
}

/** Spread between different players' stacks on one node. */
const SHARED_GAP = 22;

/** Own pieces sharing a node are drawn as one piece with a count badge. */
function stacksOf(pieces: Piece[]): Stack[] {
  const byKey = new Map<string, Stack>();
  for (const piece of pieces) {
    if (piece.state.kind !== 'ON_BOARD') continue;
    const key = `${piece.owner}:${piece.state.node}`;
    const stack = byKey.get(key);
    if (stack) {
      stack.size++;
      stack.members.push(piece);
    } else byKey.set(key, { head: piece, members: [piece], node: piece.state.node, size: 1, offset: 0 });
  }
  const stacks = [...byKey.values()];
  for (const stack of stacks) {
    const shared = stacks.filter((s) => s.node === stack.node);
    stack.offset = (shared.indexOf(stack) - (shared.length - 1) / 2) * SHARED_GAP;
  }
  return stacks;
}

const NODES = Object.entries(NODE_POSITIONS).map(([id, point]) => ({ id: Number(id), ...point }));

export function Board(props: BoardProps) {
  const { pieces, colorOf, movable, waiting, myColor, canEnter, previewOf, moved, onPiece, onEnter, targeting, marks } = props;
  const [hovered, setHovered] = useState<string | null>(null);
  const preview = hovered && !targeting ? previewOf(hovered) : null;
  const stacks = stacksOf(pieces);
  // Movable piece per stack, keyed like the stacks (owner:node).
  const moverAt = new Map<string, string>();
  for (const p of pieces) {
    if (movable.has(p.id) && p.state.kind === 'ON_BOARD') moverAt.set(`${p.owner}:${p.state.node}`, p.id);
  }
  const keyOf = (s: Stack) => `${s.head.owner}:${s.node}`;
  const targetNodes = stacks.filter((s) => moverAt.has(keyOf(s))).map((s) => s.node);

  return (
    <div className="absolute top-[215px] left-[395px] size-[650px]">
      <div className="absolute top-[23px] left-[23px] size-[604px] rounded-[30px] border border-bronze bg-gradient-to-b from-[#20334c] via-[#14263d] via-55% to-[#102035] shadow-[0_16px_40px_rgba(0,0,0,0.25)]" />
      <div className="absolute top-[34px] left-[34px] size-[582px] rounded-[24px] border border-[rgba(180,155,105,0.31)]" />
      <div className="absolute top-[49px] left-[49px] size-[552px] rounded-[18px] border border-[rgba(180,155,105,0.13)]" />
      <img alt="" src={boardRingOuter} className="absolute top-[248px] left-[248px] size-[154px]" />
      <img alt="" src={boardRingInner} className="absolute top-[263px] left-[263px] size-[124px]" />
      <img alt="" src={boardKnot} className="absolute top-[265px] left-[265px] size-[120px]" />
      <img alt="" src={boardOuterPath} className="absolute top-[80px] left-[80px] size-[490px]" />
      <div className="absolute top-[80px] left-[80px] size-[490px]">
        <img alt="" src={boardDiagonals} className="absolute inset-[-0.11%] block size-[100.22%] max-w-none" />
      </div>

      {NODES.map((n) => {
        const size = isBigNode(n.id) ? 48 : 26;
        return (
          <img
            key={n.id}
            alt=""
            src={size === 48 ? nodeCorner : nodeSmall}
            className="absolute"
            style={{ left: n.x - size / 2, top: n.y - size / 2, width: size, height: size }}
          />
        );
      })}

      <p className="absolute top-[362px] left-[325px] w-[60px] -translate-x-1/2 text-center font-serif text-[12px] text-gold">한가운데</p>
      <p className="absolute top-[111px] left-[325px] w-[156px] -translate-x-1/2 text-center font-serif text-[13px] text-[#a18d66]">달빛이 머무는 길</p>
      <p className="absolute top-[603px] left-[567px] w-[118px] -translate-x-1/2 text-center text-[11px] text-gold">출발 · 골인 ↗</p>

      {targetNodes.map((node) => {
        const p = NODE_POSITIONS[node];
        return p ? <img key={`t${node}`} alt="" src={moveTarget} className="absolute size-[40px]" style={{ left: p.x - 20, top: p.y - 20 }} /> : null;
      })}

      {marks.traps.map((node) => (
        <NodeTag key={`trap${node}`} node={node} text="함정" className="border-[#d87b73] text-[#f29b92]" />
      ))}
      {marks.blocks.map((node) => (
        <NodeTag key={`block${node}`} node={node} text="차단" className="border-[#c7a4f5] text-[#c7a4f5]" />
      ))}

      {targeting &&
        [...targeting.nodes].map((node) => {
          const p = NODE_POSITIONS[node];
          return p ? (
            <button
              key={`pick${node}`}
              type="button"
              aria-label={`${node}번 칸`}
              onClick={() => targeting.onNode(node)}
              className="absolute z-10 size-[34px] cursor-pointer rounded-full border-2 border-dashed border-gold-light bg-[rgba(244,215,156,0.12)] hover:bg-[rgba(244,215,156,0.35)]"
              style={{ left: p.x - 17, top: p.y - 17 }}
            />
          ) : null;
        })}

      {stacks.map((s) => {
        const pick = targeting ? s.members.find((m) => targeting.pieces.has(m.id)) : undefined;
        const tag = s.members.map((m) => marks.tags.get(m.id)).find(Boolean);
        return (
          <PieceToken
            key={s.head.id}
            stack={s}
            color={colorOf(s.head.owner)}
            clickable={targeting ? pick !== undefined : moverAt.has(keyOf(s))}
            picking={pick !== undefined}
            tag={tag}
            onHover={(on) => setHovered(on ? (moverAt.get(keyOf(s)) ?? null) : null)}
            onClick={() => {
              setHovered(null);
              if (targeting) {
                if (pick) targeting.onPiece(pick.id);
                return;
              }
              const mover = moverAt.get(keyOf(s));
              if (mover) onPiece(mover);
            }}
          />
        );
      })}

      {moved && !preview && <MovedMark {...moved} />}
      {preview && <PreviewMarks preview={preview} />}

      <WaitingColumn
        waiting={waiting}
        color={myColor}
        canEnter={targeting ? waiting.some((p) => targeting.pieces.has(p.id)) : canEnter}
        onHover={(id) => !targeting && setHovered(id)}
        onEnter={() => {
          setHovered(null);
          const waitingPick = targeting && waiting.find((p) => targeting.pieces.has(p.id));
          if (targeting) {
            if (waitingPick) targeting.onPiece(waitingPick.id);
            return;
          }
          onEnter();
        }}
      />
    </div>
  );
}

const GREEN = '#74c7ae';

function pointOf(node: NodeId | null): { x: number; y: number } {
  // A waiting piece enters from the start node.
  return NODE_POSITIONS[node ?? HOME] ?? { x: 0, y: 0 };
}

/** Dashed route, green landing ring, click hint and caption for a hovered piece. */
function PreviewMarks({ preview }: { preview: Preview }) {
  const finished = preview.landing === 'FINISHED';
  const start = pointOf(preview.from);
  const end = pointOf(finished ? HOME : (preview.landing as { node: NodeId }).node);
  const points = [start, ...preview.route.map(pointOf)].map((p) => `${p.x},${p.y}`).join(' ');
  const hintX = Math.min(Math.max(end.x, 160), 490);
  const hintY = end.y > 470 ? end.y - 80 : end.y + 44;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <svg className="absolute inset-0" width={650} height={650}>
        <polyline points={points} fill="none" stroke={GREEN} strokeWidth={3} strokeDasharray="7 7" strokeLinecap="round" />
      </svg>
      <div className="absolute" style={{ left: end.x - 24, top: end.y - 24 }}>
        <div className="flex size-[48px] items-center justify-center rounded-full border-[3px] border-green bg-[rgba(116,199,174,0.25)] shadow-[0_0_18px_rgba(116,199,174,0.6)]">
          <div className="size-[14px] rounded-full bg-green" />
        </div>
      </div>
      <p
        className="absolute flex h-[36px] w-[250px] -translate-x-1/2 items-center justify-center rounded-[6px] border border-green bg-[rgba(17,52,52,0.92)] text-[13px] font-bold text-[#a8e6d2]"
        style={{ left: hintX, top: hintY }}
      >
        {finished ? '클릭하면 골인' : '클릭하면 이 칸으로 이동'}
      </p>
      <p
        className="absolute -translate-x-1/2 rounded-full border border-[rgba(116,199,174,0.5)] bg-[rgba(17,29,48,0.95)] px-[10px] py-[3px] text-[11px] whitespace-nowrap text-green"
        style={{ left: start.x, top: start.y - 46 }}
      >
        {preview.label}
      </p>
    </div>
  );
}

/** Green ring and caption on the piece that just moved. */
function MovedMark({ node, text }: { node: NodeId; text: string }) {
  const p = pointOf(node);
  return (
    <div className="pointer-events-none absolute z-20" style={{ left: p.x - 26, top: p.y - 26 }}>
      <div className="size-[52px] rounded-full border-[3px] border-green shadow-[0_0_18px_rgba(116,199,174,0.6)]" />
      <p className="absolute top-[78px] left-1/2 -translate-x-1/2 rounded-full border border-[rgba(116,199,174,0.5)] bg-[rgba(17,52,52,0.6)] px-[10px] py-[3px] text-[12px] whitespace-nowrap text-green">
        {text}
      </p>
    </div>
  );
}

interface WaitingColumnProps {
  waiting: Piece[];
  color: PieceColor;
  canEnter: boolean;
  onHover: (pieceId: string | null) => void;
  onEnter: () => void;
}

/** My pieces not yet on the board; click one to enter it. */
function WaitingColumn({ waiting, color, canEnter, onHover, onEnter }: WaitingColumnProps) {
  const meta = COLOR_META[color];
  return (
    <div className="absolute top-[102px] left-[637px] flex w-[38px] flex-col items-center gap-[5px]">
      <p className="text-center text-[11px] leading-[16px] text-dim">
        대기 말
        <br />
        <span className="text-[12px] font-bold text-ink">{waiting.length}개</span>
      </p>
      {waiting.map((piece) => (
        <motion.button
          key={piece.id}
          type="button"
          disabled={!canEnter}
          onClick={onEnter}
          onHoverStart={() => canEnter && onHover(piece.id)}
          onHoverEnd={() => onHover(null)}
          whileHover={canEnter ? { scale: 1.12 } : undefined}
          className={`relative size-[38px] ${canEnter ? 'cursor-pointer' : 'cursor-default opacity-60'}`}
        >
          {canEnter && <img alt="" src={moveTarget} className="absolute top-[-1px] left-[-1px] size-[40px] max-w-none" />}
          <PieceImage meta={meta} />
        </motion.button>
      ))}
    </div>
  );
}

function PieceImage({ meta }: { meta: (typeof COLOR_META)[PieceColor] }) {
  return (
    <>
      <img alt="" src={meta.glow} className="absolute top-[-4px] left-[-4px] size-[46px] max-w-none" />
      <span className="absolute inset-[-13.16%_-23.68%_-34.21%_-23.68%]">
        <img alt="" src={meta.piece} className="block size-full max-w-none" />
      </span>
      <img alt="" src={meta.mark} className="absolute top-[10px] left-[10px] size-[18px]" />
    </>
  );
}

/** Small label under a node (trap, block). */
function NodeTag({ node, text, className }: { node: NodeId; text: string; className: string }) {
  const p = pointOf(node);
  return (
    <span
      className={`pointer-events-none absolute z-10 -translate-x-1/2 rounded-full border bg-[rgba(17,29,48,0.95)] px-[6px] text-[10px] font-bold ${className}`}
      style={{ left: p.x, top: p.y + 14 }}
    >
      {text}
    </span>
  );
}

interface PieceTokenProps {
  stack: Stack;
  color: PieceColor;
  clickable: boolean;
  /** Highlighted as an augment target. */
  picking: boolean;
  tag: string | undefined;
  onHover: (on: boolean) => void;
  onClick: () => void;
}

function PieceToken({ stack, color, clickable, picking, tag, onHover, onClick }: PieceTokenProps) {
  const meta = COLOR_META[color];
  const p = NODE_POSITIONS[stack.node] ?? { x: 0, y: 0 };
  return (
    <motion.button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      onHoverStart={() => onHover(true)}
      onHoverEnd={() => onHover(false)}
      initial={false}
      animate={{ left: p.x - 19 + stack.offset, top: p.y - 19 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      whileHover={clickable ? { scale: 1.12 } : undefined}
      className={`absolute size-[38px] ${clickable ? 'z-10 cursor-pointer' : 'cursor-default'}`}
    >
      {picking && <span className="absolute inset-[-6px] rounded-full border-2 border-dashed border-gold-light" />}
      <PieceImage meta={meta} />
      {tag && (
        <span className="absolute top-[34px] left-1/2 -translate-x-1/2 rounded-full border border-[#d87b73] bg-[rgba(17,29,48,0.95)] px-[5px] text-[9px] font-bold whitespace-nowrap text-[#f29b92]">
          {tag}
        </span>
      )}
      {stack.size > 1 && (
        <span
          className="absolute top-[-7px] left-[24px] flex size-[22px] items-center justify-center rounded-full border-2 bg-ink text-[12px] font-bold text-[#182132]"
          style={{ borderColor: meta.hex }}
        >
          {stack.size}
        </span>
      )}
    </motion.button>
  );
}
