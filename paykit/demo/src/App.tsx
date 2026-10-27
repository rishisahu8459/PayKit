import { useState } from 'react';
import { OrderSummary, PaymentMethodPicker, StatusBanner, formatAmount } from '../../src';
import type { PaymentStatus } from '../../src';
import '../../src/theme.css';

/** Product ids must match the catalog in api/create-order.ts. The browser never sets prices. */
const PRODUCTS = [
  { id: 'p1', name: 'Trail Backpack 30L', unitMinor: 249900 },
  { id: 'p2', name: 'Insulated Bottle 1L', unitMinor: 89900 },
];

const METHODS = [
  { id: 'card', label: 'Card' },
  { id: 'upi', label: 'UPI', hint: 'Pay with any UPI app' },
];

export default function App() {
  const [qty, setQty] = useState<Record<string, number>>({ p1: 1 });
  const [method, setMethod] = useState('card');
  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [message, setMessage] = useState<string | undefined>();

  const items = PRODUCTS.filter((p) => (qty[p.id] ?? 0) > 0)
    .map((p) => ({ id: p.id, name: p.name, qty: qty[p.id], unitMinor: p.unitMinor }));
  const total = items.reduce((s, i) => s + i.qty * i.unitMinor, 0);

  async function pay() {
    setStatus('processing');
    setMessage(undefined);

    const res = await fetch('/api/create-order', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: items.map(({ id, qty }) => ({ id, qty })) }),
    });
    const order = await res.json();
    if (!res.ok) {
      setStatus('failed');
      setMessage(order.error ?? 'Could not start payment');
      return;
    }

    const checkout = new window.Razorpay({
      key: order.keyId,
      order_id: order.razorpayOrderId,
      amount: order.amountMinor,
      currency: order.currency,
      name: 'PayKit demo',
      description: 'Test payment, no real money',
      handler: async (r: any) => {
        // Confirm with the PayKit backend. The backend re-checks the payment with Razorpay.
        const v = await fetch(`${import.meta.env.VITE_PAYKIT_API}/payments/verify`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            orderId: order.orderId,
            razorpay_order_id: r.razorpay_order_id,
            razorpay_payment_id: r.razorpay_payment_id,
            razorpay_signature: r.razorpay_signature,
          }),
        });
        const d = await v.json();
        if (v.ok && (d.result === 'paid' || d.result === 'already_processed')) {
          setStatus('success');
        } else {
          setStatus('failed');
          setMessage('We could not confirm the payment. Check your order status.');
        }
      },
      modal: { ondismiss: () => setStatus('idle') },
      // The picker is a demo of the component. Razorpay shows its own method list.
      theme: { color: '#1d6fa5' },
    });
    checkout.on('payment.failed', (e: any) => {
      setStatus('failed');
      setMessage(e.error?.description ?? 'Payment failed. Please try again.');
    });
    checkout.open();
  }

  return (
    <main style={{ maxWidth: 560, margin: '2rem auto', padding: '0 1rem', display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>PayKit demo store</h1>

      <section style={{ display: 'grid', gap: 8 }}>
        {PRODUCTS.map((p) => (
          <div key={p.id} className="paykit-summary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              {p.name} <small>{formatAmount(p.unitMinor, 'INR')}</small>
            </span>
            <label>
              Qty{' '}
              <select
                value={qty[p.id] ?? 0}
                onChange={(e) => setQty({ ...qty, [p.id]: Number(e.target.value) })}
              >
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </section>

      {items.length > 0 && <OrderSummary items={items} />}

      <PaymentMethodPicker methods={METHODS} value={method} onChange={setMethod} />

      <button
        onClick={pay}
        disabled={total === 0 || status === 'processing'}
        style={{ padding: '12px 16px', fontSize: 16, borderRadius: 8, cursor: 'pointer' }}
      >
        {status === 'processing' ? 'Starting payment…' : `Pay ${formatAmount(total, 'INR')}`}
      </button>

      <StatusBanner status={status} message={message} />
    </main>
  );
}
