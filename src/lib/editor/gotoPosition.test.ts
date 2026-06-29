import { describe, expect, it } from 'vitest';
import { formatGotoPositionValue, parseGotoPositionInput } from './gotoPosition';

describe('goto position input', () => {
  it('parses comma, whitespace, semicolon, and labelled coordinates', () => {
    expect(parseGotoPositionInput('120, 240')).toEqual({ x: 120, y: 240 });
    expect(parseGotoPositionInput('120 240')).toEqual({ x: 120, y: 240 });
    expect(parseGotoPositionInput('x: 12.5; y: -4')).toEqual({ x: 12.5, y: -4 });
    expect(parseGotoPositionInput('x=10, y=20')).toEqual({ x: 10, y: 20 });
  });

  it('rejects incomplete and non-numeric input', () => {
    expect(parseGotoPositionInput('')).toBeNull();
    expect(parseGotoPositionInput('120')).toBeNull();
    expect(parseGotoPositionInput('left, top')).toBeNull();
    expect(parseGotoPositionInput('1, 2, 3')).toBeNull();
  });

  it('formats the current selection position as rounded X,Y text', () => {
    expect(formatGotoPositionValue({ x: 12.4, y: 99.6 })).toBe('12, 100');
  });
});
