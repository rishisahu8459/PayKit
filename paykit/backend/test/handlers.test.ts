import { createHmac } from 'crypto';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { resetMocks, ddbMock } from './mocks';
import { setRazorpayForTests } from '../src/shared/razorpay';
import { handler as createOrder } from '../src/handlers/createOrder';
import { handler as verifyPayment } from '../src/handlers/verifyPayment';
import { handler as webhook } from '../src/handlers/webhook';

const fakeRzp = {
  orders: { create: jest.fn(async () => ({ id: 'order_1' })) },
  payments: { fetch: jest.fn(), refund: jest.fn() },
} as any;
setRazorpayForTests(fakeRzp);

const event = (over: Record<string, any>) => ({
  headers: {}, body: '{}', isBase64Encoded: false, pathParameters: {}, ...over,
}) as any;

beforeEach(() => { resetMocks(); fakeRzp.orders.create.mockClear(); });

test('create order rejects a request without the merchant key', async () => {
  const r = await createOrder(event({ headers: { 'idempotency-key': 'key-12345678' }, body: '{"amountMinor":1000}' }));
  expect(r.statusCode).toBe(401);
});

test('create order rejects amounts that are not integers in range', async () => {
  const r = await createOrder(event({
    headers: { 'x-merchant-key': 'merchant-secret-123', 'idempotency-key': 'key-12345678' },
    body: '{"amountMinor":10.5}',
  }));
  expect(r.statusCode).toBe(400);
});

test('a retry with the same idempotency key returns the stored response and creates nothing new', async () => {
  const stored = { orderId: 'ord_stored', razorpayOrderId: 'order_9', amountMinor: 1000, currency: 'INR', keyId: 'rzp_test_abc' };
  ddbMock.on(PutCommand).rejects(Object.assign(new Error('exists'), { name: 'ConditionalCheckFailedException' }));
  ddbMock.on(GetCommand).resolves({ Item: { state: 'DONE', response: stored } });
  const r = await createOrder(event({
    headers: { 'x-merchant-key': 'merchant-secret-123', 'idempotency-key': 'key-12345678' },
    body: '{"amountMinor":1000}',
  }));
  expect(r.statusCode).toBe(201);
  expect(JSON.parse(r.body as string)).toEqual(stored);
  expect(fakeRzp.orders.create).not.toHaveBeenCalled();
});

test('verify rejects a tampered signature and does not touch the order', async () => {
  ddbMock.on(GetCommand).resolves({ Item: { orderId: 'ord_1', status: 'CREATED', razorpayOrderId: 'order_1' } });
  const r = await verifyPayment(event({
    body: JSON.stringify({ orderId: 'ord_1', razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: 'forged' }),
  }));
  expect(r.statusCode).toBe(400);
  expect(fakeRzp.payments.fetch).not.toHaveBeenCalled();
});

test('webhook rejects an unsigned request', async () => {
  const r = await webhook(event({ body: '{"event":"payment.captured"}', headers: { 'x-razorpay-signature': 'nope', 'x-razorpay-event-id': 'evt_1' } }));
  expect(r.statusCode).toBe(401);
});

test('webhook ignores a duplicate event id', async () => {
  const body = '{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_1","notes":{"orderId":"ord_1"}}}}}';
  const sig = createHmac('sha256', 'wh_secret').update(body).digest('hex');
  ddbMock.on(PutCommand).rejects(Object.assign(new Error('exists'), { name: 'ConditionalCheckFailedException' }));
  ddbMock.on(GetCommand).resolves({ Item: { state: 'DONE' } });
  const r = await webhook(event({ body, headers: { 'x-razorpay-signature': sig, 'x-razorpay-event-id': 'evt_1' } }));
  expect(JSON.parse(r.body as string)).toEqual({ ok: true, duplicate: true });
  expect(fakeRzp.payments.fetch).not.toHaveBeenCalled();
});
