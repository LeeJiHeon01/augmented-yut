import { create } from 'zustand';
import { CHAOS_MIX, effectVolume, stingVolume, type Effect, type Loop, type Outcome } from './audioCues';

/** Background loops (docs/audio/bgm_README.md). */
const LOOPS = {
  lobby: 'bgm/01_main_lobby_gugak_loop.wav',
  game: 'bgm/02_game_gugak_electro_loop.wav',
  augment: 'bgm/03_augment_selection_mystic_loop.wav',
} as const;

/** One-shot music cues. */
const STINGS = {
  chaos: 'bgm/04_chaos_event_sting.wav',
  victory: 'bgm/05_victory_fanfare.wav',
} as const;

/** Result cues: fanfare for the winner, a short defeat cue for everyone else. */
const OUTCOMES: Record<Outcome, string | null> = {
  victory: STINGS.victory,
  defeat: 'bgm/06_defeat_fanfare.mp3',
};

/** Sound effects (docs/audio/sfx_README.md). */
const EFFECTS = {
  throw: 'sfx/01_yut_throw.wav',
  move: 'sfx/02_piece_move.wav',
  capture: 'sfx/03_capture.wav',
  finish: 'sfx/04_finish.wav',
  augment: 'sfx/05_augment_activate.wav',
  chaos: 'sfx/06_chaos_event.wav',
} as const;

export type Sting = keyof typeof STINGS;
export type { Effect, Loop, Outcome };

const FADE_MS = 600;
/** BGM level while a chaos sting plays. */
const DUCK_LEVEL = 0.3;
const SETTINGS_KEY = 'yut-audio';

interface AudioSettings {
  muted: boolean;
  /** 0-1 */
  bgm: number;
  /** 0-1 */
  sfx: number;
}

const DEFAULTS: AudioSettings = { muted: false, bgm: 0.4, sfx: 0.8 };

function loadSettings(): AudioSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    return saved ? { ...DEFAULTS, ...(JSON.parse(saved) as Partial<AudioSettings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

interface AudioStore extends AudioSettings {
  set: (patch: Partial<AudioSettings>) => void;
}

/** Volume and mute, remembered in this browser. */
export const useAudioSettings = create<AudioStore>((set, get) => ({
  ...loadSettings(),
  set: (patch) => {
    set(patch);
    const { muted, bgm, sfx } = get();
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ muted, bgm, sfx }));
    } catch {
      // Storage blocked: settings last for this visit only.
    }
    applyLevels();
  },
}));

const url = (path: string) => `${import.meta.env.BASE_URL}audio/${path}`;
const settings = () => useAudioSettings.getState();

/** Browsers block sound until the first click or key press. */
let unlocked = false;
let wanted: Loop | null = null;
let current: { loop: Loop; el: HTMLAudioElement } | null = null;
let duck = 1;
let duckTimer: ReturnType<typeof setTimeout> | null = null;

function bgmLevel(): number {
  const s = settings();
  return s.muted ? 0 : s.bgm * duck;
}

function applyLevels(): void {
  if (current) current.el.volume = bgmLevel();
}

/** Fade an element's volume to `to`, then run `done`. */
function fade(el: HTMLAudioElement, to: number, done?: () => void): void {
  const from = el.volume;
  const start = performance.now();
  const step = () => {
    const t = Math.min(1, (performance.now() - start) / FADE_MS);
    el.volume = from + (to - from) * t;
    if (t < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}

function startLoop(loop: Loop): void {
  const el = new Audio(url(LOOPS[loop]));
  el.loop = true;
  el.volume = 0;
  void el.play().catch(() => undefined);
  fade(el, bgmLevel());
  current = { loop, el };
}

/** Crossfade to a background loop, or fade out with null. */
export function setLoop(loop: Loop | null): void {
  wanted = loop;
  if (!unlocked || current?.loop === loop) return;
  const old = current;
  current = null;
  if (old) fade(old.el, 0, () => old.el.pause());
  if (loop) startLoop(loop);
}

function playOnce(path: string, volume: number): void {
  if (!unlocked || volume <= 0) return;
  const el = new Audio(url(path));
  el.volume = Math.min(1, volume);
  void el.play().catch(() => undefined);
}

export function playEffect(effect: Effect, scale = 1): void {
  playOnce(EFFECTS[effect], effectVolume(settings(), scale));
}

/** A music cue over the loop; the loop is lowered while it plays. */
export function playSting(sting: Sting, duckMs = 2500, scale = 1): void {
  playCue(STINGS[sting], duckMs, scale);
}

/** Chaos: sting and effect together, each lowered (CHAOS_MIX). */
export function playChaos(): void {
  playEffect('chaos', CHAOS_MIX.effect);
  playSting('chaos', 2500, CHAOS_MIX.sting);
}

/** Result screen cue: victory fanfare for the winner, defeat cue for the others. */
export function playOutcome(outcome: Outcome): void {
  const path = OUTCOMES[outcome];
  if (path) playCue(path, 0, 1);
}

function playCue(path: string, duckMs: number, scale: number): void {
  playOnce(path, stingVolume(settings(), scale));
  duck = DUCK_LEVEL;
  applyLevels();
  if (duckTimer) clearTimeout(duckTimer);
  duckTimer = setTimeout(() => {
    duck = 1;
    if (current) fade(current.el, bgmLevel());
  }, duckMs);
}

function unlock(): void {
  if (unlocked) return;
  unlocked = true;
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
  if (wanted) startLoop(wanted);
}

window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);
