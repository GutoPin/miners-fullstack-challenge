'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { postJson } from '@/src/components/api';
import { formatHoras } from '@/src/components/format';
import { Icon, Spinner } from '@/src/components/icons';
import { Aviso, boton, campo } from '@/src/components/ui';

interface Resultado {
  previousThreshold: number;
  nextThreshold: number;
  overdue: number;
  reAnchored: boolean;
  recoveredAssignments: number;
}

export function RegistrarMantenimiento({
  equipmentId,
  code,
  currentHours,
  threshold,
  interval,
}: {
  equipmentId: string;
  code: string;
  currentHours: number;
  threshold: number;
  interval: number;
}) {
  const router = useRouter();
  const [hoursAtService, setHoras] = useState(currentHours);
  const [responsible, setResponsable] = useState('');
  const [notes, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, setEnviando] = useState(false);

  // mirrors nextThreshold() to preview the result; the server's number is the real one
  const previsto = threshold + interval;
  const atraso = Math.max(0, hoursAtService - threshold);

  async function registrar() {
    setEnviando(true);
    setError(null);

    const res = await postJson<Resultado>('/api/maintenance', {
      equipmentId,
      hoursAtService,
      responsible,
      notes: notes.trim() || undefined,
    });

    setEnviando(false);

    if (res.ok) {
      setResultado(res.data);
      setResponsable('');
      setNotas('');
      router.refresh();
    } else {
      setError(res.error.message);
    }
  }

  return (
    <div className="px-4 py-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void registrar();
        }}
        className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
      >
        <label className="block">
          <span className="rotulo">Horómetro al servicio</span>
          <input
            type="number"
            min={0}
            step={0.5}
            required
            value={hoursAtService}
            onChange={(e) => setHoras(Number(e.target.value))}
            className={`mt-1.5 w-40 ${campo.numero}`}
          />
        </label>

        <label className="block">
          <span className="rotulo">Responsable</span>
          <input
            required
            autoComplete="off"
            value={responsible}
            onChange={(e) => setResponsable(e.target.value)}
            placeholder="Taller central · Téc. Ramírez"
            className={`mt-1.5 ${campo.input}`}
          />
        </label>

        <label className="block">
          <span className="rotulo">Observaciones</span>
          <input
            autoComplete="off"
            value={notes}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Opcional: repuestos, hallazgos"
            className={`mt-1.5 ${campo.input}`}
          />
        </label>

        <button
          type="submit"
          disabled={enviando || !responsible.trim()}
          className={boton.primario}
        >
          {enviando ? <Spinner /> : <Icon name="taller" />}
          {enviando ? 'Registrando…' : 'Registrar y liberar equipo'}
        </button>
      </form>

      <Aviso tono="neutro" titulo="Al registrarlo, esto pasa:" className="mt-4">
        <ul className="list-disc space-y-0.5 pl-4">
          <li>
            {code} vuelve a <strong>DISPONIBLE</strong> y sus asignaciones en riesgo por este
            bloqueo se reactivan.
          </li>
          <li>
            El umbral pasa de {formatHoras(threshold)} h a{' '}
            <strong>{formatHoras(previsto)} h</strong>: se ancla al umbral anterior más el
            intervalo de {interval} h, no a las {formatHoras(hoursAtService)} h reales.
          </li>
          <li>
            Se registra un atraso de {formatHoras(atraso)} h, que es lo que el equipo operó
            por encima del umbral que le tocaba.
          </li>
        </ul>
      </Aviso>

      {error && (
        <div role="alert" className="mt-3">
          <Aviso tono="bloqueo">{error}</Aviso>
        </div>
      )}

      {resultado && (
        <Aviso tono="ok" titulo={`${code} liberado.`} className="mt-3">
          Umbral anterior {formatHoras(resultado.previousThreshold)} h → nuevo{' '}
          <strong>{formatHoras(resultado.nextThreshold)} h</strong>, atraso registrado{' '}
          {formatHoras(resultado.overdue)} h
          {resultado.reAnchored && ' (re-anclado: el atraso se había comido un ciclo entero)'}.
          {resultado.recoveredAssignments > 0 &&
            ` ${resultado.recoveredAssignments} asignación(es) volvieron a estar activas.`}
        </Aviso>
      )}
    </div>
  );
}
