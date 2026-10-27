import { getOrder, transition } from '../shared/orders';
import { razorpay } from '../shared/razorpay';
import { log } from '../shared/http';

type Input = { orderId: string; action?: 'refund' | 'markFailed' };

/** Step Functions task. Runs the Razorpay refund, or rolls the order back if the refund failed. */
export const handler = async (input: Input) => {
  const order = await getOrder(input.orderId);
  if (!order) throw new Error(`order ${input.orderId} not found`);

  if (input.action === 'markFailed') {
    await transition({ orderId: order.orderId, from: 'REFUND_REQUESTED', to: 'PAID', event: 'REFUND_FAILED' });
    log('refund_failed', { orderId: order.orderId });
    return { status: 'failed' };
  }
  if (order.status === 'REFUNDED') return { status: 'already_refunded', refundId: order.refundId };
  if (order.status !== 'REFUND_REQUESTED' || !order.paymentId) throw new Error(`unexpected status ${order.status}`);

  const refund = await (await razorpay()).payments.refund(order.paymentId, {
    amount: order.amountMinor, speed: 'normal', notes: { orderId: order.orderId },
  });
  const ok = await transition({
    orderId: order.orderId, from: 'REFUND_REQUESTED', to: 'REFUNDED', event: 'REFUNDED',
    extra: { refundId: refund.id }, detail: { refundId: refund.id },
  });
  return { status: ok ? 'refunded' : 'already_refunded', refundId: refund.id };
};
