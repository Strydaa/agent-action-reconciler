import type { VerifyResult } from '../src/index.js';

export interface Adapter<Input, Output> {
  name: string;
  /** Does the provider enforce its own idempotency key? If yes, pass ctx.idempotencyKey. */
  supportsIdempotencyKey: boolean;
  execute(input: Input, ctx: { idempotencyKey: string }): Promise<Output>;
  /** Independent read-back. Return 'unknown' whenever the lookup is inconclusive. */
  verify(input: Input, ctx: { idempotencyKey: string }): Promise<VerifyResult>;
}
