/**
 * Configuración de Auth.js **sin acceso a base de datos**.
 *
 * El middleware corre en el runtime de Edge, donde no hay Prisma ni bcrypt. Por eso la
 * parte que solo decide "¿hay sesión?" vive aquí, y el proveedor de credenciales —que sí
 * consulta la base— vive en `index.ts`, que solo se importa desde el servidor.
 */
import type { DefaultSession, NextAuthConfig } from 'next-auth';

import type { Role } from '../db/generated/enums';

declare module 'next-auth' {
  interface User {
    role: Role;
  }

  interface Session {
    user: { id: string; role: Role } & DefaultSession['user'];
  }
}

export const authConfig = {
  pages: { signIn: '/login' },
  // Sesión en JWT: sin tabla de sesiones que mantener y sin consulta por request. La
  // identidad se necesita para firmar excepciones, no para guardar estado.
  session: { strategy: 'jwt' },
  callbacks: {
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
    jwt({ token, user }) {
      if (user) token.role = user.role;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      // El JWT es un mapa de claves desconocidas; el rol lo puso el callback de arriba y
      // es el único lugar donde se escribe, así que la aserción no esconde nada.
      session.user.role = token.role as Role;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
