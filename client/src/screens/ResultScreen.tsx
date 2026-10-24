import { augmentById, standings, type GameState, type Player, type RoomView, type Seat } from '@yut/shared';
import clock from '../assets/figma/clock.svg';
import crownLg from '../assets/figma/crown-lg.svg';
import crownSm from '../assets/figma/crown-sm.svg';
import dicesMuted from '../assets/figma/dices-muted.svg';
import goalEmpty from '../assets/figma/goal-empty.svg';
import logOutGold from '../assets/figma/log-out-gold.svg';
import rotateCcw from '../assets/figma/rotate-ccw.svg';
import swordsMuted from '../assets/figma/swords-muted.svg';
import victoryHalo from '../assets/figma/victory-halo.svg';
import { TIER_META } from '../augmentMeta';
import { COLOR_META } from '../colors';
import { useGame } from '../store';
import { Frame } from '../ui/Frame';
import { Emblem, GoldButton, OutlineButton, Pill } from '../ui/parts';

/** Flavor line under each name, by rank (from the design). */
const RANK_LINES = ['완벽한 마무리', '끝까지 멋진 승부', '빛났던 한 수', '다음 판의 주인공'];

function duration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}분 ${total % 60}초`;
}

export function ResultScreen({ room, game }: { room: RoomView; game: GameState }) {
  const { me, backToLobby, leaveRoom } = useGame();
  const ranked = standings(game);
  const winner = room.seats.find((s) => s.id === game.winner);
  const totalCaptures = game.players.reduce((sum, p) => sum + p.captures, 0);
  const elapsed = room.startedAt && room.finishedAt ? room.finishedAt - room.startedAt : 0;

  return (
    <Frame section="대전 결과" roomCode={room.code} footer="첫 4말 골인으로 대전 종료 · 이후 순위는 골인 수와 이동 거리 기준">
      <img alt="" src={victoryHalo} className="absolute top-[80px] left-[360px] h-[440px] w-[720px]" />

      <section className="absolute top-[126px] left-[300px] flex w-[840px] flex-col items-center gap-[15px]">
        <div className="flex items-center gap-[18px]">
          <div className="h-px w-[92px] bg-bronze" />
          <img alt="" src={crownLg} className="size-[35px]" />
          <div className="h-px w-[92px] bg-bronze" />
        </div>
        <h1 className="text-center font-serif text-[40px] font-semibold text-gold-light">{winner?.name}, 장원의 자리에!</h1>
        <p className="text-[15px] text-mist">네 개의 말을 모두 골인시켰어요. 멋진 한 판이었습니다.</p>
      </section>

      {/* Centered so two or three players still sit in the middle. */}
      <div className="absolute top-[306px] left-0 flex w-[1440px] items-end justify-center gap-[24px]">
        {ranked.map((player, rank) => {
          const seat = room.seats.find((s) => s.id === player.id);
          return seat ? <RankCard key={player.id} rank={rank} player={player} seat={seat} game={game} isMe={player.id === me} /> : null;
        })}
      </div>

      <div className="absolute top-[788px] left-[358px] flex w-[724px] items-center justify-between">
        <Stat icon={clock} label="대전 시간" value={duration(elapsed)} />
        <Stat icon={dicesMuted} label="총 던지기" value={`${game.throwCount}회`} />
        <Stat icon={swordsMuted} label="역전의 순간" value={`말 잡기 ${totalCaptures}회`} />
      </div>

      <div className="absolute top-[852px] left-[460px] flex gap-[16px]">
        <GoldButton icon={rotateCcw} className="h-[56px] w-[252px]" onClick={backToLobby}>
          다시 하기
        </GoldButton>
        <OutlineButton icon={logOutGold} className="h-[56px] w-[252px]" onClick={leaveRoom}>
          나가기
        </OutlineButton>
      </div>
    </Frame>
  );
}

interface RankCardProps {
  rank: number;
  player: Player;
  seat: Seat;
  game: GameState;
  isMe: boolean;
}

function RankCard({ rank, player, seat, game, isMe }: RankCardProps) {
  const meta = COLOR_META[seat.color];
  const first = rank === 0;
  const own = game.pieces.filter((p) => p.owner === player.id);
  const finished = own.filter((p) => p.state.kind === 'FINISHED').length;

  return (
    <div
      className={`flex w-[300px] flex-col items-center gap-[18px] rounded-[22px] p-[22px] ${
        first
          ? 'min-h-[448px] border-[1.5px] border-gold bg-gradient-to-b from-[#3b342b] via-[#1e2a3b] via-40% to-[#142239] shadow-[0_0_24px_rgba(221,182,108,0.21)]'
          : 'min-h-[424px] border border-line bg-panel shadow-[0_16px_40px_rgba(0,0,0,0.25)]'
      }`}
    >
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-[7px]">
          {first && <img alt="" src={crownSm} className="size-[23px]" />}
          <p className={`font-serif text-[26px] font-bold ${first ? 'text-gold-light' : 'text-mist'}`}>{rank + 1}등</p>
        </div>
        {isMe && <Pill>나</Pill>}
      </div>
      <Emblem color={seat.color} size={68} />
      <div className="flex flex-col items-center gap-[7px]">
        <p className="text-[21px] font-bold text-ink">{seat.name}</p>
        <p className={`text-[12px] ${first ? 'text-gold' : 'text-dim'}`}>{RANK_LINES[rank]}</p>
      </div>
      <div className="flex items-center gap-[6px]">
        {own.map((p, i) => (
          <img key={p.id} alt="" src={i < finished ? meta.goal : goalEmpty} className="size-[11px]" />
        ))}
        <p className="text-[13px] font-bold text-mist">
          골인 {finished} / {own.length}
        </p>
      </div>
      <div className={`h-px w-full ${first ? 'bg-[rgba(217,184,120,0.25)]' : 'bg-line-soft'}`} />
      <div className="flex w-full flex-col gap-[12px]">
        <div className="flex justify-between text-[11px]">
          <p className="text-dim">함께한 증강</p>
          <p className="text-mist">잡기 {player.captures}회</p>
        </div>
        <HeldAugments augmentIds={[...player.augmentIds, ...player.retired]} />
      </div>
    </div>
  );
}

/** Augments the player held at the end, three per row with their names. */
function HeldAugments({ augmentIds }: { augmentIds: string[] }) {
  if (augmentIds.length === 0) return <p className="py-[10px] text-center text-[11px] text-dim">고른 증강이 없어요</p>;
  return (
    <div className="grid grid-cols-3 gap-x-[8px] gap-y-[10px]">
      {augmentIds.map((id) => {
        const augment = augmentById(id);
        const tier = augment ? TIER_META[augment.rarity] : null;
        return (
          <div key={id} className="flex flex-col items-center gap-[5px]" title={augment?.description}>
            <div
              className="flex size-[32px] items-center justify-center rounded-[8px] border bg-slot"
              style={{ borderColor: tier?.border }}
            >
              {tier && <img alt="" src={tier.icon} className="size-[16px]" />}
            </div>
            <p className="w-full truncate text-center text-[10px] text-mist">{augment?.name ?? id}</p>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-[10px]">
      <img alt="" src={icon} className="size-[18px]" />
      <p className="text-[12px] text-dim">{label}</p>
      <p className="text-[13px] text-mist">{value}</p>
    </div>
  );
}
