'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { Icon } from './icons';

/**
 * Modal built on the native `<dialog>`. `showModal()` already gives the backdrop, the focus
 * trap, the Escape key and inertness of the page behind it — everything a hand-written modal
 * usually reimplements badly. What is left here is opening it when the prop says so, closing
 * on a click outside the panel, and telling the parent when the browser closed it.
 */
export function Modal({
  abierto,
  onCerrar,
  titulo,
  descripcion,
  children,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  descripcion?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;

    if (abierto && !dialogo.open) dialogo.showModal();
    if (!abierto && dialogo.open) dialogo.close();
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      // fires for Escape too, so the parent state never drifts from the real dialog state
      onClose={onCerrar}
      onClick={(e) => {
        if (e.target === ref.current) onCerrar();
      }}
      aria-labelledby="modal-titulo"
      className="w-[min(38rem,calc(100vw-2rem))] border border-line bg-surface p-0 text-ink backdrop:bg-ink/40"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <h2 id="modal-titulo" className="text-lg font-semibold tracking-tight">
            {titulo}
          </h2>
          {descripcion && <p className="mt-1 text-sm text-muted">{descripcion}</p>}
        </div>

        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="flex size-8 shrink-0 items-center justify-center border border-line text-muted hover:border-accent hover:text-accent"
        >
          <Icon name="cerrar" />
        </button>
      </div>

      <div className="max-h-[70svh] overflow-y-auto">{children}</div>
    </dialog>
  );
}
