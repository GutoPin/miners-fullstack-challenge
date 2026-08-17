'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { postJson } from '@/src/components/api';
import { formatHoras } from '@/src/components/format';

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
        className="flex flex-wrap items-end gap-4"
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
            className="mt-1.5 block w-36 border border-line bg-canvas px-3 py-2 text-right font-mono text-sm"
          />
        </label>

        <label className="block">
          <span className="rotulo">Responsable</span>
          <input
            required
            value={responsible}
            onChange={(e) => setResponsable(e.target.value)}
            placeholder="Taller central · Téc. ..."
            className="mt-1.5 block w-64 border border-line bg-canvas px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="rotulo">Observaciones</span>
          <input
            value={notes}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Opcional"
            className="mt-1.5 block w-64 border border-line bg-canvas px-3 py-2 text-sm"
          />
        </label>

        <button
          type="submit"
          disabled={enviando || !responsible.trim()}
          className="bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-accent disabled:opacity-40"
        >
          {enviando ? 'Registrando…' : 'Registrar y liberar equipo'}
        </button>
      </form>

      <p className="mt-3 text-xs text-muted">
        Umbral que se debía cumplir: {formatHoras(threshold)} h · atraso {formatHoras(atraso)} h ·
        próximo umbral previsto <strong>{formatHoras(previsto)} h</strong> (anclado al umbral
        anterior, no a las {formatHoras(hoursAtService)} h reales).
      </p>

      {error && (
        <p role="alert" className="mt-3 border border-red-700/40 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      )}

      {resultado && (
        <div className="mt-3 border border-emerald-700/30 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {code} liberado. Umbral anterior {formatHoras(resultado.previousThreshold)} h → nuevo{' '}
          <strong>{formatHoras(resultado.nextThreshold)} h</strong>, atraso registrado{' '}
          {formatHoras(resultado.overdue)} h
          {resultado.reAnchored && ' (re-anclado: el atraso se había comido un ciclo entero)'}.
          {resultado.recoveredAssignments > 0 &&
            ` ${resultado.recoveredAssignments} asignación(es) volvieron a estar activas.`}
        </div>
      )}
    </div>
  );
}
