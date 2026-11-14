import { describe, expect, it } from 'vitest';
import { SqliteStore } from '../src/sqlite-store.js';

describe('SqliteStore', () => {
  it('claim: only the first caller wins, the second sees the existing record', () => {
    const store = new SqliteStore();
    const a = store.claim('k', 'fp');
    const b = store.claim('k', 'fp');
    expect(a.won).toBe(true);
    expect(a.record.status).toBe('requested');
    expect(a.record.attempts).toBe(1);
    expect(b.won).toBe(false);
    expect(b.record.key).toBe('k');
  });

  it('get: returns undefined for an unknown key', () => {
    expect(new SqliteStore().get('missing')).toBeUndefined();
  });

  it('update: stores result and error, keeps the earlier result when none is given', () => {
    const store = new SqliteStore();
    store.claim('k', 'fp');
    store.update('k', { status: 'accepted', result: '"r1"' });
    const r = store.update('k', { status: 'unknown', error: 'boom' });
    expect(r.status).toBe('unknown');
    expect(r.result).toBe('"r1"');
    expect(r.error).toBe('boom');
  });

  it('update: verified is final and never moves backward', () => {
    const store = new SqliteStore();
    store.claim('k', 'fp');
    store.update('k', { status: 'verified' });
    const r = store.update('k', { status: 'unknown', error: 'late failure' });
    expect(r.status).toBe('verified');
    expect(r.error).toBeUndefined();
  });

  it('takeOver: exactly one of two recoverers wins and attempts increments once', () => {
    const store = new SqliteStore();
    store.claim('k', 'fp');
    const now = Date.now();
    const first = store.takeOver('k', 1, now);
    const second = store.takeOver('k', 1, now);
    expect([first, second]).toEqual([true, false]);
    expect(store.get('k')!.attempts).toBe(2);
    expect(store.get('k')!.status).toBe('requested');
  });

  it('takeOver: a record newer than the stale threshold is left alone', () => {
    const store = new SqliteStore();
    store.claim('k', 'fp');
    expect(store.takeOver('k', 1, Date.now() - 60_000)).toBe(false);
    expect(store.get('k')!.attempts).toBe(1);
  });

  it('takeOver: refuses accepted, verified and failed records', () => {
    const store = new SqliteStore();
    for (const status of ['accepted', 'verified', 'failed'] as const) {
      store.claim(status, 'fp');
      store.update(status, { status });
      expect(store.takeOver(status, 1, Date.now())).toBe(false);
    }
  });
});
