'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { postJson } from '@/src/components/api';

/** Cancelling frees the slot without erasing history; reassigning is cancel plus create. */
export function CancelarAsignacion({ assignmentId, etiqueta }: { assignmentId: string; etiqueta: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function cancelar() {
    if (!confirm(`¿Cancelar la asignación de ${etiqueta}? El cupo queda libre y la asignación se conserva como cancelada.`)) {
      return;
    }

    setEnviando(true);
    const res = await postJson(`/api/assignments/${assignmentId}/cancel`);
    setEnviando(false);

    if (res.ok) router.refresh();
    else setError(res.error.message);
  }

  return (
    <>
      <button
        type="button"
        disabled={enviando}
        onClick={() => void cancelar()}
        className="text-xs text-muted underline hover:text-red-800 disabled:opacity-40"
      >
        {enviando ? 'Cancelando…' : 'Cancelar'}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-800">
          {error}
        </p>
      )}
    </>
  );
}
