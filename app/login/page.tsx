import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';

import { auth, signIn } from '@/src/auth';
import { Icon, type NombreIcono } from '@/src/components/icons';
import { BotonEnviar } from '@/src/components/submit-button';
import { Aviso, boton, campo } from '@/src/components/ui';

export const metadata = { title: 'Acceso · MineOps' };

const CAPACIDADES: { icono: NombreIcono; titulo: string; detalle: string }[] = [
  {
    icono: 'turnos',
    titulo: 'Asignación validada',
    detalle:
      'Cada asignación pasa por las 12 reglas antes de guardarse, y un rechazo devuelve todas las que se incumplen, no la primera.',
  },
  {
    icono: 'taller',
    titulo: 'Mantenimiento por horómetro',
    detalle:
      'El equipo se bloquea solo al alcanzar su umbral y se libera registrando el servicio, con su atraso y su responsable.',
  },
  {
    icono: 'proyeccion',
    titulo: 'Proyección a 7 días',
    detalle:
      'Simula turno a turno lo ya programado para anticipar qué unidad se detiene, qué día y en qué jornada.',
  },
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
  searchParams: Promise<{ error?: string }>;
}) {
  if (await auth()) redirect('/');

  const { error } = await searchParams;

  return (
    <main className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between border-r border-line bg-surface px-12 py-12 lg:flex">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-9 items-center justify-center bg-ink text-sm font-semibold text-white"
          >
            M
          </span>
          <span>
            <span className="block text-lg leading-tight font-semibold tracking-tight">
              MineOps
            </span>
            <span className="rotulo">Faena · Cerro Verde</span>
          </span>
        </div>

        <div className="max-w-md">
          <h2 className="text-2xl leading-snug font-semibold tracking-tight">
            Control de equipos mineros y mantenimiento por horómetro.
          </h2>

          <ul className="mt-8 space-y-6">
            {CAPACIDADES.map((c) => (
              <li key={c.titulo} className="flex gap-3.5">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center border border-line text-muted">
                  <Icon name={c.icono} className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-medium">{c.titulo}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-muted">
                    {c.detalle}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted">
          Reemplaza el control por hojas de cálculo de una operación de acarreo, excavación y
          perforación.
        </p>
      </section>

      <section className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="flex items-center gap-3 lg:hidden">
            <span
              aria-hidden
              className="flex size-9 items-center justify-center bg-ink text-sm font-semibold text-white"
            >
              M
            </span>
            <span className="text-lg font-semibold tracking-tight">MineOps</span>
          </div>

          <h1 className="mt-8 text-2xl font-semibold tracking-tight lg:mt-0">Iniciar sesión</h1>
          <p className="mt-2 text-sm text-muted">
            Acceda con su cuenta de operaciones. El rol determina qué acciones puede ejecutar:
            asignar, cerrar turnos, autorizar excepciones o solo consultar.
          </p>

          <form action={entrar} className="mt-8 space-y-4">
            <label className="block">
              <span className="rotulo">Correo</span>
              <input
                type="email"
                name="email"
                required
                autoComplete="username"
                spellCheck={false}
                placeholder="nombre@mineops.pe"
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

            <BotonEnviar
              pendiente="Entrando…"
              icono="flecha"
              className={`${boton.primario} w-full`}
            >
              Entrar
            </BotonEnviar>
          </form>

          <p className="mt-8 border-t border-line pt-4 text-xs leading-relaxed text-muted">
            Las credenciales de los tres usuarios de prueba —supervisor, planificador y
            consulta— están en el <span className="font-medium">README</span> del repositorio,
            junto con el recorrido sugerido de la demo.
          </p>
        </div>
      </section>
    </main>
  );
}
