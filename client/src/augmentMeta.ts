import type { AugmentKind, AugmentRarity } from '@yut/shared';
import tierGold from './assets/figma/tier-gold.svg';
import tierPrism from './assets/figma/tier-prism.svg';
import tierSilver from './assets/figma/tier-silver.svg';

interface TierMeta {
  label: string;
  icon: string;
  /** Text and mark color. */
  color: string;
  border: string;
  /** Card background in the draft. */
  background: string;
  /** Rarity marks in the card corner. */
  marks: number;
}

export const TIER_META: Record<AugmentRarity, TierMeta> = {
  SILVER: {
    label: '실버',
    icon: tierSilver,
    color: '#dce4f2',
    border: 'rgba(196,208,228,0.85)',
    background: 'linear-gradient(180deg, #26354f 0%, #141f33 100%)',
    marks: 1,
  },
  GOLD: {
    label: '골드',
    icon: tierGold,
    color: '#f4d79c',
    border: '#d9b878',
    background: 'linear-gradient(180deg, #3a3324 0%, #171c26 100%)',
    marks: 2,
  },
  PRISM: {
    label: '프리즘',
    icon: tierPrism,
    color: '#c7a4f5',
    border: '#8fd8e8',
    background: 'linear-gradient(180deg, #2c2850 0%, #151a30 100%)',
    marks: 3,
  },
};

export const KIND_LABEL: Record<AugmentKind, string> = {
  PASSIVE: '패시브',
  ACTIVE: '액티브',
  CHAOS: '대혼란',
};
