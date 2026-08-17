'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Sidebar link that knows whether it is the current section: the only part of the nav that
 * needs the client, since `usePathname` does not exist on the server. `aria-current` is not
 * decoration — the highlight is colour alone, which a screen reader cannot announce.
 */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const activo = href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={activo ? 'page' : undefined}
      className={`block border-l-2 px-3 py-2 text-sm whitespace-nowrap ${
        activo
          ? 'border-accent bg-canvas font-medium text-accent'
          : 'border-transparent hover:bg-canvas hover:text-accent'
      }`}
    >
      {children}
    </Link>
  );
}
