'use client';

import type { ReactNode } from 'react';

/**
 * Link to another panel of the same screen. The browser still performs the jump and matches
 * `:target`, which is what draws the highlight; this only moves the keyboard focus into the
 * panel's first field, so the action ends on something the user can type into instead of on a
 * page that merely scrolled. Without JavaScript it degrades to the plain anchor it already is.
 */
export function IrAPanel({
  objetivo,
  className,
  children,
}: {
  objetivo: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={`#${objetivo}`}
      className={className}
      onClick={() => {
        // after the browser has jumped, never before
        requestAnimationFrame(() => {
          document
            .getElementById(objetivo)
            ?.querySelector<HTMLElement>('select, input, textarea')
            ?.focus({ preventScroll: true });
        });
      }}
    >
      {children}
    </a>
  );
}
