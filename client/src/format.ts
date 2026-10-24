import { augmentById, chaosEventById, YUT_STEPS, type GameLogEntry, type YutResult } from '@yut/shared';

export const RESULT_LABEL: Record<YutResult, string> = {
  BACKDO: '빽도',
  DO: '도',
  GAE: '개',
  GEOL: '걸',
  YUT: '윷',
  MO: '모',
};

const COUNT_WORD = ['', '한', '두', '세', '네', '다섯'];
const UNITS = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉'];
const TENS = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔'];

/** Native Korean ordinal prefix: 1 → 첫, 12 → 열두, 20 → 스무. */
export function ordinal(n: number): string {
  if (n === 1) return '첫';
  if (n === 20) return '스무';
  if (n < 1 || n >= 100) return String(n);
  return `${TENS[Math.floor(n / 10)]}${UNITS[n % 10]}`;
}

export function turnLabel(turnNumber: number): string {
  return `${ordinal(turnNumber)} 번째 차례`;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

export function formatCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/** Result chip text with signed steps: 걸 +3, 빽도 -1. */
export function chipLabel(result: YutResult): string {
  const steps = YUT_STEPS[result];
  return `${RESULT_LABEL[result]} ${steps > 0 ? '+' : ''}${steps}`;
}

/** Step count as a native Korean word: 걸 → 세. */
export function stepsWord(result: YutResult): string {
  return COUNT_WORD[Math.abs(YUT_STEPS[result])] ?? '';
}

/** Steps as words: 세 칸 이동, 한 칸 뒤로. */
export function stepsText(result: YutResult): string {
  return YUT_STEPS[result] < 0 ? '한 칸 뒤로' : `${stepsWord(result)} 칸 이동`;
}

const augmentName = (id: string) => augmentById(id)?.name ?? id;

/** What using an active augment does, for the log. */
const USE_EFFECT: Record<string, string> = {
  'O-S13': '다음 던지기 걸 확정',
  'A-G12': '다음 던지기 모 아니면 빽도',
};

/** Log line with the acting player's name in front (chaos events have none). */
export function entryLine(entry: GameLogEntry, finishedTotal: number, nameOf: (id: string) => string): string {
  const text = logText(entry, finishedTotal);
  return 'playerId' in entry ? `${nameOf(entry.playerId)} · ${text}` : text;
}

/** One log line. `finishedTotal` is the player's finished pieces after this entry. */
export function logText(entry: GameLogEntry, finishedTotal: number): string {
  if (entry.kind === 'AUGMENT') {
    const text = entry.replaced
      ? `${augmentName(entry.replaced)} → ${augmentName(entry.augmentId)} 교체`
      : `${augmentName(entry.augmentId)} 증강 획득`;
    return entry.auto ? `시간 초과 · ${text}` : text;
  }
  if (entry.kind === 'CHAOS') {
    const name = chaosEventById(entry.eventId)?.name ?? entry.eventId;
    const count = entry.pieceIds.length;
    const lasting = chaosEventById(entry.eventId)?.rounds ?? 0;
    const moved = { E5: '귀환', E6: '출발', E1: '이동', E8: '자리 교환' }[entry.eventId] ?? '이동';
    const effect = lasting > 0 ? `${lasting}라운드 동안 적용` : count === 0 ? '대상 없음' : `말 ${count}개 ${moved}`;
    return `전원 ${entry.round}라운드 완료 · ${name} 발동 · ${effect}`;
  }
  if (entry.kind === 'EFFECT') return `${augmentName(entry.augmentId)} 발동 · ${entry.detail}`;
  if (entry.kind === 'USE') {
    const effect =
      entry.detail ?? (entry.discarded ? `${RESULT_LABEL[entry.discarded]} 버리고 다시 던지기` : USE_EFFECT[entry.augmentId]);
    return effect ? `${augmentName(entry.augmentId)} 사용 · ${effect}` : `${augmentName(entry.augmentId)} 사용`;
  }
  const label = RESULT_LABEL[entry.result];
  let text: string;
  if (entry.kind === 'THROW' && entry.augmentId) {
    const change = entry.from ? `${RESULT_LABEL[entry.from]} → ${label}!` : `${label}!`;
    text = `${augmentName(entry.augmentId)} 발동 · ${change}`;
  } else if (entry.kind === 'THROW') text = `${label}!`;
  else if (entry.finished > 1) text = `말 ${entry.finished}개 골인`;
  else if (entry.finished === 1) text = `${ordinal(finishedTotal)} 번째 말 골인`;
  else if (entry.captured > 0) text = `${label}! 말 ${entry.captured}개 잡기`;
  else if (entry.stacked > 0) text = `말 ${entry.stacked + 1}개 업기`;
  else text = `${label}! ${stepsText(entry.result)}`;
  if (entry.kind === 'MOVE' && entry.as) text = `${label}→${RESULT_LABEL[entry.as]} · ${text}`;
  if (entry.kind === 'MOVE' && entry.bonus) {
    const steps = entry.bonus.steps;
    const change = steps >= 0 ? `${steps}칸 추가 이동` : `${-steps}칸 덜 이동`;
    text += entry.bonus.augmentId ? ` · ${augmentName(entry.bonus.augmentId)} 발동 · ${change}` : ` · ${change}`;
  }
  return entry.auto ? `시간 초과 · ${text}` : text;
}
