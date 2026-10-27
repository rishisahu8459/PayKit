import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { json } from '../shared/http';
import { merchantAuthorized } from '../shared/auth';
import { getOrder, transition } from '../shared/orders';

const sfn = new SFNClient({});

/** Moves PAID to REFUND_REQUESTED, then hands the money movement to Step Functions. */
export const handler = async (event: APIGatewayProxyEventV2) => {
  if (!(await merchantAuthorized(event))) return json(401, { error: 'unauthorized' });
  const orderId = event.pathParameters?.orderId ?? '';
  const order = await getOrder(orderId);
  if (!order) return json(404, { error: 'not found' });
  if (order.status !== 'PAID') return json(409, { error: `order is ${order.status}; only PAID orders can be refunded` });

  const ok = await transition({ orderId, from: 'PAID', to: 'REFUND_REQUESTED', event: 'REFUND_REQUESTED' });
  if (!ok) return json(409, { error: 'refund already in progress' });

  await sfn.send(new StartExecutionCommand({
    stateMachineArn: process.env.REFUND_STATE_MACHINE_ARN!,
    name: `refund-${orderId}`, // unique name: Step Functions rejects a second run for the same order
    input: JSON.stringify({ orderId }),
  }));
  return json(202, { orderId, status: 'REFUND_REQUESTED' });
};
