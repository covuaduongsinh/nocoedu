import type { ReactElement } from 'react';

/**
 * A compact dropdown for a list filter (branch, class, status): the same native select the forms use, with its label
 * for assistive technology and the choice that means "no filter" first.
 */
export function FilterSelect(props: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly { value: string; label: string }[];
  /** The text of the first choice, the one that applies no filter (its value is `allValue`). */
  readonly allLabel: string;
  readonly allValue?: string;
}): ReactElement {
  return (
    <select
      aria-label={props.label}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      className='h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
    >
      <option value={props.allValue ?? ''}>{props.allLabel}</option>
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
