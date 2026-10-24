export type YutResult = 'BACKDO' | 'DO' | 'GAE' | 'GEOL' | 'YUT' | 'MO';

export const YUT_STEPS: Record<YutResult, number> = {
  BACKDO: -1,
  DO: 1,
  GAE: 2,
  GEOL: 3,
  YUT: 4,
  MO: 5,
};

/** Yut and Mo grant an extra throw. */
export function grantsExtraThrow(result: YutResult): boolean {
  return result === 'YUT' || result === 'MO';
}

/**
 * Decide the result from four sticks.
 * `true` means the flat side is up. Stick 0 carries the backdo mark.
 */
export function resultFromSticks(sticks: readonly [boolean, boolean, boolean, boolean]): YutResult {
  const flatCount = sticks.filter(Boolean).length;
  if (flatCount === 1 && sticks[0]) return 'BACKDO';
  switch (flatCount) {
    case 0:
      return 'MO';
    case 1:
      return 'DO';
    case 2:
      return 'GAE';
    case 3:
      return 'GEOL';
    default:
      return 'YUT';
  }
}

/** Throw four sticks with an injectable random source for tests. */
export function throwSticks(random: () => number = Math.random): YutResult {
  const stick = () => random() < 0.5;
  return resultFromSticks([stick(), stick(), stick(), stick()]);
}
