'use client';

import { useFormStatus } from 'react-dom';

import { Icon, Spinner, type NombreIcono } from './icons';
import { boton } from './ui';

/**
 * Submit button for the forms that post to a Server Action. `useFormStatus` reads the state
 * of the form it sits inside, which is the only reason this is a client component: without it
 * a slow action looks like a click that did nothing.
 */
export function BotonEnviar({
  children,
  pendiente,
  icono,
  className = boton.primario,
}: {
  children: string;
  /** label while the action runs; ends in an ellipsis, like every wait in this app */
  pendiente: string;
  icono?: NombreIcono;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? <Spinner /> : icono && <Icon name={icono} />}
      {pending ? pendiente : children}
    </button>
  );
}
