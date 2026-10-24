import { MAX_SEATS, MIN_PLAYERS, PIECE_COLORS, type PieceColor, type RoomView, type Seat } from '@yut/shared';
import copy from '../assets/figma/copy.svg';
import link from '../assets/figma/link.svg';
import logOut from '../assets/figma/log-out.svg';
import play from '../assets/figma/play.svg';
import sparkles from '../assets/figma/sparkles.svg';
import userPlus from '../assets/figma/user-plus.svg';
import { COLOR_META } from '../colors';
import { formatCode, ordinal } from '../format';
import { useGame } from '../store';
import { Frame } from '../ui/Frame';
import { CheckIcon, Emblem, GoldButton, Pill } from '../ui/parts';

const COUNT_WORD = ['', '한', '두', '세', '네'];

function inviteLink(code: string): string {
  return `${window.location.origin}${window.location.pathname}?room=${code}`;
}

function copyText(text: string): void {
  void navigator.clipboard?.writeText(text).catch(() => undefined);
}

export function LobbyScreen({ room }: { room: RoomView }) {
  const { me, setColor, startGame, leaveRoom, error } = useGame();
  const host = room.seats.find((s) => s.id === room.hostId);
  const mine = room.seats.find((s) => s.id === me);
  const missing = Math.max(0, MIN_PLAYERS - room.seats.length);
  const isHost = me === room.hostId;
  const canStart = isHost && missing === 0;

  let startNote = '방장 전용 · 지금 시작할 수 있어요';
  if (missing > 0) startNote = `방장 전용 · ${COUNT_WORD[missing]} 명의 친구를 더 기다리고 있어요`;

  return (
    <Frame section="대기실" roomCode={room.code} footer="말 색상은 게임 시작 전까지 바꿀 수 있어요">
      <section className="absolute top-[137px] left-[64px] flex w-[770px] flex-col items-start gap-[14px]">
        <Pill>친구 대전 · 2~4인</Pill>
        <div className="flex items-center gap-[18px]">
          <h1 className="font-serif text-[34px] font-semibold text-ink">{host?.name}의 사랑방</h1>
          <p className="text-[20px] text-gold">
            {room.seats.length} / {MAX_SEATS}
          </p>
        </div>
        <p className="text-[14px] text-mist">친구가 모이면, 운명을 던질 준비가 끝납니다.</p>
      </section>

      <div className="absolute top-[151px] left-[1014px] flex h-[102px] w-[362px] items-center justify-between rounded-[14px] border border-bronze bg-panel p-[20px]">
        <div className="flex flex-col gap-[6px]">
          <p className="text-[12px] text-mist">친구에게 방 코드를 알려주세요</p>
          <p className="text-[29px] font-bold text-gold-light">{formatCode(room.code)}</p>
        </div>
        <button type="button" className="flex flex-col items-center gap-[6px]" onClick={() => copyText(room.code)}>
          <img alt="" src={copy} className="size-[22px]" />
          <span className="text-[12px] text-gold">복사</span>
        </button>
      </div>

      <div className="absolute top-[294px] left-[64px] flex gap-[20px]">
        {Array.from({ length: MAX_SEATS }, (_, i) => {
          const seat = room.seats[i];
          return seat ? (
            <SeatCard
              key={seat.id}
              index={i}
              seat={seat}
              isHost={seat.id === room.hostId}
              isMe={seat.id === me}
            />
          ) : (
            <EmptySeat key={`empty-${i}`} index={i} onInvite={() => copyText(inviteLink(room.code))} />
          );
        })}
      </div>

      <div className="absolute top-[666px] left-[64px] flex gap-[24px]">
        <div className="flex h-[190px] w-[840px] flex-col gap-[18px] rounded-[14px] border border-line bg-panel p-[24px]">
          <div className="flex justify-between">
            <p className="text-[16px] font-bold text-ink">나의 말 색상</p>
            <p className="text-[12px] text-dim">색상마다 고유한 문양이 함께 표시됩니다</p>
          </div>
          <div className="flex gap-[12px]">
            {PIECE_COLORS.map((color) => (
              <ColorOption
                key={color}
                color={color}
                owner={room.seats.find((s) => s.color === color)}
                mine={mine?.color === color}
                onPick={() => setColor(color)}
              />
            ))}
          </div>
        </div>

        <div className="flex h-[190px] w-[448px] flex-col gap-[15px] rounded-[14px] border border-line bg-panel p-[24px]">
          <div className="flex justify-between text-[14px]">
            <p className="text-mist">두 명부터 시작할 수 있어요</p>
            <p className="text-green">{room.seats.length}명 참가</p>
          </div>
          <GoldButton icon={play} className="h-[56px] w-[400px]" disabled={!canStart} onClick={startGame}>
            게임 시작
          </GoldButton>
          <p className={`text-center text-[12px] ${error ? 'text-red' : 'text-dim'}`}>{error ?? startNote}</p>
        </div>
      </div>

      <div className="absolute top-[886px] left-[64px] flex w-[1312px] justify-between">
        <div className="flex items-center gap-[9px]">
          <img alt="" src={sparkles} className="size-[16px]" />
          <p className="text-[12px] text-mist">말 4개 먼저 골인 · 증강 최대 6개 · 개인전</p>
        </div>
        <button type="button" className="flex items-center gap-[7px]" onClick={leaveRoom}>
          <img alt="" src={logOut} className="size-[16px]" />
          <span className="text-[13px] text-dim">방 나가기</span>
        </button>
      </div>
    </Frame>
  );
}

