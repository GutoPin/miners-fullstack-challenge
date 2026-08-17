import { describe, expect, it } from 'vitest';

import { nextThreshold } from '@/src/domain/maintenance-policy';

describe('nextThreshold', () => {
  it('el siguiente umbral se ancla al umbral anterior, no al horómetro real', () => {
    // threshold 250, serviced at 280 h, interval 250
    expect(nextThreshold(250, 280, 250)).toMatchObject({
      next: 500,
      overdue: 30,
      reAnchored: false,
    });
  });

  it('no acumula desfase en tres ciclos consecutivos con atraso', () => {
    // 250→280, 500→515, 750→790: thresholds stay 500, 750, 1000
    const ciclo1 = nextThreshold(250, 280, 250);
    const ciclo2 = nextThreshold(ciclo1.next, 515, 250);
    const ciclo3 = nextThreshold(ciclo2.next, 790, 250);

    expect([ciclo1.next, ciclo2.next, ciclo3.next]).toEqual([500, 750, 1000]);
    expect([ciclo1.overdue, ciclo2.overdue, ciclo3.overdue]).toEqual([30, 15, 40]);
    expect([ciclo1, ciclo2, ciclo3].every((c) => !c.reAnchored)).toBe(true);
  });

  it('re-ancla si el atraso superó un ciclo completo (nunca sale del taller bloqueado)', () => {
    expect(nextThreshold(250, 780, 250)).toMatchObject({ next: 1000, reAnchored: true });
  });

  it('el equipo nunca sale del taller ya bloqueado: el nuevo umbral supera al horómetro', () => {
    // edge case: serviced exactly when the next cycle came due
    const { next, reAnchored } = nextThreshold(250, 500, 250);

    expect(next).toBeGreaterThan(500);
    expect(reAnchored).toBe(true);
  });

  it('sin atraso, overdue es 0 y el umbral avanza un intervalo', () => {
    expect(nextThreshold(250, 240, 250)).toMatchObject({
      next: 500,
      overdue: 0,
      reAnchored: false,
    });
  });
});
