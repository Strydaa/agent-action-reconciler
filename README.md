# agent-action-reconciler

When an AI agent writes to an outside API (a payment, an email, a record) and the request times out, it cannot tell whether the write happened. Retrying blindly can apply the effect twice; not retrying can leave the work undone. `act()` runs every side effect through one gate: it claims the key in a local registry before doing anything, runs the call, and records the result. If the outcome is uncertain it asks an independent read-back (`verify`) what really happened, and if that is inconclusive it does not retry. It leaves the record as `unknown` for a human. If the provider supports an idempotency key, `act()` hands it to your `execute` function.

## Usage

```ts
import { act, keyFrom, SqliteStore } from 'agent-action-reconciler';

const store = new SqliteStore('actions.db');
const key = keyFrom('send_email', 'a@b.com', 'welcome'); // from the event, never time or random values

const r = await act({
  store, key, payload: { to: 'a@b.com', subject: 'Welcome' },
  execute: ({ idempotencyKey }) => mailer.send({ to: 'a@b.com' }, { idempotencyKey }),
  verify: async () => ((await mailer.wasSent('a@b.com')) ? 'done' : 'unknown'),
});
console.log(r.status); // 'verified' | 'accepted' | 'unknown' | 'failed'
```

## Statuses

| Status | Meaning |
| --- | --- |
| `requested` | Key claimed, call in flight |
| `accepted` | Provider said OK, not independently confirmed |
| `verified` | Confirmed by a read-back. Final, never changes |
| `unknown` | Outcome uncertain: needs verification or a human |
| `failed` | Provider definitively rejected it (`DefinitiveError`); the effect did not happen |

## Benchmark: simulation, not demand evidence

The benchmarks run against a fake provider in a simulation. They show that the mechanism behaves as designed. They do not show real-world duplicate rates, and they are not evidence that anyone needs this library.

```bash
npx tsx bench/bench.ts        # response lost after the effect was applied
npx tsx bench/bench-late.ts   # effect lands after the caller already timed out
```

2,000 seeded episodes per row, three attempts each. Duplicate effect rate:

| Scenario | Provider key | Blind retry | Provider key retry | `act()` with `verify` |
| --- | --- | --- | --- | --- |
| Response lost, 30% | no | 30.1% | n/a | 0.0% |
| Response lost, 30% | yes | 30.4% | 0.0% | 0.0% |
| Effect lands late, 30%, retry at once | no | 30.1% | n/a | 30.1% |
| Effect lands late, 30%, wait out the lease | no | 30.1% | n/a | 0.0% |
| Effect lands late, 30%, retry at once | yes | 30.1% | 0.0% | 0.0% |

What this does and does not say:

- Where the provider enforces an idempotency key, the key alone removes duplicates. This library adds nothing there.
- Without a key, `act()` helps only if `verify` can read the real state. The fake provider's read-back is always instantly consistent; real APIs often are not.
- The "wait out the lease" row is 0.0% by construction: the simulation lands the pending effect before the next check. It shows the lease matters, not that the lease always works.
- Retrying at once without a key duplicates exactly as often as blind retry. `leaseMs` exists for this case.

## Limits

- **No exactly-once guarantee.** Only a provider-enforced idempotency key can prevent a duplicate, and only within that provider's retention window. Without one, `act()` reduces duplicates and turns uncertainty into an explicit `unknown` status; a duplicate or a missing effect is still possible, for example when a read-back lags, an effect lands late, or the process dies between the call and recording its result.
- The SQLite store is for a single machine. Several servers sharing one registry would need a different store.
- You write `verify`. The library cannot know what a provider actually did. Return `'unknown'` whenever a lookup is inconclusive; "not found" is not proof that the effect did not happen.
- A `not_done` read-back taken while a request is still in flight can be misleading. `leaseMs` reduces this and does not eliminate it.
- **Do not store sensitive data.** The value your `execute` function returns (`result`) and the text of any error it throws are written to the database as plain, unencrypted text, and the result is handed back on replays. Return only what you need, such as an ID. Never return tokens, secrets or personal data, and do not put them in error messages.
- Only a SHA-256 hash of `payload` is stored, not the payload itself. The `key` is stored as given, so build it with `keyFrom` from event identifiers rather than from personal data.
- The library stores no credentials of its own. Treat the database file like any other file that can hold business data, and keep it out of version control.

## Scope

No dashboard, accounts, auth, billing or workflow engine. Not a security layer on its own for critical flows such as payments.

## Development

```bash
npm run typecheck && npm test
```

## License

MIT. No warranty; see [LICENSE](LICENSE).
