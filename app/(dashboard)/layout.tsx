import { cookies } from 'next/headers';

import { auth, signOut } from '@/src/auth';
import { Shell } from './shell';

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
  const [session, galletas] = await Promise.all([auth(), cookies()]);
  const rol = session ? ROL[session.user.role] : undefined;

  async function cerrarSesion() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <Shell
      colapsadoInicial={galletas.get('sidebar')?.value === '1'}
      cerrarSesion={cerrarSesion}
      usuario={
        session?.user && {
          // `name` is optional in the Auth.js session type even though the seed always sets it
          nombre: session.user.name ?? session.user.email ?? 'Sesión iniciada',
          rol: rol?.nombre ?? session.user.role,
          puede: rol?.puede ?? '',
        }
      }
    >
      {children}
    </Shell>
  );
}
