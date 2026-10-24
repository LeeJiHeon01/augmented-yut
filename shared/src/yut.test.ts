import { describe, expect, it } from 'vitest';
import { grantsExtraThrow, resultFromSticks, throwSticks } from './yut';

describe('resultFromSticks', () => {
  it('maps flat-side count to result', () => {
    expect(resultFromSticks([false, false, false, false])).toBe('MO');
    expect(resultFromSticks([false, true, false, false])).toBe('DO');
    expect(resultFromSticks([true, true, false, false])).toBe('GAE');
    expect(resultFromSticks([true, true, true, false])).toBe('GEOL');
    expect(resultFromSticks([true, true, true, true])).toBe('YUT');
  });

  it('returns BACKDO when only the marked stick is flat', () => {
    expect(resultFromSticks([true, false, false, false])).toBe('BACKDO');
  });
});

describe('throwSticks', () => {
  it('uses the injected random source', () => {
    expect(throwSticks(() => 0.9)).toBe('MO');
    expect(throwSticks(() => 0.1)).toBe('YUT');
  });
});

describe('grantsExtraThrow', () => {
  it('is true only for YUT and MO', () => {
    expect(grantsExtraThrow('YUT')).toBe(true);
    expect(grantsExtraThrow('MO')).toBe(true);
    expect(grantsExtraThrow('GEOL')).toBe(false);
  });
});
