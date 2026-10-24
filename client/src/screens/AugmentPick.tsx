import { useState } from 'react';
import { augmentById, MAX_AUGMENTS, type Draft, type DraftOffer } from '@yut/shared';
import hourglassGold from '../assets/figma/hourglass-gold.svg';
import knotPopup from '../assets/figma/knot-popup.svg';
import reroll from '../assets/figma/reroll.svg';
import { KIND_LABEL, TIER_META } from '../augmentMeta';
import { formatClock } from '../format';

interface AugmentPickProps {
  draft: Draft;
  offer: DraftOffer;
  secondsLeft: number;
  /** Players who already picked, and how many pick in total. */
  pickedCount: number;
  playerCount: number;
  /** My current augments; with six, a pick swaps one out. */
  owned: string[];
  onPick: (augmentId: string, replace?: string) => void;
  onPass: () => void;
  onReroll: (slot: number) => void;
}

/** Draft overlay: three candidates of one rarity, a reroll under each card, 20 second limit. */
export function AugmentPick(props: AugmentPickProps) {
  const { draft, offer, secondsLeft, pickedCount, playerCount, owned, onPick, onPass, onReroll } = props;
  const tier = TIER_META[draft.rarity];
  const done = offer.picked !== null || offer.passed;
  const full = owned.length >= MAX_AUGMENTS;
  // With a full hand the card is chosen first, then the augment it replaces.
  const [chosen, setChosen] = useState<string | null>(null);

  return (
    <div className="absolute inset-0 z-40 bg-[rgba(3,8,22,0.72)]">
      <div className="absolute top-[195px] left-[160px] flex h-[769px] w-[1119px] flex-col items-center rounded-[24px] border border-bronze bg-[rgba(17,29,48,0.97)] px-[47px] pt-[36px] shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-[12px]">
          <div className="h-px w-[80px] bg-bronze" />
          <img alt="" src={knotPopup} className="size-[26px]" />
          <p className="text-[13px] text-gold">운명의 선물</p>
          <img alt="" src={knotPopup} className="size-[26px]" />
          <div className="h-px w-[80px] bg-bronze" />
        </div>
        <h2 className="mt-[14px] font-serif text-[40px] font-semibold text-ink">증강을 선택하세요</h2>
        <p className="mt-[6px] text-[14px] text-mist">
          {full ? '증강 6개를 모두 가졌어요. 하나를 바꾸거나 넘길 수 있어요.' : '이번 판의 흐름을 바꿀 단 하나의 힘을 고르세요.'}
        </p>

        <div className="absolute top-[62px] right-[45px] flex h-[45px] w-[209px] items-center justify-center gap-[12px] rounded-[8px] border border-bronze bg-[rgba(8,15,32,0.4)]">
          <img alt="" src={hourglassGold} className="size-[20px]" />
          <p className="text-[12px] text-mist">선택 마감</p>
          <p className={`text-[26px] font-bold ${secondsLeft <= 5 ? 'text-[#f29b92]' : 'text-gold-light'}`}>
            {formatClock(secondsLeft * 1000)}
          </p>
        </div>

        <div className="mt-[34px] flex gap-[25px]">
          {offer.cards.map((id, slot) => {
            const augment = augmentById(id);
            const isChosen = offer.picked === id || (!done && chosen === id);
            const canReroll = !done && (!offer.rerolled[slot] || offer.freeRerolls > 0);
            return (
              <div key={`${slot}-${id}`} className="flex w-[325px] flex-col gap-[13px]">
                <button
                  type="button"
                  disabled={done}
                  onClick={() => (full ? setChosen(id) : onPick(id))}
                  className={`relative flex h-[393px] flex-col items-center rounded-[14px] border-2 px-[24px] pt-[24px] transition enabled:cursor-pointer enabled:hover:-translate-y-[4px] ${
                    done && !isChosen ? 'opacity-40' : ''
                  }`}
                  style={{
                    borderColor: tier.border,
                    background: tier.background,
                    boxShadow: isChosen ? `0 0 32px ${tier.border}` : undefined,
                  }}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="flex items-center gap-[8px] text-[13px] font-bold" style={{ color: tier.color }}>
                      <img alt="" src={tier.icon} className="size-[16px]" />
                      {tier.label}
                    </span>
                    <span className="text-[12px] tracking-[2px]" style={{ color: tier.color }}>
                      {'◆'.repeat(tier.marks)}
                    </span>
                  </div>
                  <div
                    className="mt-[24px] flex size-[115px] items-center justify-center rounded-full border"
                    style={{ borderColor: `${tier.color}44` }}
                  >
                    <div className="flex size-[95px] items-center justify-center rounded-full border" style={{ borderColor: `${tier.color}66` }}>
                      <img alt="" src={tier.icon} className="size-[44px]" />
                    </div>
                  </div>
                  <p className="mt-[22px] font-serif text-[24px] font-semibold text-ink">{augment?.name ?? id}</p>
                  <span
                    className="mt-[12px] rounded-full border px-[10px] py-[3px] text-[11px]"
                    style={{ borderColor: `${tier.color}66`, color: tier.color }}
                  >
                    {augment ? KIND_LABEL[augment.kind] : ''}
                  </span>
                  <p className="mt-[16px] text-center text-[14px] leading-[22px] text-ink">{augment?.description}</p>
                  {isChosen && (
                    <p className="absolute bottom-[22px] text-[13px] font-bold text-green">{done ? '선택 완료' : '교체할 증강을 아래에서 고르세요'}</p>
                  )}
                </button>
                <button
                  type="button"
                  disabled={!canReroll}
                  onClick={() => onReroll(slot)}
                  className="flex h-[43px] items-center justify-center gap-[10px] rounded-[8px] border border-bronze bg-[rgba(217,184,120,0.08)] text-[15px] font-bold text-gold-light transition enabled:cursor-pointer enabled:hover:bg-[rgba(217,184,120,0.14)] disabled:border-transparent disabled:bg-[rgba(52,67,90,0.6)] disabled:text-dim"
                >
                  <img alt="" src={reroll} className={`size-[18px] ${canReroll ? '' : 'opacity-50 grayscale'}`} />
                  {canReroll ? '리롤 · 1회 남음' : '리롤 완료 · 0회'}
                </button>
              </div>
            );
          })}
        </div>

        {full && !done ? (
          <div className="mt-[22px] flex w-full flex-wrap items-center gap-[10px]">
            <p className="mr-[4px] w-full text-[15px] font-bold text-gold-light">
              {chosen ? '바꿀 증강을 고르세요' : '위에서 카드를 먼저 고르세요'}
            </p>
            {owned.map((id) => {
              const augment = augmentById(id);
              const meta = augment ? TIER_META[augment.rarity] : tier;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={!chosen}
                  onClick={() => chosen && onPick(chosen, id)}
                  className="h-[48px] w-[140px] truncate rounded-[10px] border-2 px-[10px] text-[15px] font-bold transition enabled:cursor-pointer enabled:hover:bg-[rgba(217,184,120,0.14)] disabled:opacity-40"
                  style={{ borderColor: meta.border, color: meta.color }}
                >
                  {augment?.name ?? id}
                </button>
              );
            })}
            <button
              type="button"
              onClick={onPass}
              className="h-[48px] shrink-0 cursor-pointer rounded-[10px] border-2 border-line px-[16px] text-[15px] font-bold text-mist hover:text-ink"
            >
              넘기기 · 지금 증강 유지
            </button>
          </div>
        ) : (
          <div className="mt-[36px] flex w-full justify-between">
            <p className="text-[12px] leading-[20px] text-mist">
              {full ? '시간이 끝나면 지금 증강을 그대로 유지해요.' : '시간이 끝나면 무작위로 선택됩니다.'}
              <br />
              증강을 선택하는 동안 대전은 잠시 멈춰요.
            </p>
            {done && (
              <p className="text-[14px] font-bold text-green">
                {offer.passed ? '넘김' : '선택 완료'} · 다른 플레이어를 기다리는 중 ({pickedCount}/{playerCount})
              </p>
            )}
          </div>
        )}
        <p className="mt-[10px] text-[12px] text-dim">카드별 리롤은 증강 선택 회차마다 초기화됩니다.</p>
      </div>
    </div>
  );
}
