import { describe, expect, it } from 'vitest';
import { act, ConflictError, DefinitiveError, keyFrom, SqliteStore } from '../src/index.js';
import { fingerprintOf } from '../src/fingerprint.js';

const payload = { to: 'a@b.com', subject: 'Hi' };
const key = keyFrom('send_email', 'a@b.com', 'welcome');

describe('act()', () => {
  it('replay: same key twice executes once', async () => {
    const store = new SqliteStore();
    let calls = 0;
    const execute = async () => { calls++; return { id: 'm1' }; };
    const a = await act({ store, key, payload, execute });
    const b = await act({ store, key, payload, execute });
    expect(calls).toBe(1);
    expect(a.status).toBe('accepted');
    expect(b.duplicate).toBe(true);
    expect(b.result).toEqual({ id: 'm1' });
  });

  it('concurrency: two simultaneous calls execute once', async () => {
    const store = new SqliteStore();
    let calls = 0;
    const execute = async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return 'ok'; };
    const [a, b] = await Promise.all([
      act({ store, key, payload, execute }),
      act({ store, key, payload, execute }),
    ]);
    expect(calls).toBe(1);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
  });

  it('conflict: same key with different payload throws', async () => {
    const store = new SqliteStore();
    await act({ store, key, payload, execute: async () => 1 });
    await expect(
      act({ store, key, payload: { ...payload, subject: 'Other' }, execute: async () => 1 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('definitive provider error is failed, not unknown', async () => {
    const store = new SqliteStore();
    const r = await act({ store, key, payload, execute: async () => { throw new DefinitiveError('400 bad request'); } });
    expect(r.status).toBe('failed');
  });

  it('lost response: timeout becomes unknown, later verify=done resolves WITHOUT resending', async () => {
    const store = new SqliteStore();
    let calls = 0;
    const execute = async () => { calls++; await new Promise((r) => setTimeout(r, 200)); return 'late'; };
    const first = await act({ store, key, payload, execute, timeoutMs: 20, leaseMs: 0 });
    expect(first.status).toBe('unknown');
    const second = await act({ store, key, payload, execute, leaseMs: 0, verify: async () => 'done' });
    expect(second.status).toBe('verified');
    expect(calls).toBe(1);
  });

  it('crash after claim: verify=not_done retries exactly once, even with two recoverers', async () => {
    const store = new SqliteStore();
    store.claim(key, fingerprintOf(payload)); // process died right after claim
    let calls = 0;
    const execute = async () => { calls++; return 'ok'; };
    const opts = { store, key, payload, execute, leaseMs: 0, verify: async () => 'not_done' as const };
    await Promise.all([act(opts), act(opts)]);
    expect(calls).toBe(1);
  });

  it('crash after claim: verify=unknown never resends', async () => {
    const store = new SqliteStore();
    store.claim(key, fingerprintOf(payload));
    let calls = 0;
    const r = await act({ store, key, payload, execute: async () => { calls++; return 1; }, leaseMs: 0, verify: async () => 'unknown' });
    expect(calls).toBe(0);
    expect(r.status).toBe('unknown');
  });

  it('crash after claim and no verify function: never resends', async () => {
    const store = new SqliteStore();
    store.claim(key, fingerprintOf(payload));
    let calls = 0;
    const r = await act({ store, key, payload, execute: async () => { calls++; return 1; }, leaseMs: 0 });
    expect(calls).toBe(0);
    expect(r.status).toBe('unknown');
  });

  it('provider says OK but verify disagrees: not reported as success', async () => {
    const store = new SqliteStore();
    const r = await act({ store, key, payload, execute: async () => 'sent', verify: async () => 'not_done' });
    expect(r.status).toBe('unknown');
  });

  it('in-flight record inside the lease is left alone', async () => {
    const store = new SqliteStore();
    store.claim(key, fingerprintOf(payload));
    let calls = 0;
    const r = await act({ store, key, payload, execute: async () => { calls++; return 1; }, leaseMs: 60_000, verify: async () => 'not_done' });
    expect(calls).toBe(0);
    expect(r.status).toBe('requested');
  });
});
