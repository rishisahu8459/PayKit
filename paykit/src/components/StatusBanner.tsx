export type PaymentStatus = 'idle' | 'processing' | 'success' | 'failed';

const DEFAULT_MESSAGES: Record<Exclude<PaymentStatus, 'idle'>, string> = {
  processing: 'Processing your payment…',
  success: 'Payment successful. Thank you!',
  failed: 'Payment failed. Please try again.',
};

export type StatusBannerProps = { status: PaymentStatus; message?: string };

/** The live region stays in the DOM even when idle: screen readers announce changes only to existing regions. */
export function StatusBanner({ status, message }: StatusBannerProps) {
  if (status === 'idle') return <div role="status" aria-live="polite" />;
  return (
    <div role="status" aria-live="polite" className={`paykit-status paykit-status--${status}`}>
      {message ?? DEFAULT_MESSAGES[status]}
    </div>
  );
}
