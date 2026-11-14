import { act, keyFrom, SqliteStore } from '../src/index.js';

/** Provider where, with probability `late`, the effect lands AFTER the caller already timed out. */
class LateProvider {
  effects = new Map<string, number>();
  pending: string[] = [];
  seen = new Map<string, string>();
  constructor(private late: number, private supportsKey: boolean, private rnd: () => number) {}

  async send(ref: string, key?: string): Promise<{ id: string }> {
    if (this.supportsKey && key && this.seen.has(key)) return { id: ref };
    if (this.supportsKey && key) this.seen.set(key, ref);
    if (this.rnd() < this.late) { this.pending.push(ref); throw new Error('timeout'); }
    this.effects.set(ref, (this.effects.get(ref) ?? 0) + 1);
    return { id: ref };
  }

  flush() {
    for (const r of this.pending) this.effects.set(r, (this.effects.get(r) ?? 0) + 1);
    this.pending = [];
  }

  async lookup(ref: string): Promise<'done' | 'not_done'> {
    return (this.effects.get(ref) ?? 0) > 0 ? 'done' : 'not_done';
  }
}

function rng(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Policy = 'A_naive_retry' | 'B_provider_key' | 'C_act_retry_immediately' | 'C_act_wait_for_lease';

async function episode(policy: Policy, supportsKey: boolean, late: number, seed: number) {
  const p = new LateProvider(late, supportsKey, rng(seed));
  const ref = `r${seed}`;
  const key = keyFrom('send', ref);
  if (policy === 'A_naive_retry') {
    for (let i = 0; i < 3; i++) { try { await p.send(ref); break; } catch { /* retry now */ } }
  } else if (policy === 'B_provider_key') {
    for (let i = 0; i < 3; i++) { try { await p.send(ref, key); break; } catch { /* retry now */ } }
  } else {
    const store = new SqliteStore();
    const opts = {
      store, key, payload: { ref }, leaseMs: 0,
      execute: ({ idempotencyKey }: { idempotencyKey: string }) => p.send(ref, supportsKey ? idempotencyKey : undefined),
      verify: async () => p.lookup(ref),
    };
    for (let i = 0; i < 3; i++) {
      const r = await act(opts);
      if (r.status === 'verified' || r.status === 'failed') break;
      if (policy === 'C_act_wait_for_lease') p.flush(); // time passes before the next reconcile
    }
  }
  p.flush(); // everything in flight eventually lands
  return (p.effects.get(ref) ?? 0) > 1;
}

async function main() {
  const N = 2000, late = 0.3;
  console.log('| Provider supports key | Policy | Duplicate effect % |');
  console.log('| --- | --- | --- |');
  for (const sk of [false, true]) {
    for (const pol of ['A_naive_retry', 'B_provider_key', 'C_act_retry_immediately', 'C_act_wait_for_lease'] as Policy[]) {
      if (pol === 'B_provider_key' && !sk) continue;
      let d = 0;
      for (let s = 1; s <= N; s++) if (await episode(pol, sk, late, s * 104729)) d++;
      console.log(`| ${sk ? 'yes' : 'no'} | ${pol} | ${(d / N * 100).toFixed(1)} |`);
    }
  }
}

await main();
