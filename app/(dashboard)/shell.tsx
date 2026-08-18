'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { Icon, type NombreIcono } from '@/src/components/icons';
import { NavLink } from '@/src/components/nav-link';

// ordered by how the day runs: what needs a decision first, catalogues and traceability after
const SECCIONES: { href: string; label: string; icono: NombreIcono }[] = [
  { href: '/', label: 'Tablero', icono: 'tablero' },
  { href: '/turnos', label: 'Turnos', icono: 'turnos' },
  { href: '/proyeccion', label: 'Proyección', icono: 'proyeccion' },
  { href: '/equipos', label: 'Equipos', icono: 'equipos' },
  { href: '/operadores', label: 'Operadores', icono: 'operadores' },
  { href: '/auditoria', label: 'Auditoría', icono: 'auditoria' },
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
      className={`lg:grid lg:min-h-svh ${colapsado ? 'lg:grid-cols-[4rem_1fr]' : 'lg:grid-cols-[15rem_1fr]'}`}
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
        className="flex flex-col border-b border-line bg-surface lg:sticky lg:top-0 lg:h-svh lg:border-r lg:border-b-0"
      >
        <div
          className={`flex items-center justify-between gap-2 px-4 py-4 ${colapsado ? 'lg:justify-center lg:px-2' : ''}`}
        >
          <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center bg-ink text-sm font-semibold text-white"
            >
              M
            </span>
            <span className={colapsado ? 'lg:hidden' : ''}>
              <span className="block text-base leading-tight font-semibold tracking-tight">
                MineOps
              </span>
              <span className="rotulo">Faena · Cerro Verde</span>
            </span>
          </Link>

          <button
            type="button"
            onClick={alternar}
            aria-expanded={!colapsado}
            aria-label={colapsado ? 'Expandir el menú lateral' : 'Contraer el menú lateral'}
            className="hidden size-8 items-center justify-center border border-line text-muted hover:border-accent hover:text-accent lg:flex"
          >
            <Icon name="panel" className="size-4" />
          </button>
        </div>

        <ul
          className={`flex gap-1 overflow-x-auto px-3 pb-3 lg:mt-2 lg:flex-col lg:gap-0.5 lg:overflow-visible ${colapsado ? 'lg:px-2' : 'lg:px-3'}`}
        >
          {SECCIONES.map((s) => (
            <li key={s.href}>
              <NavLink href={s.href} icono={s.icono} colapsado={colapsado}>
                {s.label}
              </NavLink>
            </li>
          ))}
        </ul>

        {usuario && (
          <div
            className={`mt-auto border-t border-line px-4 py-4 ${colapsado ? 'lg:px-2' : ''}`}
          >
            <div className={colapsado ? 'lg:hidden' : ''}>
              <p className="text-sm font-medium">{usuario.nombre}</p>
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
                <Icon name="salir" className="size-4" />
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
