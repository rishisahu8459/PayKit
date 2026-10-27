import { formatAmount } from '../format';

test('formats paise as rupees', () => {
  expect(formatAmount(249900, 'INR')).toBe('₹2,499.00');
});
test('rejects fractional amounts', () => {
  expect(() => formatAmount(10.5, 'INR')).toThrow(RangeError);
});
test('rejects negative amounts', () => {
  expect(() => formatAmount(-1, 'INR')).toThrow(RangeError);
});