interface SeatCardProps {
  index: number;
  seat: Seat;
  isHost: boolean;
  isMe: boolean;
}

function SeatCard({ index, seat, isHost, isMe }: SeatCardProps) {
  const meta = COLOR_META[seat.color];
  return (
    <div
      className={`flex h-[340px] w-[313px] flex-col items-center gap-[18px] rounded-[22px] border bg-panel p-[24px] shadow-[0_16px_40px_rgba(0,0,0,0.25)] ${isMe ? 'border-bronze' : 'border-line'}`}
    >
      <div className="flex h-[25px] w-full items-center justify-between">
        <p className="text-[12px] text-dim">{ordinal(index + 1)} 번째 자리</p>
        {isHost && <Pill>방장</Pill>}
      </div>
      <Emblem color={seat.color} size={84} />
      <div className="flex flex-col items-center gap-[8px]">
        <p className="text-[21px] font-bold text-ink">{seat.name}</p>
        <p className="text-[13px]" style={{ color: meta.hex }}>
          {meta.label} 말{isMe && ' · 나'}
        </p>
      </div>
    </div>
  );
}

function EmptySeat({ index, onInvite }: { index: number; onInvite: () => void }) {
  return (
    <div className="flex h-[340px] w-[313px] flex-col items-center gap-[18px] rounded-[22px] border border-line bg-[rgba(16,28,46,0.5)] p-[24px]">
      <div className="flex h-[25px] w-full items-center">
        <p className="text-[12px] text-dim">{ordinal(index + 1)} 번째 자리</p>
      </div>
      <div className="flex size-[84px] items-center justify-center rounded-full border border-dashed border-line">
        <img alt="" src={userPlus} className="size-[28px]" />
      </div>
      <div className="flex flex-col items-center gap-[8px]">
        <p className="text-[21px] font-bold text-mist">대기 중</p>
        <p className="text-[13px] text-dim">친구를 초대해 주세요</p>
      </div>
      <div className="h-px w-full bg-line-soft" />
      <button type="button" className="flex h-[36px] items-center justify-center gap-[8px]" onClick={onInvite}>
        <img alt="" src={link} className="size-[16px]" />
        <span className="text-[13px] text-dim">초대 링크 복사</span>
      </button>
    </div>
  );
}

interface ColorOptionProps {
  color: PieceColor;
  owner: Seat | undefined;
  mine: boolean;
  onPick: () => void;
}

function ColorOption({ color, owner, mine, onPick }: ColorOptionProps) {
  const meta = COLOR_META[color];
  const taken = owner !== undefined && !mine;
  const status = mine ? '선택됨' : taken ? '사용 중' : '선택 가능';
  return (
    <button
      type="button"
      disabled={taken || mine}
      onClick={onPick}
      className="flex h-[70px] w-[189px] items-center gap-[10px] rounded-[8px] border p-[14px] text-left enabled:hover:border-bronze disabled:cursor-default"
      style={mine ? { background: meta.soft, borderColor: meta.hex } : { background: '#0d192c', borderColor: '#34435a' }}
    >
      <img alt="" src={meta.dot} className="size-[22px]" />
      <span className="flex flex-col gap-[4px]">
        <span className="text-[13px] text-ink">{meta.label}</span>
        <span className="text-[11px]" style={{ color: mine ? meta.hex : '#7f90aa' }}>
          {status}
        </span>
      </span>
      {mine && <CheckIcon color={meta.hex} />}
    </button>
  );
}
