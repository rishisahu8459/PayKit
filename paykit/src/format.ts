/**
 * Formats an amount in minor units (paise for INR, cents for USD) as a currency string.
 * Money is never stored as a float: integers avoid rounding errors.
 */
export function formatAmount(minorUnits: number, currency: string, locale = 'en-IN'): string {
  if (!Number.isInteger(minorUnits) || minorUnits < 0) {
    throw new RangeError('amount must be a non-negative integer in minor units');
  }
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minorUnits / 100);
}
