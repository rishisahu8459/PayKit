import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { resetMocks, ddbMock, sqsMock } from './mocks';
import { capture, transition } from '../src/shared/orders';
import { setRazorpayForTests } from '../src/shared/razorpay';

const order = { pk: 'ORDER#ord_1', sk: 'META', orderId: 'ord_1', status: 'CREATED', amountMinor: 249900, currency: 'INR', razorpayOrderId: 'order_1', createdAt: '', updatedAt: '' };
const fakeRazorpay = (payment: object) => ({
  orders: { create: jest.fn() },
  payments: { fetch: jest.fn(async () => payment), refund: jest.fn() },
}) as any;

beforeEach(resetMocks);

test('transition returns false when another request already moved the order', async () => {
  ddbMock.on(TransactWriteCommand).rejects(
    Object.assign(new TransactionCanceledException({ message: 'cancelled', $metadata: {}, CancellationReasons: [] }), { name: 'TransactionCanceledException' }),
  );
  expect(await transition({ orderId: 'ord_1', from: 'CREATED', to: 'PAID', event: 'PAYMENT_CAPTURED' })).toBe(false);
});

test('transition writes the status change and the ledger event in one transaction', async () => {
  expect(await transition({ orderId: 'ord_1', from: 'CREATED', to: 'PAID', event: 'PAYMENT_CAPTURED', extra: { paymentId: 'pay_1' } })).toBe(true);
  const sent = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
  expect(sent).toHaveLength(2);
  expect(sent[1].Put!.Item!.event).toBe('PAYMENT_CAPTURED');
});

test('capture marks a valid payment as paid and queues one receipt', async () => {
  setRazorpayForTests(fakeRazorpay({ id: 'pay_1', status: 'captured', amount: 249900, order_id: 'order_1' }));
  ddbMock.on(GetCommand).resolves({ Item: order });
  expect(await capture('ord_1', 'pay_1', 'checkout')).toBe('paid');
  expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(1);
});

test('capture rejects a payment whose amount does not match the order', async () => {
  setRazorpayForTests(fakeRazorpay({ id: 'pay_1', status: 'captured', amount: 100, order_id: 'order_1' }));
  ddbMock.on(GetCommand).resolves({ Item: order });
  expect(await capture('ord_1', 'pay_1', 'checkout')).toBe('rejected');
  expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(0);
});

test('capture does nothing for an order that is no longer CREATED', async () => {
  setRazorpayForTests(fakeRazorpay({}));
  ddbMock.on(GetCommand).resolves({ Item: { ...order, status: 'PAID' } });
  expect(await capture('ord_1', 'pay_1', 'webhook')).toBe('already_processed');
});
