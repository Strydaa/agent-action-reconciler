import { act, keyFrom, SqliteStore } from '../src/index.js';

/** Fake provider. With probability `lost` the effect is applied but the response is lost (timeout). */
class FakeProvider {
  effects = new Map<string, number>(); // reference -> number of times the effect was applied
  seenKeys = new Map<string, string>(); // idempotency key -> reference
  constructor(private lost: number, private supportsKey: boolean, private rnd: () => number) {}

  async send(reference: string, idempotencyKey?: string): Promise<{ id: string }> {
    if (this.supportsKey && idempotencyKey && this.seenKeys.has(idempotencyKey)) {
      return { id: this.seenKeys.get(idempotencyKey)! }; // provider-enforced dedup
    }
    this.effects.set(reference, (this.effects.get(reference) ?? 0) + 1);
    if (this.supportsKey && idempotencyKey) this.seenKeys.set(idempotencyKey, reference);
    if (this.rnd() < this.lost) throw new Error('timeout: response lost');
    return { id: reference };
  }

  /** Independent read-back by reference. */
  async lookup(reference: string): Promise<'done' | 'not_done'> {
    return (this.effects.get(reference) ?? 0) > 0 ? 'done' : 'not_done';
  }
}

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Policy = 'A_naive_retry' | 'B_provider_key_retry' | 'C_act_with_verify';

async function episode(policy: Policy, supportsKey: boolean, lost: number, seed: number) {
  const rnd = mulberry32(seed);
  const p = new FakeProvider(lost, supportsKey, rnd);
  const ref = `ref-${seed}`;
  let reportedSuccess = false;

  if (policy === 'A_naive_retry') {
    for (let i = 0; i < 3 && !reportedSuccess; i++) {
      try { await p.send(ref); reportedSuccess = true; } catch { /* retry */ }
    }
  } else if (policy === 'B_provider_key_retry') {
    const key = keyFrom('send', ref);
    for (let i = 0; i < 3 && !reportedSuccess; i++) {
      try { await p.send(ref, key); reportedSuccess = true; } catch { /* retry same key */ }
    }
  } else {
    const store = new SqliteStore();
    const key = keyFrom('send', ref);
    const opts = {
      store, key, payload: { ref }, leaseMs: 0,
      execute: ({ idempotencyKey }: { idempotencyKey: string }) => p.send(ref, supportsKey ? idempotencyKey : undefined),
      verify: async () => p.lookup(ref),
    };
    for (let i = 0; i < 3; i++) {
      const r = await act(opts);
      if (r.status === 'verified') { reportedSuccess = true; break; }
      if (r.status === 'failed') break;
    }
  }
  const applied = p.effects.get(ref) ?? 0;
  return { duplicate: applied > 1, missing: applied === 0 && reportedSuccess };
}

async function main() {
  const N = 2000;
  const lostRates = [0.1, 0.3];
  console.log('| Provider supports key | Lost-response rate | Policy | Duplicate effect % | False success % |');
  console.log('| --- | --- | --- | --- | --- |');
  for (const supportsKey of [false, true]) {
    for (const lost of lostRates) {
      for (const policy of ['A_naive_retry', 'B_provider_key_retry', 'C_act_with_verify'] as Policy[]) {
        if (policy === 'B_provider_key_retry' && !supportsKey) continue;
        let dup = 0, fake = 0;
        for (let s = 1; s <= N; s++) {
          const r = await episode(policy, supportsKey, lost, s * 7919 + (supportsKey ? 1 : 0));
          if (r.duplicate) dup++;
          if (r.missing) fake++;
        }
        console.log(`| ${supportsKey ? 'yes' : 'no'} | ${lost * 100}% | ${policy} | ${(dup / N * 100).toFixed(1)} | ${(fake / N * 100).toFixed(1)} |`);
      }
    }
  }
}

await main();
