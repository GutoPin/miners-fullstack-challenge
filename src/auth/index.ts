/**
 * Auth.js con credenciales. Sin identidad no existe "excepción autorizada por un
 * supervisor" (`DECISIONES.md` §2.2), así que la autenticación es mínima pero real:
 * contraseñas con bcrypt y rol en el token.
 */
import bcrypt from 'bcryptjs';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import type { Role } from '../db/generated/enums';
import { prisma } from '../db/prisma';
import { ServiceError } from '../services/errors';
import { authConfig } from './config';

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = String(credentials?.email ?? '')
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? '');

        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });

        // Se compara igual aunque el usuario no exista: así el tiempo de respuesta no
        // delata qué correos están registrados.
        const valido = user
          ? bcrypt.compareSync(password, user.passwordHash)
          : bcrypt.compareSync(password, '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');

        if (!user || !valido) return null;

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
});

/**
 * Guardas de servidor. Se usan igual desde un route handler que desde una Server Action:
 * la validación vive en el servidor siempre, nunca en el componente que dibuja el botón.
 */
export async function requireSession() {
  const session = await auth();

  if (!session?.user) {
    throw new ServiceError({
      code: 'UNAUTHENTICATED',
      message: 'Inicie sesión para ejecutar esta acción.',
      status: 401,
    });
  }

  return session.user;
}

/**
 * Autorización por rol. La comprobación fina (quién puede firmar una excepción) vive en el
 * servicio; esto solo cierra la puerta antes de llegar.
 */
export async function requireRole(...roles: Role[]) {
  const user = await requireSession();

  if (!roles.includes(user.role)) {
    throw new ServiceError({
      code: 'FORBIDDEN',
      message: `${user.name} tiene rol ${user.role} y no puede ejecutar esta acción.`,
      status: 403,
    });
  }

  return user;
}
