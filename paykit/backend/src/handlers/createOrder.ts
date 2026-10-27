import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { PutCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../shared/db';
import { json, parse, header, log } from '../shared/http';
import { razorpay } from '../shared/razorpay';
import { secret } from '../shared/config';
import { claim, complete, release } from '../shared/idempotency';
import { merchantAuthorized } from '../shared/auth';
import { newOrderId } from '../shared/orders';
import { randomUUID } from 'crypto';

const SCOPE = 'orders';

export const handler = async (event: APIGatewayProxyEventV2) => {
  if (!(await merchantAuthorized(event))) return json(401, { error: 'unauthorized' });

  const key = header(event, 'idempotency-key') ?? '';
  if (key.length < 8 || key.length > 64) return json(400, { error: 'Idempotency-Key header required (8 to 64 characters)' });

  const body = parse(event.body);
  const amount = body.amountMinor;
  const currency = body.currency ?? 'INR';
  if (!Number.isInteger(amount) || amount < 100 || amount > 10_000_000) {
    return json(400, { error: 'amountMinor must be an integer from 100 to 10000000 (paise)' });
  }
  if (currency !== 'INR') return json(400, { error: 'only INR is supported in this version' });
  const customerEmail = typeof body.customerEmail === 'string' && body.customerEmail.length < 200 ? body.customerEmail : undefined;

  const c = await claim(SCOPE, key);
  if (c.state === 'replay') return json(201, c.response);
  if (c.state === 'in_progress') return json(409, { error: 'a request with this key is already in progress' });

  try {
    const orderId = newOrderId();
    const rzpOrder = await (await razorpay()).orders.create({ amount, currency, receipt: orderId, notes: { orderId } });
    const now = new Date().toISOString();
    await ddb.send(new TransactWriteCommand({ TransactItems: [
      { Put: { TableName: TABLE, ConditionExpression: 'attribute_not_exists(pk)', Item: {
        pk: `ORDER#${orderId}`, sk: 'META', orderId, status: 'CREATED', amountMinor: amount, currency,
        razorpayOrderId: rzpOrder.id, customerEmail, createdAt: now, updatedAt: now } } },
      { Put: { TableName: TABLE, Item: { pk: `ORDER#${orderId}`, sk: `EVT#${now}#${randomUUID()}`, event: 'ORDER_CREATED', detail: { amount }, at: now } } },
    ] }));
    const response = { orderId, razorpayOrderId: rzpOrder.id, amountMinor: amount, currency, keyId: await secret('razorpay/key-id') };
    await complete(SCOPE, key, response);
    log('order_created', { orderId });
    return json(201, response);
  } catch (e) {
    await release(SCOPE, key);
    log('create_order_failed', { err: String(e) });
    return json(502, { error: 'payment provider unavailable, please retry with the same key' });
  }
};
