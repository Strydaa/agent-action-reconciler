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

Any benchmark of this approach runs against a fake provider in a simulation. It shows that the mechanism behaves as designed. It does not show real-world duplicate rates, and it is not evidence that anyone needs this library. No benchmark ships in this version.

## Limits

- The SQLite store is for a single machine. Several servers sharing one registry would need a different store.
- You write `verify`. The library cannot know what a provider actually did. Return `'unknown'` whenever a lookup is inconclusive; "not found" is not proof that the effect did not happen.
- A `not_done` read-back taken while a request is still in flight can be misleading. `leaseMs` reduces this and does not eliminate it.
- The provider's response is stored as JSON in the database. Do not return personal data from `execute` if you do not want it on disk.
- The library stores no credentials. Only a hash of `payload` is written to the database.

## Scope

No dashboard, accounts, auth, billing or workflow engine. Not a security layer on its own for critical flows such as payments.

## Development

```bash
npm run typecheck && npm test
```

## License

MIT. No warranty; see [LICENSE](LICENSE).
