/**
 * Auth.js with credentials. Without identity there is no "exception authorized by a
 * supervisor", so authentication is minimal but real: bcrypt passwords, role in the token.
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

        // compared even when the user is unknown, so timing does not reveal registered emails
        const valido = user
          ? bcrypt.compareSync(password, user.passwordHash)
          : bcrypt.compareSync(password, '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');

        if (!user || !valido) return null;

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
});

/** server guards, used the same way from a route handler and from a server action */
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

/** role check at the door; who may sign an exception is decided in the service */
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
