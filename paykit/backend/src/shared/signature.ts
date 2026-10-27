import { createHmac, timingSafeEqual } from 'crypto';

const hmacHex = (secret: string, payload: string) => createHmac('sha256', secret).update(payload).digest('hex');

/** Constant-time comparison, so an attacker cannot guess a signature one character at a time. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Checkout callback: HMAC-SHA256 of "orderId|paymentId" with the key secret. */
export const checkoutSignatureValid = (keySecret: string, rzpOrderId: string, paymentId: string, signature: string) =>
  safeEqual(hmacHex(keySecret, `${rzpOrderId}|${paymentId}`), signature);

/** Webhook: HMAC-SHA256 of the RAW request body. Re-serialised JSON will not match. */
export const webhookSignatureValid = (webhookSecret: string, rawBody: string, signature: string) =>
  safeEqual(hmacHex(webhookSecret, rawBody), signature);
