import { render, screen } from '@testing-library/react';
import { StatusBanner } from '../components/StatusBanner';

test('announces processing politely to screen readers', () => {
  render(<StatusBanner status="processing" />);
  const banner = screen.getByRole('status');
  expect(banner).toHaveTextContent('Processing your payment');
  expect(banner).toHaveAttribute('aria-live', 'polite');
});
test('shows a custom message when provided', () => {
  render(<StatusBanner status="failed" message="Card declined" />);
  expect(screen.getByRole('status')).toHaveTextContent('Card declined');
});
test('keeps the live region in the page when idle', () => {
  render(<StatusBanner status="idle" />);
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});
