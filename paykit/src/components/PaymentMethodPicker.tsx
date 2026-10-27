import { useId } from 'react';

export type PaymentMethod = { id: string; label: string; hint?: string };

export type PaymentMethodPickerProps = {
  methods: PaymentMethod[];
  value: string;
  onChange: (id: string) => void;
  legend?: string;
};

/** Native radio buttons on purpose: browsers handle arrow keys, focus and announcements. */
export function PaymentMethodPicker({
  methods,
  value,
  onChange,
  legend = 'Payment method',
}: PaymentMethodPickerProps) {
  const groupName = useId();
  return (
    <fieldset className="paykit-picker">
      <legend>{legend}</legend>
      {methods.map((method) => {
        const inputId = `${groupName}-${method.id}`;
        return (
          <div className="paykit-picker__option" key={method.id}>
            <input
              id={inputId}
              type="radio"
              name={groupName}
              value={method.id}
              checked={value === method.id}
              onChange={() => onChange(method.id)}
            />
            <label htmlFor={inputId}>{method.label}</label>
            {method.hint && <small className="paykit-picker__hint"> {method.hint}</small>}
          </div>
        );
      })}
    </fieldset>
  );
}
