import { describe, expect, it } from 'vitest';

import { effectiveTurn, nextTurn } from './rotation';

const abc = ['a', 'b', 'c'];

describe('nextTurn', () => {
  it('advances in member order', () => {
    expect(nextTurn(abc, 'a')).toBe('b');
    expect(nextTurn(abc, 'b')).toBe('c');
  });

  it('wraps around at the end', () => {
    expect(nextTurn(abc, 'c')).toBe('a');
  });

  it('restarts at the top when the holder is unknown or gone', () => {
    expect(nextTurn(abc, 'ghost')).toBe('a');
    expect(nextTurn(abc, null)).toBe('a');
    expect(nextTurn(abc, undefined)).toBe('a');
  });

  it('single-member home: the turn stays with them', () => {
    expect(nextTurn(['a'], 'a')).toBe('a');
  });

  it('empty home: no turn', () => {
    expect(nextTurn([], 'a')).toBeNull();
  });
});

describe('effectiveTurn', () => {
  it('keeps a valid stored holder', () => {
    expect(effectiveTurn(abc, 'b')).toBe('b');
  });

  it('heals a departed holder to the first member', () => {
    expect(effectiveTurn(abc, 'ghost')).toBe('a');
    expect(effectiveTurn(abc, null)).toBe('a');
  });

  it('empty home: no turn', () => {
    expect(effectiveTurn([], 'a')).toBeNull();
  });
});
