import { describe, expect, it } from 'vitest';
import { NODE_POSITIONS, isBigNode } from './boardLayout';

describe('NODE_POSITIONS', () => {
  it('places all 29 nodes', () => {
    expect(Object.keys(NODE_POSITIONS)).toHaveLength(29);
  });

  it('matches the Figma corners, center and first steps', () => {
    expect(NODE_POSITIONS[0]).toEqual({ x: 570, y: 570 });
    expect(NODE_POSITIONS[1]).toEqual({ x: 570, y: 472 });
    expect(NODE_POSITIONS[5]).toEqual({ x: 570, y: 80 });
    expect(NODE_POSITIONS[10]).toEqual({ x: 80, y: 80 });
    expect(NODE_POSITIONS[15]).toEqual({ x: 80, y: 570 });
    expect(NODE_POSITIONS[22]).toEqual({ x: 325, y: 325 });
    expect(NODE_POSITIONS[20]?.x).toBeCloseTo(488.33, 1);
    expect(NODE_POSITIONS[28]?.y).toBeCloseTo(488.33, 1);
  });

  it('marks corners and center as big nodes', () => {
    expect([0, 5, 10, 15, 22].every(isBigNode)).toBe(true);
    expect(isBigNode(3)).toBe(false);
  });
});
