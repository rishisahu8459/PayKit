import { formatAmount } from '../format';

export type LineItem = { id: string; name: string; qty: number; unitMinor: number };

export type OrderSummaryProps = { items: LineItem[]; currency?: string; locale?: string };

export function OrderSummary({ items, currency = 'INR', locale = 'en-IN' }: OrderSummaryProps) {
  const total = items.reduce((sum, item) => sum + item.qty * item.unitMinor, 0);
  return (
    <section className="paykit-summary" aria-labelledby="paykit-summary-heading">
      <h2 id="paykit-summary-heading">Order summary</h2>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            {item.name} × {item.qty} <span>{formatAmount(item.qty * item.unitMinor, currency, locale)}</span>
          </li>
        ))}
      </ul>
      <p className="paykit-summary__total">
        <strong>Total</strong> <span>{formatAmount(total, currency, locale)}</span>
      </p>
    </section>
  );
}
