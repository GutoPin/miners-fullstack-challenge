import NextAuth from 'next-auth';

import { authConfig } from '@/src/auth/config';

// next 16 renamed `middleware` to `proxy`; it must be a default export or the production
// build fails to detect the function, even though dev works

const { auth } = NextAuth(authConfig);

export default auth;

// pages only: /api guards itself with requireSession() and answers 401 json, not a redirect
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
