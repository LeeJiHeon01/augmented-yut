/**
 * Times each augment can take effect in one game (docs/spec/yutnori_all_108_usage_balance_v2.md).
 * Passives count when their effect actually applies; actives when they are used.
 * A used-up augment leaves the hand and is not offered again in that game.
 */
export const USAGE_LIMITS: Readonly<Record<string, number>> = {
  'O-S1': 3, 'O-S2': 3, 'O-S3': 2, 'O-S4': 3, 'O-S5': 1, 'O-S6': 1,
  'O-S7': 1, 'O-S8': 2, 'O-S9': 1, 'O-S10': 3, 'O-S11': 2, 'O-S12': 2,
  'O-S13': 2, 'O-S14': 3, 'O-S15': 2, 'A-S1': 3, 'A-S2': 2, 'A-S3': 3,
  'A-S4': 3, 'A-S5': 2, 'A-S6': 3, 'A-S7': 3, 'A-S8': 2, 'A-S9': 3,
  'A-S10': 1, 'A-S11': 2, 'A-S12': 3, 'A-S13': 2, 'A-S14': 2, 'A-S15': 1,
  'C-S1': 2, 'C-S2': 3, 'C-S3': 2, 'C-S4': 3, 'C-S5': 2, 'C-S6': 3,
  'C-S7': 3, 'C-S8': 3, 'C-S9': 1, 'C-S10': 2, 'C-S11': 1, 'C-S12': 2,
  'C-S13': 2, 'C-S14': 1, 'C-S15': 1, 'O-G1': 1, 'O-G2': 2, 'O-G3': 2,
  'O-G4': 3, 'O-G5': 1, 'O-G6': 2, 'O-G7': 1, 'O-G8': 3, 'O-G9': 2,
  'O-G10': 1, 'O-G11': 1, 'O-G12': 3, 'O-G13': 2, 'A-G1': 1, 'A-G2': 2,
  'A-G3': 2, 'A-G4': 1, 'A-G5': 1, 'A-G6': 2, 'A-G7': 3, 'A-G8': 3,
  'A-G9': 2, 'A-G10': 2, 'A-G11': 1, 'A-G12': 2, 'A-G13': 2, 'C-G1': 2,
  'C-G2': 1, 'C-G3': 3, 'C-G4': 3, 'C-G5': 1, 'C-G6': 1, 'C-G7': 1,
  'C-G8': 3, 'C-G9': 1, 'C-G10': 1, 'C-G11': 1, 'C-G12': 1, 'C-G13': 1,
  'O-P1': 1, 'O-P2': 1, 'O-P3': 1, 'O-P4': 1, 'O-P5': 1, 'O-P6': 1,
  'O-P7': 1, 'O-P8': 1, 'A-P1': 1, 'A-P2': 1, 'A-P3': 1, 'A-P4': 1,
  'A-P5': 1, 'A-P6': 1, 'A-P7': 1, 'A-P8': 1, 'C-P1': 1, 'C-P2': 1,
  'C-P3': 1, 'C-P4': 1, 'C-P5': 1, 'C-P6': 1, 'C-P7': 1, 'C-P8': 1,
};

export function usageLimit(augmentId: string): number {
  return USAGE_LIMITS[augmentId] ?? 1;
}
