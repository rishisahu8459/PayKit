import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { json, header, log } from '../shared/http';
import { secret } from '../shared/config';
import { webhookSignatureValid } from '../shared/signature';
import { claim, complete, release } from '../shared/idempotency';
import { capture } from '../shared/orders';

/** Razorpay webhook. Verify the raw body first, then dedupe by Razorpay's event id. */
export const handler = async (event: APIGatewayProxyEventV2) => {
  const raw = event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64').toString('utf8') : event.body ?? '';
  const sig = header(event, 'x-razorpay-signature') ?? '';
  if (!webhookSignatureValid(await secret('razorpay/webhook-secret'), raw, sig)) {
    return json(401, { error: 'invalid signature' });
  }
  const eventId = header(event, 'x-razorpay-event-id') ?? '';
  if (!eventId) return json(400, { error: 'missing event id' });

  const c = await claim('webhook', eventId);
  if (c.state !== 'new') return json(200, { ok: true, duplicate: true });

  try {
    const evt = JSON.parse(raw);
    if (evt.event === 'payment.captured') {
      const p = evt.payload?.payment?.entity;
      const orderId = p?.notes?.orderId;
      if (orderId && p?.id) {
        const result = await capture(orderId, p.id, 'webhook');
        log('webhook_processed', { orderId, result });
      }
    }
    await complete('webhook', eventId, { ok: true });
    return json(200, { ok: true });
  } catch (e) {
    await release('webhook', eventId);
    log('webhook_failed', { err: String(e) });
    return json(500, { error: 'retry' }); // Razorpay retries on non-2xx
  }
};
