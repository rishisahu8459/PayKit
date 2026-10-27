import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { PaymentMethodPicker } from '../components/PaymentMethodPicker';

expect.extend(toHaveNoViolations);

const methods = [
  { id: 'card', label: 'Card' },
  { id: 'upi', label: 'UPI', hint: 'Pay with any UPI app' },
];

test('calls onChange with the chosen method', async () => {
  const onChange = jest.fn();
  render(<PaymentMethodPicker methods={methods} value="card" onChange={onChange} />);
  await userEvent.click(screen.getByLabelText('UPI'));
  expect(onChange).toHaveBeenCalledWith('upi');
});

test('has no accessibility violations', async () => {
  const { container } = render(
    <PaymentMethodPicker methods={methods} value="card" onChange={() => {}} />,
  );
  expect(await axe(container)).toHaveNoViolations();
});
