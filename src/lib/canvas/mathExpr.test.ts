import { describe, expect, it } from 'vitest';
import { evalMath } from './mathExpr';

describe('evalMath', () => {
  it('evaluates arithmetic without using unsafe eval', () => {
    expect(evalMath('180+20')).toBe(200);
    expect(evalMath('(100*2)/4')).toBe(50);
    expect(evalMath('-8 + 2 * 3')).toBe(-2);
    expect(evalMath('1,5*16')).toBe(24);
  });

  it('falls back to parseFloat for invalid expressions', () => {
    expect(evalMath('12abc')).toBe(12);
    expect(evalMath('abc')).toBe(0);
    expect(evalMath('10/0')).toBe(10);
    expect(evalMath('10+')).toBe(10);
  });
});
