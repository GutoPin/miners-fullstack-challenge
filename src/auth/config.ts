/**
 * Auth.js configuration without database access.
 *
 * The proxy runs on the edge runtime, where Prisma and bcrypt do not exist, so the part
 * that only answers "is there a session?" lives here and the credentials provider lives in
 * `index.ts`, imported from the server only.
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
  // jwt session: no session table to keep, no query per request
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
      // the callback above is the only place that writes this claim
      session.user.role = token.role as Role;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
