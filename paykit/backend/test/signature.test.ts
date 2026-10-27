import { createHmac } from 'crypto';
import { checkoutSignatureValid, webhookSignatureValid } from '../src/shared/signature';

const sign = (secret: string, payload: string) => createHmac('sha256', secret).update(payload).digest('hex');

test('accepts a correct checkout signature', () => {
  expect(checkoutSignatureValid('key_secret', 'order_1', 'pay_1', sign('key_secret', 'order_1|pay_1'))).toBe(true);
});

test('rejects a checkout signature for a different payment id', () => {
  expect(checkoutSignatureValid('key_secret', 'order_1', 'pay_2', sign('key_secret', 'order_1|pay_1'))).toBe(false);
});

test('webhook signature covers the exact raw body', () => {
  const body = '{"event":"payment.captured"}';
  expect(webhookSignatureValid('wh_secret', body, sign('wh_secret', body))).toBe(true);
  expect(webhookSignatureValid('wh_secret', body + ' ', sign('wh_secret', body))).toBe(false);
});
