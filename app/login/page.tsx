import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';

import { auth, signIn } from '@/src/auth';

export const metadata = { title: 'Acceso · MineOps' };

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
  searchParams: Promise<{ error?: string }>;
}) {
  if (await auth()) redirect('/');

  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-6">
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
              defaultValue="supervisor@mineops.pe"
              className="mt-1.5 w-full border border-line bg-canvas px-3 py-2 font-mono text-sm"
            />
          </label>

          <label className="block">
            <span className="rotulo">Contraseña</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="mt-1.5 w-full border border-line bg-canvas px-3 py-2 font-mono text-sm"
            />
          </label>

          {error && (
            <p role="alert" className="border border-red-700/40 bg-red-50 px-3 py-2 text-sm text-red-900">
              Correo o contraseña incorrectos. Verifique sus datos e intente otra vez.
            </p>
          )}

          <button
            type="submit"
            className="w-full bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-accent"
          >
            Entrar
          </button>
        </form>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-muted">
        Usuarios de prueba: <span className="font-mono">supervisor@mineops.pe</span> ·{' '}
        <span className="font-mono">planner@mineops.pe</span> ·{' '}
        <span className="font-mono">viewer@mineops.pe</span>. La contraseña de cada uno es su
        rol seguido de <span className="font-mono">123</span>.
      </p>
    </main>
  );
}
