import { randomUUID } from 'crypto';

/**
 * Demo merchant server. It runs on Vercel, so the merchant key stays on the server.
 * Prices are set here, not in the browser. Real merchants read prices from their own database.
 */
const CATALOG: Record<string, number> = { p1: 249900, p2: 89900 };

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
  const items = body.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 10) {
    return res.status(400).json({ error: 'invalid items' });
  }

  let amountMinor = 0;
  for (const item of items) {
    const unit = CATALOG[item?.id];
    if (!unit || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 10) {
      return res.status(400).json({ error: 'invalid item' });
    }
    amountMinor += unit * item.qty;
  }

  const upstream = await fetch(`${process.env.PAYKIT_API_URL}/orders`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-merchant-key': process.env.PAYKIT_MERCHANT_KEY ?? '',
      'idempotency-key': `demo-${randomUUID()}`,
    },
    body: JSON.stringify({ amountMinor, currency: 'INR' }),
  });
  const data = await upstream.json();
  return res.status(upstream.status).json(data);
}
