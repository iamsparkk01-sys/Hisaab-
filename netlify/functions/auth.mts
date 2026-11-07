import { getStore } from '@netlify/blobs';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const store = getStore('hisaab-private');
const secret = () => process.env.HISAAB_SESSION_SECRET || '';

const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', ...headers }
});

const cookie = (value: string, maxAge: number) =>
  `hisaab_session=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

const sign = (payload: string) =>
  createHmac('sha256', secret()).update(payload).digest('hex');

const hashPhone = (phone: string) =>
  createHmac('sha256', secret()).update(phone).digest('hex');

const passwordHash = (password: string, salt: string) =>
  scryptSync(password, salt, 64).toString('hex');

export default async (req: Request) => {
  if (!secret()) {
    return json({
      error: 'Site setup incomplete. Add HISAAB_SESSION_SECRET in Netlify environment variables.'
    }, 500);
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json() as {
      action?: string;
      phone?: string;
      password?: string;
    };

    const action = body.action;

    if (action === 'logout') {
      return json({ ok: true }, 200, {
        'Set-Cookie': cookie('', 0)
      });
    }

    if (action === 'me') {
      const token = req.headers
        .get('cookie')
        ?.match(/(?:^|; )hisaab_session=([^;]+)/)?.[1];

      if (!token) return json({ user: null });

      const [id, exp, sig] = decodeURIComponent(token).split('.');

      if (
        !id || !exp || !sig ||
        Number(exp) < Date.now() ||
        sign(`${id}.${exp}`) !== sig
      ) {
        return json({ user: null }, 200, {
          'Set-Cookie': cookie('', 0)
        });
      }

      const account = await store.get(`user:${id}`, {
        type: 'json'
      }) as { phone?: string } | null;

      return json({
        user: account ? { phone: account.phone } : null
      });
    }

    const phone = String(body.phone || '')
      .replace(/[\s()-]/g, '');

    const password = String(body.password || '');

    if (!/^\+?[0-9]{10,15}$/.test(phone)) {
      return json({ error: 'Enter a valid phone number.' }, 400);
    }

    if (password.length < 6) {
      return json({
        error: 'Password must be at least 6 characters.'
      }, 400);
    }

    const id = hashPhone(phone);
    const key = `user:${id}`;

    if (action === 'register') {
      if (await store.get(key, { type: 'json' })) {
        return json({
          error: 'This phone number is already registered. Please log in.'
        }, 409);
      }

      const salt = randomBytes(16).toString('hex');

      await store.setJSON(key, {
        salt,
        passwordHash: passwordHash(password, salt),
        phone
      });

    } else if (action === 'login') {
      const record = await store.get(key, {
        type: 'json'
      }) as {
        salt: string;
        passwordHash: string;
      } | null;

      if (!record) {
        return json({
          error: 'Account not found. Please register first.'
        }, 404);
      }

      const actual = Buffer.from(
        passwordHash(password, record.salt), 'hex'
      );

      const expected = Buffer.from(
        record.passwordHash, 'hex'
      );

      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      ) {
        return json({
          error: 'Incorrect phone number or password.'
        }, 401);
      }

    } else {
      return json({ error: 'Invalid action' }, 400);
    }

    const exp = String(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const payload = `${id}.${exp}`;
    const token = `${payload}.${sign(payload)}`;

    return json(
      { user: { phone } },
      200,
      { 'Set-Cookie': cookie(token, 30 * 24 * 60 * 60) }
    );

  } catch {
    return json({
      error: 'Something went wrong. Please try again.'
    }, 500);
  }
};
