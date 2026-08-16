/**
 * Política de umbrales de mantenimiento (regla 2 y docs/MODELO-DATOS.md §4).
 *
 * El ciclo siguiente se ancla al **umbral anterior**, no al horómetro real del servicio:
 * si se contara desde el horómetro real, cada atraso correría la ventana hacia adelante y
 * al cabo de un año la unidad habría recibido menos servicios de los que exige el
 * fabricante. Anclando, el atraso es un evento aislado y no una deuda que se acumula.
 */

export interface NextThreshold {
  /** Umbral absoluto de horómetro al que el equipo se vuelve a bloquear. */
  next: number;
  /** Horas de más con las que llegó al taller (0 si se cumplió a tiempo). */
  overdue: number;
  /** true si el atraso se comió un ciclo entero y hubo que saltar al siguiente múltiplo. */
  reAnchored: boolean;
}

export function nextThreshold(
  previousThreshold: number, // umbral que se debía cumplir (p.ej. 250)
  hoursAtService: number, // horómetro real del servicio (p.ej. 280)
  interval: number, // 250
): NextThreshold {
  const overdue = Math.max(0, hoursAtService - previousThreshold);
  let next = previousThreshold + interval; // 500, no 530

  // Salvaguarda: si el atraso se comió un ciclo entero, re-anclar al
  // siguiente múltiplo por encima del horómetro real para no nacer bloqueado.
  const reAnchored = next <= hoursAtService;
  if (reAnchored) {
    next =
      previousThreshold +
      Math.ceil((hoursAtService - previousThreshold + 1) / interval) * interval;
  }

  return { next, overdue, reAnchored };
}
