import { useState } from 'react';
import alertRed from '../assets/figma/alert-red.svg';
import close from '../assets/figma/close.svg';
import doorOpen from '../assets/figma/door-open.svg';
import hero from '../assets/figma/hero.png';
import knotCard from '../assets/figma/knot-card.svg';
import knotPopup from '../assets/figma/knot-popup.svg';
import lock from '../assets/figma/lock.svg';
import pencil from '../assets/figma/pencil.svg';
import plus from '../assets/figma/plus.svg';
import sparkles from '../assets/figma/sparkles.svg';
import swords from '../assets/figma/swords.svg';
import users from '../assets/figma/users.svg';
import { useGame } from '../store';
import { Frame } from '../ui/Frame';
import { GoldButton, OutlineButton } from '../ui/parts';

const NAME_KEY = 'yut:name';

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Storage may be blocked; the name just is not remembered.
  }
}

/** Room code from an invite link (?room=123456). */
function inviteCode(): string {
  return new URLSearchParams(window.location.search).get('room') ?? '';
}

const FEATURES = [
  { icon: users, text: '최대 4인 실시간 대전' },
  { icon: sparkles, text: '매번 달라지는 증강' },
  { icon: swords, text: '끝까지 짜릿한 역전' },
];

export function MainScreen() {
  const { createRoom, joinRoom, error, clearError } = useGame();
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState(inviteCode);
  const [dialogOpen, setDialogOpen] = useState(() => inviteCode() !== '');
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<{ ok: boolean }>) {
    setBusy(true);
    saveName(name.trim());
    const result = await action();
    setBusy(false);
    if (result.ok) window.history.replaceState(null, '', window.location.pathname);
  }

  return (
    <Frame footer="네 사람의 수, 하나의 운명">
      <section className="absolute top-[156px] left-[80px] flex w-[770px] flex-col gap-[18px]">
        <div className="flex items-center gap-[12px]">
          <div className="h-px w-[32px] bg-gold" />
          <p className="text-[13px] text-gold">달빛 아래, 새로운 한 판</p>
        </div>
        <h1 className="font-serif text-[48px] leading-[1.36] font-semibold text-ink">
          운명을 던지고,
          <br />
          전략을 더하다.
        </h1>
        <p className="text-[16px] leading-[1.8] text-mist">
          익숙한 윷놀이에 더해진 뜻밖의 능력.
          <br />
          친구들과 함께, 나만의 증강으로 판을 뒤집어 보세요.
        </p>
      </section>

      <div className="absolute top-[430px] left-[53px] h-[394px] w-[820px] overflow-hidden rounded-[22px] border border-bronze">
        <img alt="달빛 아래 윷판" src={hero} className="size-full object-cover" />
      </div>

      <ul className="absolute top-[850px] left-[82px] flex items-center gap-[28px]">
        {FEATURES.map((f) => (
          <li key={f.text} className="flex items-center gap-[8px]">
            <img alt="" src={f.icon} className="size-[16px]" />
            <span className="text-[13px] text-mist">{f.text}</span>
          </li>
        ))}
      </ul>

      <form
        className="absolute top-[202px] left-[922px] flex w-[438px] flex-col gap-[26px] rounded-[22px] border border-line bg-panel p-[32px] shadow-[0_16px_40px_rgba(0,0,0,0.25)]"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => createRoom(name));
        }}
      >
        <div className="flex flex-col gap-[11px]">
          <img alt="" src={knotCard} className="size-[40px]" />
          <h2 className="font-serif text-[28px] font-semibold text-ink">한 판, 함께할까요?</h2>
          <p className="text-[14px] leading-[1.7] text-mist">
            이름을 정하고 친구들을 초대하세요.
            <br />
            가입 없이 바로 시작할 수 있어요.
          </p>
        </div>

        <label className="flex flex-col gap-[10px]">
          <span className="text-[13px] font-bold text-mist">닉네임</span>
          <span className="flex h-[58px] items-center justify-between rounded-[8px] border border-bronze bg-field px-[16px]">
            <input
              value={name}
              maxLength={10}
              placeholder="닉네임을 입력하세요"
              onChange={(e) => {
                setName(e.target.value);
                clearError();
              }}
              className="w-full bg-transparent text-[16px] text-ink outline-none placeholder:text-dim"
            />
            <img alt="" src={pencil} className="size-[18px]" />
          </span>
          <span className={`text-[12px] ${error && !dialogOpen ? 'text-red' : 'text-dim'}`}>
            {error && !dialogOpen ? error : '한글·영문·숫자 2~10자'}
          </span>
        </label>

        <div className="flex flex-col gap-[12px]">
          <GoldButton type="submit" icon={plus} disabled={busy} className="h-[56px] w-[374px]">
            방 만들기
          </GoldButton>
          <OutlineButton icon={doorOpen} disabled={busy} className="h-[56px] w-[374px]" onClick={() => setDialogOpen(true)}>
            코드로 입장
          </OutlineButton>
        </div>

        <div className="flex items-center gap-[10px] pt-[8px]">
          <img alt="" src={lock} className="size-[17px]" />
          <p className="text-[12px] leading-[1.7] text-dim">방 코드를 아는 친구만 입장할 수 있어요.</p>
        </div>
      </form>

      {dialogOpen && (
        <JoinDialog
          code={code}
          error={error}
          busy={busy}
          onCode={(value) => {
            setCode(value);
            clearError();
          }}
          onCancel={() => {
            setDialogOpen(false);
            clearError();
          }}
          onJoin={() => void run(() => joinRoom(code, name))}
        />
      )}
    </Frame>
  );
}

