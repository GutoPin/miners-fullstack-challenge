'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Icon, type NombreIcono } from './icons';

/**
 * Sidebar link that knows whether it is the current section: the only part of the nav that
 * needs the client, since `usePathname` does not exist on the server. `aria-current` is not
 * decoration — the highlight is colour alone, which a screen reader cannot announce. When the
 * sidebar is collapsed the label stays in the DOM as `sr-only`, so the link keeps its name.
 */
export function NavLink({
  href,
  icono,
  colapsado = false,
  children,
}: {
  href: string;
  icono: NombreIcono;
  colapsado?: boolean;
  children: string;
}) {
  const pathname = usePathname();
  const activo = href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={activo ? 'page' : undefined}
      title={colapsado ? children : undefined}
      className={`flex items-center gap-2.5 border-l-2 py-2.5 text-sm whitespace-nowrap ${
        colapsado ? 'justify-center px-2' : 'px-3'
      } ${
        activo
          ? 'border-accent bg-canvas font-medium text-accent'
          : 'border-transparent text-muted hover:bg-canvas hover:text-accent'
      }`}
    >
      <Icon name={icono} className="size-4.5 shrink-0" />
      <span className={colapsado ? 'sr-only' : ''}>{children}</span>
    </Link>
  );
}
