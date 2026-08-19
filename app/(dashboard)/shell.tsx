'use client';

import Link from 'next/link';
import { Fragment, useState, type ReactNode } from 'react';

import { Icon, type NombreIcono } from '@/src/components/icons';
import { NavLink } from '@/src/components/nav-link';

// grouped by what the item is for: first what needs a decision today, then the catalogues
const GRUPOS: { titulo: string; items: { href: string; label: string; icono: NombreIcono }[] }[] = [
  {
    titulo: 'Operación',
    items: [
      { href: '/', label: 'Tablero', icono: 'tablero' },
      { href: '/turnos', label: 'Turnos', icono: 'turnos' },
      { href: '/proyeccion', label: 'Proyección', icono: 'proyeccion' },
    ],
  },
  {
    titulo: 'Registros',
    items: [
      { href: '/equipos', label: 'Equipos', icono: 'equipos' },
      { href: '/operadores', label: 'Operadores', icono: 'operadores' },
      { href: '/auditoria', label: 'Auditoría', icono: 'auditoria' },
    ],
  },
];

const UN_ANIO = 60 * 60 * 24 * 365;

export interface Usuario {
  nombre: string;
  rol: string;
  puede: string;
}

/**
 * Application frame. It is a client component only because the sidebar collapses, and the
 * preference is read on the server from a cookie so the first paint is already the right
 * width — with `localStorage` the sidebar would visibly jump on every navigation.
 */
export function Shell({
  usuario,
  colapsadoInicial,
  cerrarSesion,
  children,
}: {
  usuario?: Usuario;
  colapsadoInicial: boolean;
  cerrarSesion: () => Promise<void>;
  children: ReactNode;
}) {
  const [colapsado, setColapsado] = useState(colapsadoInicial);

  function alternar() {
    const siguiente = !colapsado;
    setColapsado(siguiente);
    document.cookie = `sidebar=${siguiente ? '1' : '0'}; path=/; max-age=${UN_ANIO}; samesite=lax`;
  }

  return (
    <div
      className={`lg:grid lg:min-h-svh lg:transition-[grid-template-columns] lg:duration-200 lg:ease-out motion-reduce:lg:transition-none ${
        colapsado ? 'lg:grid-cols-[4.5rem_1fr]' : 'lg:grid-cols-[15rem_1fr]'
      }`}
    >
      {/* visible only on keyboard focus */}
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:m-2 focus:bg-ink focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Saltar al contenido
      </a>

      <nav
        aria-label="Secciones"
        className="flex min-w-0 flex-col border-b border-line bg-surface lg:sticky lg:top-0 lg:h-svh lg:border-r lg:border-b-0"
      >
        {/* fixed height: the brand block must not change the header size when it collapses */}
        <div
          className={`flex h-16 shrink-0 items-center border-line px-4 lg:border-b ${
            colapsado ? 'lg:justify-center lg:px-0' : ''
          }`}
        >
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center bg-ink text-sm font-semibold text-white"
            >
              M
            </span>
            <span className={`min-w-0 ${colapsado ? 'lg:hidden' : ''}`}>
              <span className="block truncate text-base leading-tight font-semibold tracking-tight">
                MineOps
              </span>
              <span className="rotulo block truncate">Faena · Cerro Verde</span>
            </span>
          </Link>
        </div>

        <ul className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
          {GRUPOS.map((g) => (
            <Fragment key={g.titulo}>
              {/* the group heading only fits the expanded desktop sidebar */}
              <li className={`rotulo hidden px-3 pt-5 pb-1.5 ${colapsado ? '' : 'lg:block'}`}>
                {g.titulo}
              </li>
              {g.items.map((s) => (
                <li key={s.href}>
                  <NavLink href={s.href} icono={s.icono} colapsado={colapsado}>
                    {s.label}
                  </NavLink>
                </li>
              ))}
            </Fragment>
          ))}
        </ul>

        <div className="mt-auto hidden border-t border-line p-3 lg:block">
          <button
            type="button"
            onClick={alternar}
            aria-expanded={!colapsado}
            aria-label={colapsado ? 'Expandir el menú lateral' : 'Contraer el menú lateral'}
            title={colapsado ? 'Expandir el menú lateral' : 'Contraer el menú lateral'}
            className={`flex w-full items-center gap-2.5 border border-line px-3 py-2 text-xs text-muted hover:border-accent hover:text-accent ${
              colapsado ? 'justify-center px-0' : ''
            }`}
          >
            <Icon name="panel" className="size-4 shrink-0" />
            <span className={colapsado ? 'sr-only' : ''}>Contraer menú</span>
          </button>
        </div>

        {usuario && (
          <div className="border-t border-line px-4 py-4 lg:px-3">
            <div className={colapsado ? 'lg:hidden' : ''}>
              <p className="truncate text-sm font-medium">{usuario.nombre}</p>
              <p className="rotulo mt-0.5">{usuario.rol}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{usuario.puede}</p>
            </div>

            <form action={cerrarSesion}>
              <button
                type="submit"
                title={colapsado ? 'Cerrar sesión' : undefined}
                className={`mt-2 flex items-center gap-2 text-xs text-muted hover:text-accent ${
                  colapsado ? 'lg:mt-0 lg:w-full lg:justify-center' : ''
                }`}
              >
                <Icon name="salir" className="size-4 shrink-0" />
                <span className={colapsado ? 'lg:sr-only' : ''}>Cerrar sesión</span>
              </button>
            </form>
          </div>
        )}
      </nav>

      <main id="contenido" className="min-w-0 px-6 py-8 lg:px-10 lg:py-10">
        {children}
      </main>
    </div>
  );
}
