import { fingerprintOf } from './fingerprint.js';
import {
  ConflictError, DefinitiveError, TimeoutError,
  type ActionRecord, type Status, type Store, type VerifyResult,
} from './types.js';

export interface ActOptions<T> {
  store: Store;
  /** Derived from the EVENT (see keyFrom). Same key = same logical action. */
  key: string;
  payload: unknown;
  /** Pass ctx.idempotencyKey to the provider whenever it supports one. */
  execute: (ctx: { idempotencyKey: string; attempt: number }) => Promise<T>;
  /** Independent read-back of the real world. Must not trust the model's words. */
  verify?: (ctx: { idempotencyKey: string; result?: T }) => Promise<VerifyResult>;
  timeoutMs?: number;
  /** A requested/unknown record younger than this is treated as in flight, not crashed. */
  leaseMs?: number;
}

export interface ActResult<T> {
  status: Status;
  duplicate: boolean;
  result?: T;
  error?: string;
  attempts: number;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new TimeoutError(`no response within ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

async function safeVerify<T>(o: ActOptions<T>, result?: T): Promise<VerifyResult> {
  if (!o.verify) return 'unknown';
  try {
    return await o.verify({ idempotencyKey: o.key, result });
  } catch {
    return 'unknown'; // an inconclusive lookup never authorizes a resend
  }
}

const parse = <T>(r: ActionRecord): T | undefined => (r.result ? (JSON.parse(r.result) as T) : undefined);

async function run<T>(o: ActOptions<T>, attempt: number): Promise<ActResult<T>> {
  try {
    const result = await withTimeout(
      o.execute({ idempotencyKey: o.key, attempt }),
      o.timeoutMs ?? 10_000,
    );
    o.store.update(o.key, { status: 'accepted', result: JSON.stringify(result ?? null) });
    if (!o.verify) return { status: 'accepted', duplicate: false, result, attempts: attempt };
    const v = await safeVerify(o, result);
    if (v === 'done') {
      o.store.update(o.key, { status: 'verified' });
      return { status: 'verified', duplicate: false, result, attempts: attempt };
    }
    // The provider said OK but the real world disagrees (or we cannot tell): do not report success.
    o.store.update(o.key, { status: 'unknown', error: `accepted but verify=${v}` });
    return { status: 'unknown', duplicate: false, result, error: `accepted but verify=${v}`, attempts: attempt };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (e instanceof DefinitiveError) {
      o.store.update(o.key, { status: 'failed', error: message });
      return { status: 'failed', duplicate: false, error: message, attempts: attempt };
    }
    // Timeout / network / unknown error: the effect may or may not have happened.
    o.store.update(o.key, { status: 'unknown', error: message });
    if (o.verify) {
      const v = await safeVerify(o);
      if (v === 'done') {
        o.store.update(o.key, { status: 'verified' });
        return { status: 'verified', duplicate: false, attempts: attempt };
      }
    }
    return { status: 'unknown', duplicate: false, error: message, attempts: attempt };
  }
}

async function reconcile<T>(o: ActOptions<T>, rec: ActionRecord): Promise<ActResult<T>> {
  const base = { duplicate: true, attempts: rec.attempts };
  if (rec.status === 'verified' || rec.status === 'accepted') {
    return { ...base, status: rec.status, result: parse<T>(rec) };
  }
  if (rec.status === 'failed') return { ...base, status: 'failed', error: rec.error };

  // requested | unknown
  const leaseMs = o.leaseMs ?? 30_000;
  if (Date.now() - rec.updatedAt < leaseMs) {
    return { ...base, status: rec.status }; // still in flight elsewhere: do nothing
  }
  const v = await safeVerify(o);
  if (v === 'done') {
    const updated = o.store.update(o.key, { status: 'verified' });
    return { ...base, status: updated.status, result: parse<T>(updated) };
  }
  if (v === 'not_done') {
    // Proven absent (and past the lease): only ONE caller may retry.
    const won = o.store.takeOver(o.key, rec.attempts, Date.now() - leaseMs);
    if (won) {
      const r = await run(o, rec.attempts + 1);
      return { ...r, duplicate: true };
    }
    return { ...base, status: rec.status };
  }
  if (rec.status === 'requested') o.store.update(o.key, { status: 'unknown', error: 'crash suspected, cannot verify' });
  return { ...base, status: 'unknown', error: 'outcome unknown: needs human review' };
}

export async function act<T>(o: ActOptions<T>): Promise<ActResult<T>> {
  const fingerprint = fingerprintOf(o.payload);
  const { won, record } = o.store.claim(o.key, fingerprint);
  if (won) return run(o, 1);
  if (record.fingerprint !== fingerprint) {
    throw new ConflictError(`key ${o.key.slice(0, 8)}… already used with a different payload`);
  }
  return reconcile(o, record);
}
