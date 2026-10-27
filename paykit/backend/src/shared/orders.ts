import { GetCommand, TransactWriteCommand, TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { randomUUID } from 'crypto';
import { ddb, TABLE } from './db';
import { log } from './http';
import { razorpay } from './razorpay';

export type OrderStatus = 'CREATED' | 'PAID' | 'REFUND_REQUESTED' | 'REFUNDED';

export type Order = {
  pk: string; sk: 'META'; orderId: string; status: OrderStatus;
  amountMinor: number; currency: string; razorpayOrderId: string;
  paymentId?: string; refundId?: string; customerEmail?: string;
  createdAt: string; updatedAt: string;
};

export async function getOrder(orderId: string): Promise<Order | undefined> {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk: `ORDER#${orderId}`, sk: 'META' } }));
  return r.Item as Order | undefined;
}

export const newOrderId = () => `ord_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

/**
 * Atomically move an order from `from` to `to` and append a ledger event.
 * The condition means exactly one caller wins when the browser callback and the
 * webhook race. The loser gets `false` and must do nothing.
 */
export async function transition(p: {
  orderId: string; from: OrderStatus; to: OrderStatus; event: string;
  extra?: Record<string, unknown>; detail?: Record<string, unknown>;
}): Promise<boolean> {
  const now = new Date().toISOString();
  const names: Record<string, string> = { '#s': 'status' };
  const values: Record<string, unknown> = { ':from': p.from, ':to': p.to, ':now': now };
  let set = '#s = :to, updatedAt = :now';
  Object.entries(p.extra ?? {}).forEach(([k, v], i) => {
    names[`#e${i}`] = k; values[`:e${i}`] = v; set += `, #e${i} = :e${i}`;
  });
  const input: TransactWriteCommandInput = {
    TransactItems: [
      { Update: {
        TableName: TABLE, Key: { pk: `ORDER#${p.orderId}`, sk: 'META' },
        UpdateExpression: `SET ${set}`,
        ConditionExpression: 'attribute_exists(pk) AND #s = :from',
        ExpressionAttributeNames: names, ExpressionAttributeValues: values,
      } },
      { Put: {
        TableName: TABLE,
        Item: { pk: `ORDER#${p.orderId}`, sk: `EVT#${now}#${randomUUID()}`, event: p.event, detail: p.detail ?? {}, at: now },
      } },
    ],
  };
  try {
    await ddb.send(new TransactWriteCommand(input));
    return true;
  } catch (e: any) {
    if (e.name === 'TransactionCanceledException') return false;
    throw e;
  }
}

/** Confirm the payment with Razorpay before marking the order paid. Never trust the browser alone. */
export async function capture(orderId: string, paymentId: string, source: 'checkout' | 'webhook'):
  Promise<'paid' | 'already_processed' | 'rejected'> {
  const order = await getOrder(orderId);
  if (!order) return 'rejected';
  if (order.status !== 'CREATED') return 'already_processed';

  const payment = await (await razorpay()).payments.fetch(paymentId);
  if (payment.status !== 'captured' || payment.amount !== order.amountMinor || payment.order_id !== order.razorpayOrderId) {
    log('payment_rejected', { orderId, paymentId, paymentStatus: payment.status });
    return 'rejected';
  }
  const ok = await transition({
    orderId, from: 'CREATED', to: 'PAID', event: 'PAYMENT_CAPTURED',
    extra: { paymentId }, detail: { source, paymentId },
  });
  if (!ok) return 'already_processed';
  await new SQSClient({}).send(new SendMessageCommand({
    QueueUrl: process.env.QUEUE_URL!, MessageBody: JSON.stringify({ orderId }),
  }));
  return 'paid';
}
