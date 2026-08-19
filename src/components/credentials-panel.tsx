'use client';

import { useState } from 'react';

import { Icon } from './icons';

/**
 * The demo accounts, folded away until asked for. The open/close height is animated with the
 * `grid-rows` trick —0fr to 1fr on a grid whose only child clips its overflow— because height
 * itself is not animatable from `auto`, and this needs no measurement and no layout read.
 */
const CUENTAS = [
  { rol: 'Supervisor', email: 'supervisor@mineops.pe', clave: 'supervisor123', puede: 'Todo, incluido autorizar excepciones' },
  { rol: 'Planificador', email: 'planner@mineops.pe', clave: 'planner123', puede: 'Asignar y cerrar turnos, registrar mantenimientos' },
  { rol: 'Consulta', email: 'viewer@mineops.pe', clave: 'viewer123', puede: 'Solo lectura' },
];

export function CredencialesDemo() {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="border border-line bg-surface">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        aria-controls="credenciales"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-canvas"
      >
        <span>
          <span className="block text-sm font-medium">Usuarios de prueba</span>
          <span className="mt-0.5 block text-xs text-muted">
            Tres roles con distintos permisos, para recorrer la demo
          </span>
        </span>
        <Icon
          name="desplegar"
          className={`size-4 shrink-0 text-muted transition-transform duration-200 ease-out motion-reduce:transition-none ${
            abierto ? 'rotate-180' : ''
          }`}
        />
      </button>

      <div
        id="credenciales"
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          abierto ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <ul className="divide-y divide-line border-t border-line">
            {CUENTAS.map((c) => (
              <li key={c.email} className="px-4 py-3">
                <p className="text-sm font-medium">{c.rol}</p>
                <p className="mt-1 font-mono text-xs break-all">
                  {c.email} · {c.clave}
                </p>
                <p className="mt-0.5 text-xs text-muted">{c.puede}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
