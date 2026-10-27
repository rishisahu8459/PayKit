# PayKit

Accessible, themeable checkout components for React, with a serverless payments backend on AWS (added in a later phase).

**Status:** In progress. UI components are complete and tested. Backend not built yet.

## What's included
- `PaymentMethodPicker`: radio-group picker with keyboard support.
- `OrderSummary`: line items and total in the customer's currency.
- `StatusBanner`: live region for payment status, announced to screen readers.
- `formatAmount`: money formatting using integer minor units.
- `theme.css`: design tokens. Light and dark themes via `data-theme="dark"`.

## Usage
```tsx
import '@paykit/ui/dist/theme.css';
import { PaymentMethodPicker, OrderSummary, StatusBanner } from '@paykit/ui';

export function Checkout() {
  const [method, setMethod] = useState('card');
  return (
    <>
      <OrderSummary items={[{ id: 'p1', name: 'Trail Backpack', qty: 1, unitMinor: 249900 }]} />
      <PaymentMethodPicker
        methods={[{ id: 'card', label: 'Card' }, { id: 'upi', label: 'UPI', hint: 'Pay with any UPI app' }]}
        value={method}
        onChange={setMethod}
      />
      <StatusBanner status="idle" />
    </>
  );
}
```

## Develop
```bash
npm install
npm test          # 8 unit and accessibility tests
npm run typecheck
npm run build     # outputs dist/
```

## Design decisions
- **Money as integers in minor units** (paise, cents). Floats cause rounding errors.
- **Native radio buttons** handle keyboard navigation and focus without extra code.
- **Live region always rendered**, because screen readers announce changes only to regions that already exist.
- **CSS variables for theming**, so a brand changes colours without changing components.

## Known limitations
- Zero-decimal currencies (such as JPY) aren't handled. `formatAmount` assumes two decimal places.
- jest-axe checks catch common issues but aren't a full audit. Test manually with a screen reader.
- No Storybook yet.

## License
MIT
