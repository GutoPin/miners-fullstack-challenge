import { afterEach, describe, expect, it, vi } from 'vitest';

import { canBeOverridden, validateAssignment } from '@/src/domain/rules/assignment-rules';
import type { AssignmentContext } from '@/src/domain/types';

/** healthy context: planned shift, available equipment, certified operator, empty shift */
function contexto(overrides: Partial<AssignmentContext> = {}): AssignmentContext {
  return {
    shift: {
      id: 's1',
      date: '2026-08-18',
      endDate: '2026-08-18',
      journey: 'DAY',
      status: 'PLANNED',
      plannedHours: 12,
    },
    equipment: {
      id: 'e1',
      code: 'CAM-003',
      typeId: 't-cam',
      typeName: 'Camión de acarreo',
      status: 'AVAILABLE',
      currentHours: 900,
      nextMaintenanceHours: 1250,
    },
    operator: { id: 'o1', fullName: 'Juan Pérez', active: true },
    certifications: [
      { equipmentTypeId: 't-cam', issuedAt: '2025-08-01', expiresAt: '2027-01-31' },
    ],
    activeAssignments: [],
    ...overrides,
  };
}

const codigos = (v: ReturnType<typeof validateAssignment>) => v.map((x) => x.code).sort();

describe('validateAssignment', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('acepta la asignación cuando todo está en orden', () => {
    expect(validateAssignment(contexto())).toEqual([]);
  });

  it('rechaza equipo BLOQUEADO con EQUIPMENT_BLOCKED', () => {
    const v = validateAssignment(
      contexto({
        equipment: {
          ...contexto().equipment,
          status: 'BLOCKED',
          currentHours: 1253,
          nextMaintenanceHours: 1250,
        },
      }),
    );

    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      code: 'EQUIPMENT_BLOCKED',
      severity: 'OVERRIDABLE',
      context: { currentHours: 1253, thresholdHours: 1250, overdue: 3 },
    });
    expect(v[0].message).toContain('CAM-003');
    expect(v[0].message).toContain('mantenimiento');
  });

  it('rechaza equipo en mantenimiento y equipo fuera de servicio con la severidad correcta', () => {
    const base = contexto().equipment;

    const enTaller = validateAssignment(
      contexto({ equipment: { ...base, status: 'IN_MAINTENANCE' } }),
    );
    expect(enTaller).toHaveLength(1);
    expect(enTaller[0]).toMatchObject({
      code: 'EQUIPMENT_IN_MAINTENANCE',
      severity: 'OVERRIDABLE',
    });

    const deBaja = validateAssignment(
      contexto({ equipment: { ...base, status: 'OUT_OF_SERVICE' } }),
    );
    expect(deBaja).toHaveLength(1);
    expect(deBaja[0]).toMatchObject({ code: 'EQUIPMENT_OUT_OF_SERVICE', severity: 'HARD' });
  });

  it('rechaza operador ya asignado en el mismo turno', () => {
    const v = validateAssignment(
      contexto({
        activeAssignments: [
          {
            id: 'a2',
            operatorId: 'o1',
            operatorName: 'Juan Pérez',
            equipmentId: 'e9',
            equipmentCode: 'EXC-002',
          },
        ],
      }),
    );

    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      code: 'OPERATOR_ALREADY_ASSIGNED',
      severity: 'HARD',
      context: { conflictingAssignmentId: 'a2', equipmentCode: 'EXC-002' },
    });
    expect(v[0].message).toContain('EXC-002');
  });

  it('rechaza equipo ya asignado en el mismo turno', () => {
    const v = validateAssignment(
      contexto({
        activeAssignments: [
          {
            id: 'a1',
            operatorId: 'o9',
            operatorName: 'María Flores',
            equipmentId: 'e1',
            equipmentCode: 'CAM-003',
          },
        ],
      }),
    );

    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      code: 'EQUIPMENT_ALREADY_ASSIGNED',
      severity: 'HARD',
      context: { conflictingAssignmentId: 'a1' },
    });
    expect(v[0].message).toContain('María Flores');
  });

  it('rechaza certificación vencida evaluada contra la FECHA DEL TURNO, no contra hoy', () => {
    // the certification is valid today (expires 20/08) but the shift is on 25/08
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));

    const v = validateAssignment(
      contexto({
        shift: { ...contexto().shift, date: '2026-08-25', endDate: '2026-08-25' },
        certifications: [
          { equipmentTypeId: 't-cam', issuedAt: '2024-08-20', expiresAt: '2026-08-20' },
        ],
      }),
    );

    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      code: 'CERTIFICATION_EXPIRED',
      severity: 'OVERRIDABLE',
      context: { expiresAt: '2026-08-20', shiftDate: '2026-08-25' },
    });
    expect(v[0].message).toContain('20/08/2026');
  });

  it('rechaza al operador que nunca tuvo certificación del tipo con OPERATOR_NOT_CERTIFIED', () => {
    const v = validateAssignment(
      contexto({
        // certified on another equipment type: does not cover the truck
        certifications: [
          { equipmentTypeId: 't-exc', issuedAt: '2025-01-01', expiresAt: '2027-01-01' },
        ],
      }),
    );

    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ code: 'OPERATOR_NOT_CERTIFIED', severity: 'OVERRIDABLE' });
    expect(v[0].message).toContain('Camión de acarreo');
  });

  it('acepta si existe una certificación renovada aunque haya otra vencida del mismo tipo', () => {
    const v = validateAssignment(
      contexto({
        certifications: [
          { equipmentTypeId: 't-cam', issuedAt: '2023-01-01', expiresAt: '2026-01-31' }, // vencida
          { equipmentTypeId: 't-cam', issuedAt: '2026-01-15', expiresAt: '2027-01-31' }, // renewal
        ],
      }),
    );

    expect(v).toEqual([]);
  });

  it('avisa (WARNING) si la certificación vence a mitad del turno', () => {
    // night shift of 18/08 ending on the 19th; the certification only covers the 18th
    const v = validateAssignment(
      contexto({
        shift: {
          ...contexto().shift,
          journey: 'NIGHT',
          date: '2026-08-18',
          endDate: '2026-08-19',
        },
        certifications: [
          { equipmentTypeId: 't-cam', issuedAt: '2024-08-18', expiresAt: '2026-08-18' },
        ],
      }),
    );

    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      code: 'CERTIFICATION_EXPIRES_DURING_SHIFT',
      severity: 'WARNING',
      context: { expiresAt: '2026-08-18', shiftEndDate: '2026-08-19' },
    });
  });

  it('rechaza asignar a un turno ya cerrado con SHIFT_NOT_PLANNED', () => {
    const v = validateAssignment(
      contexto({ shift: { ...contexto().shift, status: 'CLOSED' } }),
    );

    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ code: 'SHIFT_NOT_PLANNED', severity: 'HARD' });
  });

  it('rechaza al operador inactivo con OPERATOR_INACTIVE', () => {
    const v = validateAssignment(
      contexto({ operator: { id: 'o1', fullName: 'Rosa Quispe', active: false } }),
    );

    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ code: 'OPERATOR_INACTIVE', severity: 'HARD' });
  });

  it('DEVUELVE TODAS LAS VIOLACIONES, no solo la primera', () => {
    const contextoConCuatroProblemas = contexto({
      equipment: {
        ...contexto().equipment,
        status: 'BLOCKED',
        currentHours: 1253,
        nextMaintenanceHours: 1250,
      },
      certifications: [
        { equipmentTypeId: 't-cam', issuedAt: '2024-08-10', expiresAt: '2026-08-10' },
      ],
      activeAssignments: [
        {
          id: 'a1',
          operatorId: 'o9',
          operatorName: 'María Flores',
          equipmentId: 'e1',
          equipmentCode: 'CAM-003',
        },
        {
          id: 'a2',
          operatorId: 'o1',
          operatorName: 'Juan Pérez',
          equipmentId: 'e9',
          equipmentCode: 'EXC-002',
        },
      ],
    });

    const v = validateAssignment(contextoConCuatroProblemas);

    expect(codigos(v)).toEqual([
      'CERTIFICATION_EXPIRED',
      'EQUIPMENT_ALREADY_ASSIGNED',
      'EQUIPMENT_BLOCKED',
      'OPERATOR_ALREADY_ASSIGNED',
    ]); // ← regla 11
  });

  it('marca canBeOverridden=false si alguna violación es HARD', () => {
    const conHard = validateAssignment(
      contexto({
        equipment: { ...contexto().equipment, status: 'BLOCKED' }, // OVERRIDABLE
        activeAssignments: [
          {
            id: 'a1',
            operatorId: 'o9',
            operatorName: 'María Flores',
            equipmentId: 'e1',
            equipmentCode: 'CAM-003',
          }, // HARD
        ],
      }),
    );
    expect(canBeOverridden(conHard)).toBe(false);

    const soloSalvables = validateAssignment(
      contexto({ equipment: { ...contexto().equipment, status: 'BLOCKED' } }),
    );
    expect(canBeOverridden(soloSalvables)).toBe(true);

    // a lone warning does not block, so there is nothing to force
    const soloAviso = validateAssignment(
      contexto({
        shift: { ...contexto().shift, journey: 'NIGHT', endDate: '2026-08-19' },
        certifications: [
          { equipmentTypeId: 't-cam', issuedAt: '2024-08-18', expiresAt: '2026-08-18' },
        ],
      }),
    );
    expect(canBeOverridden(soloAviso)).toBe(false);
  });
});
