import { describe, expect, it } from 'vitest';
import { fingerprintOf, keyFrom } from '../src/fingerprint.js';

describe('fingerprintOf()', () => {
  it('ignores object key order, including nested objects', () => {
    expect(fingerprintOf({ a: 1, b: { c: 2, d: 3 } })).toBe(fingerprintOf({ b: { d: 3, c: 2 }, a: 1 }));
  });

  it('differs when any value differs', () => {
    expect(fingerprintOf({ a: 1 })).not.toBe(fingerprintOf({ a: 2 }));
  });

  it('keeps array order significant', () => {
    expect(fingerprintOf([1, 2])).not.toBe(fingerprintOf([2, 1]));
  });

  it('hashes undefined without throwing', () => {
    expect(fingerprintOf(undefined)).toBe(fingerprintOf(null));
  });
});

describe('keyFrom()', () => {
  it('is deterministic for the same event parts', () => {
    expect(keyFrom('send_email', 'a@b.com', 'welcome')).toBe(keyFrom('send_email', 'a@b.com', 'welcome'));
  });

  it('does not collide when parts shift across boundaries', () => {
    expect(keyFrom('ab', 'c')).not.toBe(keyFrom('a', 'bc'));
  });

  it('distinguishes a number part from its string form', () => {
    expect(keyFrom(1)).not.toBe(keyFrom('1'));
  });
});
