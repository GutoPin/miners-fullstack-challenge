import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';

import './globals.css';

/*
 * IBM Plex: nació para documentación técnica e interfaces de ingeniería. Tiene versión
 * mono del mismo diseño, así que los códigos de equipo y los horómetros conviven con el
 * texto sin parecer pegados de otra familia.
 */
const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'MineOps · Control de equipos y mantenimiento',
  description:
    'Asignación de equipos mineros por turno y mantenimiento por horómetro: reglas de negocio, proyección a 7 días y trazabilidad.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className={`${plexSans.variable} ${plexMono.variable} h-full`}>
      <body className="min-h-full bg-canvas text-ink">{children}</body>
    </html>
  );
}
