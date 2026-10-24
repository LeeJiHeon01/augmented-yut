import { useState, type ReactNode } from 'react';
import circleHelp from '../assets/figma/circle-help.svg';
import dotOnline from '../assets/figma/dot-online.svg';
import knotBrand from '../assets/figma/knot-brand.svg';
import nightGarden from '../assets/figma/night-garden.svg';
import settings from '../assets/figma/settings.svg';
import volume from '../assets/figma/volume.svg';
import { useAudioSettings } from '../audio';
import { formatCode } from '../format';
import { useGame } from '../store';

interface FrameProps {
  /** Text after the brand divider, e.g. 대기실. */
  section?: string;
  roomCode?: string;
  /** Bottom line; the game screen has none. */
  footer?: string;
  /** Canvas height; the game screen is taller. */
  height?: number;
  children: ReactNode;
}

/** Background, top menu and footer shared by every screen. */
export function Frame({ section, roomCode, footer, height = 1000, children }: FrameProps) {
  const connected = useGame((s) => s.connected);

  return (
    <>
      <img alt="" src={nightGarden} className="absolute top-0 left-0 w-[1440px]" style={{ height }} />

      <header className="absolute top-[28px] left-[48px] flex h-[60px] w-[1344px] items-center justify-between">
        <div className="flex items-center gap-[12px]">
          <img alt="" src={knotBrand} className="size-[38px]" />
          <p className="font-serif text-[25px] font-bold text-ink">증강 윷놀이</p>
          {section && (
            <>
              <div className="h-[20px] w-px bg-line" />
              <p className="text-[14px] text-mist">{section}</p>
            </>
          )}
        </div>
        {/* Help and settings have no feature yet: shown but inactive. */}
        <div className="flex items-center gap-[22px]">
          {roomCode && <p className="text-[13px] text-dim">친구 대전 · {formatCode(roomCode)}</p>}
          <div className="flex cursor-default items-center gap-[7px]" aria-disabled="true">
            <img alt="" src={circleHelp} className="size-[18px]" />
            <p className="text-[13px] text-mist">게임 방법</p>
          </div>
          <SoundButton />
          <img alt="설정" src={settings} className="size-[20px] cursor-default" aria-disabled="true" />
        </div>
      </header>

      {children}

      {footer !== undefined && (
        <footer className="absolute top-[945px] left-[64px] flex h-[24px] w-[1312px] items-center justify-between">
          <p className="text-[12px] text-dim">{footer}</p>
          <div className="flex items-center gap-[8px]">
            <img alt="" src={dotOnline} className={`size-[5px] ${connected ? '' : 'opacity-30 grayscale'}`} />
            <p className="text-[12px] text-dim">{connected ? '서버 연결 양호' : '서버에 연결하는 중…'}</p>
          </div>
        </footer>
      )}
    </>
  );
}

/** Speaker icon: mute and BGM / SFX volume, remembered in this browser. */
function SoundButton() {
  const [open, setOpen] = useState(false);
  const { muted, bgm, sfx, set } = useAudioSettings();
  return (
    <div className="relative">
      <button type="button" aria-label="소리 설정" onClick={() => setOpen(!open)} className="flex cursor-pointer items-center">
        <img alt="" src={volume} className={`size-[20px] ${muted ? 'opacity-40' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-[34px] right-[-12px] z-50 flex w-[230px] flex-col gap-[12px] rounded-[10px] border border-bronze bg-[rgba(17,29,48,0.97)] p-[16px] shadow-[0_16px_40px_rgba(0,0,0,0.4)]">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-bold text-gold-light">소리</p>
            <button
              type="button"
              onClick={() => set({ muted: !muted })}
              className="cursor-pointer rounded-full border border-bronze px-[10px] py-[2px] text-[11px] font-bold text-gold-light"
            >
              {muted ? '음소거 해제' : '음소거'}
            </button>
          </div>
          <VolumeSlider label="배경음악" value={bgm} disabled={muted} onChange={(v) => set({ bgm: v })} />
          <VolumeSlider label="효과음" value={sfx} disabled={muted} onChange={(v) => set({ sfx: v })} />
        </div>
      )}
    </div>
  );
}

function VolumeSlider({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <label className={`flex items-center gap-[10px] text-[12px] text-mist ${disabled ? 'opacity-40' : ''}`}>
      <span className="w-[52px] shrink-0">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full accent-[#d9b878]"
      />
    </label>
  );
}
