
import { getStore } from '@netlify/blobs';
import { createHmac } from 'node:crypto';

const store = getStore('hisaab-private');
const secret = () => process.env.HISAAB_SESSION_SECRET || '';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });

function userId(req: Request) {
  const token = req.headers.get('cookie')?.match(/(?:^|; )hisaab_session=([^;]+)/)?.[1];

  if (!token || !secret()) return null;

  try {
    const [id, exp, sig] = decodeURIComponent(token).split('.');
    const expected = createHmac('sha256', secret())
      .update(`${id}.${exp}`)
      .digest('hex');

    if (!id || Number(exp) < Date.now() || sig !== expected) return null;

    return id;
  } catch {
    return null;
  }
}

export default async (req: Request) => {
  const id = userId(req);

  if (!id) return json({ error: 'Please log in again.' }, 401);

  const key = `data:${id}`;

  if (req.method === 'GET') {
    return json(
      (await store.get(key, { type: 'json' })) || {
        transactions: [],
        businesses: [],
        accounts: []
      }
    );
  }

  if (req.method === 'PUT') {
    try {
      const data = await req.json();

      if (
        !Array.isArray(data.transactions) ||
        !Array.isArray(data.businesses) ||
        !Array.isArray(data.accounts)
      ) {
        return json({ error: 'Invalid data' }, 400);
      }

      if (JSON.stringify(data).length > 4_000_000) {
        return json({ error: 'Data is too large.' }, 413);
      }

      await store.setJSON(key, data);
      return json({ ok: true });
    } catch {
      return json({ error: 'Could not save data.' }, 400);
    }
  }

  return json({ error: 'Method not allowed' }, 405);
};
