import { SQSEvent } from 'aws-lambda';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { getOrder } from '../shared/orders';

const ses = new SESClient({});

/** SQS consumer. A thrown error leaves the message in the queue, and after 3 tries it moves to the DLQ. */
export const handler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    const { orderId } = JSON.parse(record.body);
    const order = await getOrder(orderId);
    if (!order?.customerEmail) continue;
    await ses.send(new SendEmailCommand({
      Source: process.env.SENDER_EMAIL!,
      Destination: { ToAddresses: [order.customerEmail] },
      Message: {
        Subject: { Data: `Payment received for ${orderId}` },
        Body: { Text: { Data: `We received Rs ${(order.amountMinor / 100).toFixed(2)} for order ${orderId}. Thank you.` } },
      },
    }));
  }
};
