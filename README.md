# PayKit

An accessible, themeable checkout component library for React, plus a serverless payments backend on AWS. The backend confirms payments with Razorpay, handles webhooks safely, runs refunds through a Step Functions workflow, and sends receipts.

## Repository layout

```
src/          @paykit/ui: React components, design tokens, formatting
backend/      AWS CDK stack and Lambda handlers (orders, verification, webhooks, refunds, receipts)
demo/         Demo storefront built with Vite, uses @paykit/ui and the live backend
api/          Vercel function that acts as the demo merchant server
```

## Part 1: UI library (`@paykit/ui`)

### Components

| Export | What it does |
|---|---|
| `PaymentMethodPicker` | Radio-group picker for payment methods. Native radios give keyboard and screen-reader support. |
| `OrderSummary` | Line items and total, formatted in the customer's currency. |
| `StatusBanner` | Live region for payment status (`processing`, `success`, `failed`). Always rendered, so screen readers announce changes. |
| `formatAmount` | Formats an integer amount in minor units (paise, cents). |
| `theme.css` | Design tokens as CSS variables. Dark theme via `data-theme="dark"`. |

### Usage

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

### Develop

```bash
npm install
npm test          # 3 suites, 8 tests (unit and jest-axe accessibility checks)
npm run typecheck
npm run build     # outputs dist/
```

## Part 2: Backend (`backend/`)

### What it does

- **Creates orders** with a merchant key and a required `Idempotency-Key`, so a retry returns the same order.
- **Verifies payments** after checkout. It checks the Razorpay signature, then fetches the payment from Razorpay and confirms its status, amount, and order.
- **Handles webhooks.** It checks the signature on the raw body and deduplicates by Razorpay's event ID.
- **Refunds** run through a Step Functions state machine. Only infrastructure errors are retried. Provider errors roll the order back.
- **Sends receipts** through an SQS queue and SES, with a dead-letter queue after 3 failed attempts.

### Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/orders` | `x-merchant-key`, `Idempotency-Key` | Create an order (amount in paise, INR only) |
| GET | `/orders/{orderId}` | `x-merchant-key` | Read order status |
| POST | `/orders/{orderId}/refunds` | `x-merchant-key` | Start a refund (PAID orders only) |
| POST | `/payments/verify` | Razorpay signature | Browser callback after checkout |
| POST | `/webhooks/razorpay` | Razorpay signature | Payment events from Razorpay |

### Order states

`CREATED` → `PAID` → `REFUND_REQUESTED` → `REFUNDED`. A failed refund returns the order to `PAID`. Each change is written in a DynamoDB transaction with a ledger event, so only one request can win a race.

### AWS resources

- DynamoDB table `PayKit`: orders, ledger events, and idempotency records (TTL on `ttl`).
- SQS receipts queue and dead-letter queue.
- Step Functions refund state machine.
- SES for receipt emails.
- API Gateway HTTP API with throttling (20 requests per second, burst 50).
- Secrets in SSM Parameter Store under `/paykit/…`.

### Setup

```bash
cd backend
npm install
npm test                 # 3 suites, 14 tests
npm run typecheck
npx cdk synth           # builds the template without calling AWS
```

Required secrets (SSM Parameter Store, type SecureString):

| Name | Value |
|---|---|
| `/paykit/razorpay/key-id` | Razorpay test Key ID |
| `/paykit/razorpay/key-secret` | Razorpay test Key Secret |
| `/paykit/razorpay/webhook-secret` | a random string you choose, also set in the Razorpay webhook |
| `/paykit/merchant-key` | a random string the merchant server sends in `x-merchant-key` |

Deploy:

```bash
export SENDER_EMAIL=an-address-verified-in-ses
npx cdk bootstrap
npx cdk deploy          # prints the ApiUrl output
```

Then add the webhook in the Razorpay dashboard (Test Mode): URL `ApiUrl + /webhooks/razorpay`, event `payment.captured`. The step-by-step guide covers every step, including test payments.

### Design decisions

- **Amounts are integers in minor units.** Floats cause rounding errors.
- **The browser never sets a price.** The merchant server sets amounts, and the backend re-checks each payment with Razorpay.
- **Signatures use constant-time comparison** on the exact bytes Razorpay signed.
- **One conditional transaction per transition.** The browser callback and the webhook can race, and exactly one wins.
- **Retry policy is deliberate.** Infrastructure errors are retried. Provider errors are not, because a blind refund retry could refund twice.

### Known limitations

1. Receipt sending is not atomic with the payment write. A crash between them can lose a receipt. The fix is a transactional outbox or DynamoDB Streams.
2. A crash during a refund can leave an order in `REFUND_REQUESTED`. The fix is to reconcile with Razorpay's `refund.processed` webhook.
3. The merchant key is shared, not per merchant. A multi-merchant system needs one key per merchant, stored hashed, with rotation.
4. The demo table is set to delete with the stack. A real ledger should use `RETAIN`.
5. CORS allows all origins. Restrict it to your storefront.
6. Test mode only. Live keys need a separate stack, separate secrets, and a review.

## Part 3: Demo storefront (`demo/`) and merchant function (`api/`)

The storefront calls `/api/create-order`, which is a Vercel function. That function holds the merchant key and sets prices from its own catalog, so neither reaches the browser. The storefront then opens Razorpay test checkout and confirms the payment with the backend.

Environment variables:

| Variable | Where | Value |
|---|---|---|
| `VITE_PAYKIT_API` | Vercel, browser-visible | the backend `ApiUrl` |
| `PAYKIT_API_URL` | Vercel, server only | the backend `ApiUrl` |
| `PAYKIT_MERCHANT_KEY` | Vercel, server only | the value of `/paykit/merchant-key` |

Run it locally with `npx vercel dev` after installing the Vercel CLI, or build it with `npx vite build --config demo/vite.config.ts`.

The payment method picker in the demo is for display. Razorpay Checkout shows its own method list.

## Status

- UI library: complete and tested (8 tests).
- Backend: complete and tested with unit tests and an offline CDK synth (14 tests). Live deployment and a test payment are your next steps.
- Demo storefront: builds. Not deployed yet.

## License

MIT
