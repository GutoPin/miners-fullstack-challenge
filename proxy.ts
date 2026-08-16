import NextAuth from 'next-auth';

import { authConfig } from '@/src/auth/config';

// Next 16 renombró el convenio `middleware` a `proxy`. Tiene que ser un export por
// defecto: con `export const { auth: proxy } = …` el análisis estático del build no
// reconoce la función y falla al compilar, aunque en desarrollo funcione.
const { auth } = NextAuth(authConfig);

export default auth;

/**
 * Solo protege páginas. Las rutas de `/api` se defienden solas con `requireSession()`,
 * porque a un cliente que llama al API hay que responderle un 401 en JSON, no redirigirlo
 * a un formulario de login.
 */
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
