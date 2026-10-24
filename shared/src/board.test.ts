import { describe, expect, it } from 'vitest';
import { stepBack, stepForward } from './board';

describe('stepForward', () => {
  it('enters a waiting piece counting from the home corner', () => {
    expect(stepForward(null, 1)).toEqual({ node: 1, prev: 0 });
    expect(stepForward(null, 5)).toEqual({ node: 5, prev: 4 });
  });

  it('turns into the shortcut only when starting from a corner', () => {
    expect(stepForward({ node: 5, prev: 4 }, 1)).toEqual({ node: 20, prev: 5 });
    expect(stepForward({ node: 4, prev: 3 }, 2)).toEqual({ node: 6, prev: 5 });
    expect(stepForward({ node: 10, prev: 9 }, 3)).toEqual({ node: 22, prev: 26 });
  });

  it('heads to the finish after stopping at the center', () => {
    expect(stepForward({ node: 22, prev: 21 }, 1)).toEqual({ node: 27, prev: 22 });
    expect(stepForward({ node: 22, prev: 26 }, 2)).toEqual({ node: 28, prev: 27 });
  });

  it('keeps going straight when passing the center', () => {
    expect(stepForward({ node: 21, prev: 20 }, 2)).toEqual({ node: 23, prev: 22 });
    expect(stepForward({ node: 26, prev: 25 }, 2)).toEqual({ node: 27, prev: 22 });
  });

  it('rejoins the outer path at the bottom-left corner', () => {
    expect(stepForward({ node: 24, prev: 23 }, 1)).toEqual({ node: 15, prev: 24 });
    expect(stepForward({ node: 24, prev: 23 }, 2)).toEqual({ node: 16, prev: 15 });
  });

  it('stays on the board when landing exactly on the home corner', () => {
    expect(stepForward({ node: 19, prev: 18 }, 1)).toEqual({ node: 0, prev: 19 });
    expect(stepForward({ node: 28, prev: 27 }, 1)).toEqual({ node: 0, prev: 28 });
    expect(stepForward(null, 20)).toEqual({ node: 0, prev: 19 });
  });

  it('finishes when moving past the home corner', () => {
    expect(stepForward({ node: 19, prev: 18 }, 2)).toBe('FINISHED');
    expect(stepForward({ node: 0, prev: 19 }, 1)).toBe('FINISHED');
    expect(stepForward(null, 21)).toBe('FINISHED');
  });

  it('rejects non-positive steps', () => {
    expect(() => stepForward(null, 0)).toThrow(RangeError);
  });
});

describe('stepBack', () => {
  it('returns to the node the piece came from', () => {
    expect(stepBack({ node: 20, prev: 5 })).toEqual({ node: 5, prev: 4 });
    expect(stepBack({ node: 0, prev: 28 })).toEqual({ node: 28, prev: 27 });
  });

  it('moves a piece on the first node back to the home corner', () => {
    expect(stepBack({ node: 1, prev: 0 })).toEqual({ node: 0, prev: 19 });
  });
});
