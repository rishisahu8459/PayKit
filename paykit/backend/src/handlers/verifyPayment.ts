import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { json, parse } from '../shared/http';
import { secret } from '../shared/config';
import { checkoutSignatureValid } from '../shared/signature';
import { getOrder, capture } from '../shared/orders';

/** Browser callback after checkout. The webhook is the backup if the browser closes early. */
export const handler = async (event: APIGatewayProxyEventV2) => {
  const b = parse(event.body);
  const fields = [b.orderId, b.razorpay_order_id, b.razorpay_payment_id, b.razorpay_signature];
  if (!fields.every((v) => typeof v === 'string' && v.length > 0 && v.length < 100)) {
    return json(400, { error: 'missing fields' });
  }
  const order = await getOrder(b.orderId);
  if (!order) return json(404, { error: 'order not found' });
  if (order.razorpayOrderId !== b.razorpay_order_id) return json(400, { error: 'order mismatch' });
  if (!checkoutSignatureValid(await secret('razorpay/key-secret'), b.razorpay_order_id, b.razorpay_payment_id, b.razorpay_signature)) {
    return json(400, { error: 'invalid signature' });
  }
  return json(200, { result: await capture(b.orderId, b.razorpay_payment_id, 'checkout') });
};
