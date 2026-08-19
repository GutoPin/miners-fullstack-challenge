'use client';

import { useActionState, useState } from 'react';

import { Icon } from '@/src/components/icons';
import { Modal } from '@/src/components/modal';
import { Aviso, boton, campo } from '@/src/components/ui';
import { BotonEnviar } from '@/src/components/submit-button';
import { crearOperador, type EstadoAccion } from './actions';

export interface TipoEquipo {
  id: string;
  code: string;
  name: string;
}

/** a certification issued today and valid for a year is the usual case; both stay editable */
const HOY = () => new Date().toISOString().slice(0, 10);
const EN_UN_ANIO = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
};

export function NuevoOperador({ tipos }: { tipos: TipoEquipo[] }) {
  const [abierto, setAbierto] = useState(false);
  const [marcados, setMarcados] = useState<string[]>([]);
  // closing belongs to the action's own continuation, not to an effect watching its result:
  // the modal shuts exactly once, when the write succeeded, and never on a re-render
  const [estado, accion] = useActionState<EstadoAccion, FormData>(async (previo, formData) => {
    const resultado = await crearOperador(previo, formData);

    if (resultado.ok) {
      setAbierto(false);
      setMarcados([]);
    }

    return resultado;
  }, {});

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className={boton.primario}>
        <Icon name="mas" />
        Nuevo operador
      </button>

      {estado.ok && !abierto && (
        <Aviso tono="ok" className="mt-4">
          {estado.ok}
        </Aviso>
      )}

      <Modal
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        titulo="Nuevo operador"
        descripcion="Los tipos de equipo que marque aquí son los que podrá operar. Sin certificación vigente, la asignación se rechaza."
      >
        <form action={accion} className="space-y-5 px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="rotulo">Código</span>
              <input
                name="code"
                required
                autoFocus
                autoComplete="off"
                spellCheck={false}
                placeholder="OP-007"
                className={`mt-1.5 ${campo.input} font-mono uppercase`}
              />
            </label>

            <label className="block">
              <span className="rotulo">Documento</span>
              <input
                name="document"
                required
                autoComplete="off"
                spellCheck={false}
                placeholder="45871236"
                className={`mt-1.5 ${campo.input} font-mono`}
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="rotulo">Nombre completo</span>
              <input
                name="fullName"
                required
                autoComplete="off"
                placeholder="Rosa Quispe Mamani"
                className={`mt-1.5 ${campo.input}`}
              />
            </label>
          </div>

          <fieldset className="border border-line">
            <legend className="rotulo mx-3 px-1">Equipos que puede operar</legend>

            <ul className="divide-y divide-line">
              {tipos.map((t) => {
                const marcado = marcados.includes(t.id);

                return (
                  <li key={t.id} className="px-4 py-3">
                    <input type="hidden" name="tipo" value={t.id} />

                    <label className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        name={`cert-${t.id}`}
                        checked={marcado}
                        onChange={(e) =>
                          setMarcados(
                            e.target.checked
                              ? [...marcados, t.id]
                              : marcados.filter((id) => id !== t.id),
                          )
                        }
                        className="size-4 accent-(--color-accent)"
                      />
                      <span className="text-sm font-medium">{t.name}</span>
                      <span className="font-mono text-xs text-muted">{t.code}</span>
                    </label>

                    {marcado && (
                      <div className="mt-3 grid gap-3 pl-6 sm:grid-cols-3">
                        <label className="block">
                          <span className="rotulo">Emitida</span>
                          <input
                            type="date"
                            name={`emitida-${t.id}`}
                            required
                            defaultValue={HOY()}
                            className={`mt-1 ${campo.input} font-mono`}
                          />
                        </label>
                        <label className="block">
                          <span className="rotulo">Vence</span>
                          <input
                            type="date"
                            name={`vence-${t.id}`}
                            required
                            defaultValue={EN_UN_ANIO()}
                            className={`mt-1 ${campo.input} font-mono`}
                          />
                        </label>
                        <label className="block">
                          <span className="rotulo">N.º de certificado</span>
                          <input
                            name={`documento-${t.id}`}
                            autoComplete="off"
                            placeholder="Opcional"
                            className={`mt-1 ${campo.input}`}
                          />
                        </label>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </fieldset>

          {marcados.length === 0 && (
            <Aviso tono="aviso">
              Sin ninguna certificación el operador queda registrado, pero toda asignación que
              se le intente hacer será rechazada hasta que se le otorgue una.
            </Aviso>
          )}

          {estado.error && (
            <div role="alert">
              <Aviso tono="bloqueo">{estado.error}</Aviso>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className={boton.secundario}
            >
              Cancelar
            </button>
            <BotonEnviar pendiente="Registrando…" icono="visto">
              Registrar operador
            </BotonEnviar>
          </div>
        </form>
      </Modal>
    </>
  );
}
