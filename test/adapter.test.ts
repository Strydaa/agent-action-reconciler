import { describe, expect, it } from 'vitest';
import type { Adapter } from '../adapters/types.js';
import { act, keyFrom, SqliteStore } from '../src/index.js';

interface Mail { to: string; subject: string }

function fakeMailAdapter() {
  const sent: Array<{ mail: Mail; idempotencyKey: string }> = [];
  const adapter: Adapter<Mail, { id: string }> = {
    name: 'fake.mail.send',
    supportsIdempotencyKey: true,
    execute: async (mail, ctx) => {
      sent.push({ mail, idempotencyKey: ctx.idempotencyKey });
      return { id: `m${sent.length}` };
    },
    verify: async (mail) => (sent.some((s) => s.mail.to === mail.to) ? 'done' : 'unknown'),
  };
  return { adapter, sent };
}

describe('Adapter driving act()', () => {
  const mail: Mail = { to: 'a@b.com', subject: 'Hi' };
  const key = keyFrom('send_email', mail.to, 'welcome');

  it('forwards the act() key to the provider and verifies through the adapter', async () => {
    const { adapter, sent } = fakeMailAdapter();
    const r = await act({
      store: new SqliteStore(), key, payload: mail,
      execute: (ctx) => adapter.execute(mail, ctx),
      verify: (ctx) => adapter.verify(mail, ctx),
    });
    expect(r.status).toBe('verified');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.idempotencyKey).toBe(key);
  });

  it('replay through the adapter does not reach the provider twice', async () => {
    const { adapter, sent } = fakeMailAdapter();
    const store = new SqliteStore();
    const opts = {
      store, key, payload: mail,
      execute: (ctx: { idempotencyKey: string }) => adapter.execute(mail, ctx),
      verify: (ctx: { idempotencyKey: string }) => adapter.verify(mail, ctx),
    };
    await act(opts);
    const second = await act(opts);
    expect(second.duplicate).toBe(true);
    expect(sent).toHaveLength(1);
  });
});
