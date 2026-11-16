import type { ComponentProps, ReactElement } from 'react';

/**
 * The part of a page that goes on paper. While printing, `client/styles.css` removes everything outside this element
 * and pins it to the paper palette, so the shell, the page header and the buttons never reach the printer. A page
 * renders at most one. Mark what belongs to the screen only (a button inside the area) with `data-print-hidden`.
 */
export function PrintArea(props: ComponentProps<'div'>): ReactElement {
  return <div {...props} data-print-area='' />;
}