interface JoinDialogProps {
  code: string;
  error: string | null;
  busy: boolean;
  onCode: (code: string) => void;
  onCancel: () => void;
  onJoin: () => void;
}

/** Server message for an unknown room code. */
const WRONG_CODE = '잘못된 방 코드예요';

/** Popup asking for the six-digit room code. */
function JoinDialog({ code, error, busy, onCode, onCancel, onJoin }: JoinDialogProps) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[rgba(3,8,22,0.72)]">
      <form
        className="flex h-[464px] w-[520px] flex-col gap-[24px] rounded-[24px] border border-bronze bg-[rgba(17,29,48,0.97)] p-[36px] shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
        onSubmit={(e) => {
          e.preventDefault();
          onJoin();
        }}
      >
        <div className="flex h-[32px] items-center justify-between">
          <img alt="" src={knotPopup} className="size-[32px]" />
          <button type="button" aria-label="닫기" onClick={onCancel} className="size-[32px] cursor-pointer">
            <img alt="" src={close} className="size-[32px]" />
          </button>
        </div>
        <div className="flex flex-col gap-[8px]">
          <h2 className="font-serif text-[28px] leading-[42px] font-semibold text-ink">코드로 입장</h2>
          <p className="text-[14px] leading-[24px] text-mist">친구에게 받은 방 코드로 한 판을 함께하세요.</p>
        </div>
        <label className="flex flex-col gap-[10px]">
          <span className="flex justify-between leading-[20px]">
            <span className="text-[13px] font-bold text-mist">방 코드</span>
            <span className="text-[12px] text-dim">숫자 6자리</span>
          </span>
          <span
            className={`flex h-[64px] items-center justify-between rounded-[8px] border-[1.5px] bg-field px-[20px] ${error ? 'border-[#d87b73]' : 'border-gold'}`}
          >
            <input
              autoFocus
              inputMode="numeric"
              value={code}
              maxLength={6}
              placeholder="6자리 방 코드 입력"
              onChange={(e) => onCode(e.target.value.replace(/\D/g, ''))}
              className="w-full bg-transparent text-[24px] font-bold text-ink outline-none placeholder:text-[16px] placeholder:font-normal placeholder:text-dim"
            />
            {error && <img alt="" src={alertRed} className="size-[20px] shrink-0" />}
          </span>
          {error ? (
            <span className="h-[40px] text-[13px] leading-[20px] text-[#f29b92]">
              {error}.
              {error === WRONG_CODE && (
                <>
                  <br />
                  코드를 다시 확인하고 입력해 주세요.
                </>
              )}
            </span>
          ) : (
            <span className="h-[40px] text-[13px] leading-[20px] text-dim">친구에게 받은 숫자 6자리를 입력해 주세요.</span>
          )}
        </label>
        <div className="flex gap-[12px]">
          <OutlineButton className="h-[56px] w-[140px]" onClick={onCancel}>
            취소
          </OutlineButton>
          <GoldButton type="submit" className="h-[56px] flex-1" disabled={busy || code.length !== 6}>
            입장
          </GoldButton>
        </div>
      </form>
    </div>
  );
}
