import Link from 'next/link';

import { auth, signOut } from '@/src/auth';
import { NavLink } from '@/src/components/nav-link';

// ordered by how the day runs: what needs a decision first, catalogues and traceability after
const SECCIONES = [
  { href: '/', label: 'Tablero' },
  { href: '/turnos', label: 'Turnos' },
  { href: '/proyeccion', label: 'Proyección' },
  { href: '/equipos', label: 'Equipos' },
  { href: '/operadores', label: 'Operadores' },
  { href: '/auditoria', label: 'Auditoría' },
];

const ROL: Record<string, { nombre: string; puede: string }> = {
  SUPERVISOR: {
    nombre: 'Supervisor',
    puede: 'Asigna, cierra turnos y firma excepciones.',
  },
  PLANNER: {
    nombre: 'Planificador',
    puede: 'Asigna y cierra turnos. No firma excepciones.',
  },
  VIEWER: { nombre: 'Consulta', puede: 'Solo lectura.' },
};

export default async function DashboardLayout({ children }: LayoutProps<'/'>) {
  const session = await auth();
  const rol = session ? ROL[session.user.role] : undefined;

  return (
    <div className="lg:grid lg:min-h-svh lg:grid-cols-[15rem_1fr]">
      {/* visible only on keyboard focus */}
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:m-2 focus:bg-ink focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Saltar al contenido
      </a>

      <nav
        aria-label="Secciones"
        className="border-b border-line bg-surface lg:sticky lg:top-0 lg:h-svh lg:border-r lg:border-b-0"
      >
        <div className="flex items-center justify-between px-5 py-4 lg:block">
          <Link href="/" className="block">
            <span className="rotulo">Faena · Cerro Verde</span>
            <span className="mt-0.5 block text-lg font-semibold tracking-tight">MineOps</span>
          </Link>
        </div>

        <ul className="flex gap-1 overflow-x-auto px-3 pb-3 lg:mt-4 lg:flex-col lg:gap-0.5 lg:px-3">
          {SECCIONES.map((s) => (
            <li key={s.href}>
              <NavLink href={s.href}>{s.label}</NavLink>
            </li>
          ))}
        </ul>

        {session?.user && (
          <div className="border-t border-line px-5 py-4 lg:absolute lg:bottom-0 lg:w-60">
            <p className="text-sm font-medium">{session.user.name}</p>
            <p className="rotulo mt-0.5">{rol?.nombre ?? session.user.role}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{rol?.puede}</p>
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/login' });
              }}
            >
              <button type="submit" className="mt-2 text-xs text-muted underline hover:text-accent">
                Cerrar sesión
              </button>
            </form>
          </div>
        )}
      </nav>

      <main id="contenido" className="px-6 py-8 lg:px-10 lg:py-10">
        {children}
      </main>
    </div>
  );
}
