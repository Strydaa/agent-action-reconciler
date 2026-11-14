import { createHash } from 'node:crypto';

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => [k, stable(v)]),
    );
  }
  return value;
}

export function fingerprintOf(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(stable(payload)) ?? 'null').digest('hex');
}

/** Build a key from the EVENT, not the run. Never use time, random values or execution ids. */
export function keyFrom(...parts: Array<string | number>): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
