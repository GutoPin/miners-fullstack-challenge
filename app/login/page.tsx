import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';

import { auth, signIn } from '@/src/auth';
import { Aviso, boton, campo } from '@/src/components/ui';

export const metadata = { title: 'Acceso · MineOps' };

const DEMO = [
  {
    clave: 'supervisor',
    email: 'supervisor@mineops.pe',
    rol: 'Supervisor',
    puede: 'Todo, incluido autorizar excepciones',
  },
  {
    clave: 'planner',
    email: 'planner@mineops.pe',
    rol: 'Planificador',
    puede: 'Asignar y cerrar turnos, registrar mantenimientos',
  },
  { clave: 'viewer', email: 'viewer@mineops.pe', rol: 'Consulta', puede: 'Solo lectura' },
];

async function entrar(formData: FormData) {
  'use server';

  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/',
    });
  } catch (error) {
    // signIn signals success by throwing next's redirect, so let it through
    if (error instanceof AuthError) redirect('/login?error=1');
    throw error;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; rol?: string }>;
}) {
  if (await auth()) redirect('/');

  const { error, rol } = await searchParams;
  const elegido = DEMO.find((d) => d.clave === rol) ?? DEMO[0];

  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center px-6 py-10">
      <div className="border border-line bg-surface p-8">
        <p className="rotulo">MineOps</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Control de equipos y mantenimiento
        </h1>
        <p className="mt-2 text-sm text-muted">
          Acceda con su cuenta de operaciones. El rol determina qué acciones puede ejecutar.
        </p>

        <form action={entrar} className="mt-8 space-y-4">
          <label className="block">
            <span className="rotulo">Correo</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="username"
              defaultValue={elegido.email}
              className={`mt-1.5 ${campo.input} font-mono`}
            />
          </label>

          <label className="block">
            <span className="rotulo">Contraseña</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder={`${elegido.clave}123`}
              className={`mt-1.5 ${campo.input} font-mono`}
            />
          </label>

          {error && (
            <div role="alert">
              <Aviso tono="bloqueo">
                Correo o contraseña incorrectos. Verifique sus datos e intente otra vez.
              </Aviso>
            </div>
          )}

          <button type="submit" className={`${boton.primario} w-full`}>
            Entrar
          </button>
        </form>
      </div>

      <div className="mt-6 border border-line bg-surface">
        <p className="rotulo border-b border-line px-4 py-2.5">
          Usuarios de prueba · la contraseña es el rol seguido de 123
        </p>
        <ul className="divide-y divide-line">
          {DEMO.map((d) => (
            <li key={d.clave}>
              <a
                href={`/login?rol=${d.clave}`}
                className={`flex flex-wrap items-baseline gap-x-3 px-4 py-3 text-sm hover:bg-canvas ${
                  d.clave === elegido.clave ? 'bg-canvas' : ''
                }`}
              >
                <span className="font-medium">{d.rol}</span>
                <span className="font-mono text-xs">{d.email}</span>
                <span className="w-full text-xs text-muted">{d.puede}</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
          Elija uno para completar el correo. Para ver el flujo completo —asignar, forzar una
          excepción y cerrar el turno— entre como supervisor.
        </p>
      </div>
    </main>
  );
}
