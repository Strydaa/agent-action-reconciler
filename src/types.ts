export type Status = 'requested' | 'accepted' | 'verified' | 'unknown' | 'failed';
export type VerifyResult = 'done' | 'not_done' | 'unknown';

export interface ActionRecord {
  key: string;
  fingerprint: string;
  status: Status;
  result?: string;
  error?: string;
  attempts: number;
  createdAt: number;
  updatedAt: number;
}

export interface Store {
  claim(key: string, fingerprint: string): { won: boolean; record: ActionRecord };
  get(key: string): ActionRecord | undefined;
  update(key: string, patch: { status: Status; result?: string; error?: string }): ActionRecord;
  /** Atomically take over a stale requested/unknown record. Only one caller wins. */
  takeOver(key: string, expectedAttempts: number, staleBefore: number): boolean;
}

/** The provider definitively rejected the call: the effect did NOT happen. */
export class DefinitiveError extends Error {}
/** Same key, different payload: a caller bug, never silently ignored. */
export class ConflictError extends Error {}
export class TimeoutError extends Error {}
