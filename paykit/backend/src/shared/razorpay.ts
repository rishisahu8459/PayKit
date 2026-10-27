import Razorpay from 'razorpay';
import { secret } from './config';

export interface RazorpayLike {
  orders: { create(opts: Record<string, unknown>): Promise<{ id: string }> };
  payments: {
    fetch(id: string): Promise<{ id: string; status: string; amount: number; order_id: string }>;
    refund(id: string, opts: Record<string, unknown>): Promise<{ id: string }>;
  };
}

let injected: RazorpayLike | undefined;
let client: RazorpayLike | undefined;

/** Tests inject a fake client here. Production code never calls this. */
export function setRazorpayForTests(fake: RazorpayLike) { injected = fake; }

export async function razorpay(): Promise<RazorpayLike> {
  if (injected) return injected;
  if (!client) {
    client = new Razorpay({
      key_id: await secret('razorpay/key-id'),
      key_secret: await secret('razorpay/key-secret'),
    }) as unknown as RazorpayLike;
  }
  return client;
}
