import Link from 'next/link';

import { auth, signOut } from '@/src/auth';

const SECCIONES = [
  { href: '/', label: 'Tablero' },
  { href: '/equipos', label: 'Equipos' },
  { href: '/operadores', label: 'Operadores' },
  { href: '/turnos', label: 'Turnos' },
];

const ROL: Record<string, string> = {
  SUPERVISOR: 'Supervisor',
  PLANNER: 'Planificador',
  VIEWER: 'Consulta',
};

export default async function DashboardLayout({ children }: LayoutProps<'/'>) {
  const session = await auth();

  return (
    <div className="lg:grid lg:min-h-svh lg:grid-cols-[15rem_1fr]">
      <nav className="border-b border-line bg-surface lg:sticky lg:top-0 lg:h-svh lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between px-5 py-4 lg:block">
          <Link href="/" className="block">
            <span className="rotulo">Faena · Cerro Verde</span>
            <span className="mt-0.5 block text-lg font-semibold tracking-tight">MineOps</span>
          </Link>
        </div>

        <ul className="flex gap-1 overflow-x-auto px-3 pb-3 lg:mt-4 lg:flex-col lg:gap-0.5 lg:px-3">
          {SECCIONES.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="block px-3 py-2 text-sm whitespace-nowrap hover:bg-canvas hover:text-accent"
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ul>

        {session?.user && (
          <div className="border-t border-line px-5 py-4 lg:absolute lg:bottom-0 lg:w-60">
            <p className="text-sm font-medium">{session.user.name}</p>
            <p className="rotulo mt-0.5">{ROL[session.user.role] ?? session.user.role}</p>
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

      <main className="px-6 py-8 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
