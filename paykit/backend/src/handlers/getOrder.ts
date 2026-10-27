import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { json } from '../shared/http';
import { merchantAuthorized } from '../shared/auth';
import { getOrder } from '../shared/orders';

export const handler = async (event: APIGatewayProxyEventV2) => {
  if (!(await merchantAuthorized(event))) return json(401, { error: 'unauthorized' });
  const id = event.pathParameters?.orderId;
  const o = id ? await getOrder(id) : undefined;
  if (!o) return json(404, { error: 'not found' });
  return json(200, {
    orderId: o.orderId, status: o.status, amountMinor: o.amountMinor, currency: o.currency,
    paymentId: o.paymentId, refundId: o.refundId, createdAt: o.createdAt, updatedAt: o.updatedAt,
  });
};
