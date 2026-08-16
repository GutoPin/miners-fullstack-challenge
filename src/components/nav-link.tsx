'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Enlace de la barra lateral que sabe si es la sección actual. Es lo único de la navegación
 * que necesita correr en el cliente: `usePathname` no existe en el servidor.
 *
 * `aria-current="page"` no es adorno: sin él, quien usa lector de pantalla no tiene forma
 * de saber en qué pantalla está, porque el resalte es solo color.
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
