# DECISIONES.md

> Documento pedido por el reto: cómo modelé los datos y por qué, cómo resolví cada decisión
> abierta, qué dejé fuera y qué haría con más tiempo. Escrito para ser defendido línea por
> línea en la sustentación.

---

## 1. Modelo de datos

### 1.1 Las cinco decisiones estructurales

**a) El intervalo de mantenimiento vive en el tipo de equipo, con excepción por unidad.**
El enunciado dice "cada tipo de equipo tiene un intervalo". Lo modelé así
(`EquipmentType.maintenanceIntervalHours`), pero agregué
`Equipment.maintenanceIntervalOverride` (nulo por defecto) porque en operación real una
unidad reparada o antigua queda con un régimen distinto al de su familia. Cuesta una
columna y evita una migración dolorosa después.

**b) El umbral se almacena, no se calcula.** `Equipment.nextMaintenanceHours` guarda el
valor absoluto de horómetro que dispara el bloqueo. Podría derivarse
(`horas_último_servicio + intervalo`), pero almacenarlo (1) hace la proyección de 7 días una
consulta simple, (2) permite umbrales excepcionales autorizados y (3) deja explícita la
política de desfase (§2.3) en vez de esconderla en una fórmula.

**c) El horómetro es un libro mayor, no un contador.** `HourmeterEntry` registra cada
movimiento con `hoursBefore`, `hoursDelta`, `hoursAfter`, origen (`SHIFT_CLOSE`,
`MAINTENANCE`, `MANUAL_ADJUSTMENT`, `INITIAL_LOAD`) y referencia. `Equipment.currentHours`
es un saldo cacheado que solo se actualiza dentro de la misma transacción que escribe el
asiento. Un horómetro es un dato con consecuencias legales y de costos: tiene que ser
auditable y reconstruible. Hay un test que verifica el invariante
`suma(deltas) == currentHours`.

**d) Las reglas 6 y 7 son constraints de base de datos, no `if` de aplicación.**
`UNIQUE (shift_id, equipment_id, active_slot)` y `UNIQUE (shift_id, operator_id, active_slot)`,
donde `activeSlot` vale `1` mientras la asignación ocupa cupo y pasa a `NULL` al cancelarla
(ambos motores tratan los `NULL` como distintos, así que el histórico convive con la regla).
El chequeo en la aplicación existe para dar **buenos mensajes**; la garantía la da el motor,
que es lo único que no se rompe con dos instancias serverless concurrentes.

**e) Planificado y real son columnas distintas.** `Assignment.plannedHours` y
`actualHours`, más `Shift.plannedHours`. El horómetro se mueve con lo real; la diferencia es
información de negocio (desviación de planeamiento) que en las hojas de cálculo se pierde.

### 1.2 Entidades

`EquipmentType`, `Equipment`, `Operator`, `Certification`, `Shift`, `Assignment`,
`AssignmentOverride`, `MaintenanceRecord`, `HourmeterEntry`, `Alert`, `User`.
El esquema completo, con índices, `CHECK` y comentarios, está en `prisma/schema.prisma`
y en las migraciones versionadas de `prisma/migrations/`.

Un par de decisiones menores que también defiendo:
- **Certificaciones múltiples por operador y tipo** (histórico de renovaciones), y vale la
  de mayor vencimiento vigente a la fecha del turno. Modelarlo con una sola fila por
  (operador, tipo) obligaría a destruir el historial en cada renovación.
- **`Shift` guarda `date` (sin hora) y además `startsAt`/`endsAt`.** La fecha operativa es
  la que usa la mina (un turno noche del 12 sigue siendo del 12 aunque termine el 13); los
  instantes reales son los que uso para evaluar si una certificación vence *durante* el turno.
- **`Alert` como tabla**, no como cálculo al vuelo: quiero que quede constancia de que el
  sistema avisó, y cuándo.

---

## 2. Decisiones abiertas del enunciado

### 2.1 Un equipo se bloquea a mitad de semana y ya tenía turnos programados

**Decisión: no se cancelan. Pasan a `EN_RIESGO`, con alerta crítica, y el turno no se puede
cerrar sin resolverlas.**

Cancelar automáticamente es la peor opción: el planificador se entera del hueco en el cambio
de guardia. Borrar información que alguien decidió a mano es una decisión que el software no
debe tomar solo. Lo que sí debe hacer es **hacer imposible ignorar el problema**:

1. Al bloquearse el equipo, sus asignaciones en turnos futuros `PLANNED` pasan a `AT_RISK`
   con `riskReason`, dentro de la misma transacción que produjo el bloqueo.
2. Se crea una `Alert` `ASSIGNMENT_AT_RISK` (severidad `CRITICAL`) visible en el tablero,
   con enlaces directos a "reasignar equipo" o "cancelar asignación".
3. El cierre de turno **exige resolver** toda asignación `AT_RISK`: reasignar, cancelar o
   forzar con autorización de supervisor. No se puede cerrar en silencio.
4. Si se registra el mantenimiento antes del turno, las asignaciones vuelven a `ACTIVE` y
   las alertas se marcan resueltas automáticamente.

*Alternativa descartada:* cancelación automática con notificación. Más simple de programar,
pero traslada el riesgo a la operación en el peor momento.

### 2.2 ¿Se puede forzar una asignación con autorización de un supervisor?

**Decisión: sí, pero solo algunas reglas, y con traza completa.**

Clasifiqué cada violación en dos familias (el catálogo completo, con su severidad y su
porqué, está en `src/domain/rules/violation.ts`):

- **`HARD` — nunca se fuerza:** operador o equipo ya asignados en el mismo turno, turno
  cerrado, equipo dado de baja. Son **imposibilidades físicas o corrupción de datos**;
  ninguna firma hace que una excavadora esté en dos frentes a la vez.
- **`OVERRIDABLE` — se puede forzar con firma:** equipo bloqueado por horómetro, equipo en
  mantenimiento, certificación vencida o inexistente. Son **políticas**, y en una operación
  real un superintendente sí las levanta bajo su responsabilidad.

Cómo queda registrada la excepción:
- Solo el rol `SUPERVISOR` puede enviarla.
- Motivo obligatorio (mínimo 15 caracteres), guardado en `AssignmentOverride.reason`.
- Se guarda el **snapshot completo** de las violaciones salvadas en `violatedRules` (JSON):
  aunque mañana cambie una regla, el registro conserva qué se saltó ese día y con qué datos.
- La asignación nace en estado `AT_RISK`, no `ACTIVE`: forzada no es normal, y se ve así en
  toda la aplicación (banner rojo con supervisor y motivo).
- Se genera una `Alert` `OVERRIDE_USED` y la pantalla `/auditoria` lista todas las
  excepciones, filtrables por fecha y supervisor.

El objetivo del diseño es que forzar sea **posible pero incómodo y visible**. Un control que
no se puede levantar nunca termina siendo un control que la gente evade por fuera del sistema.

### 2.3 Mantenimiento hecho 30 horas después del umbral: ¿desde dónde cuenta el siguiente ciclo?

**Decisión: desde el umbral (anclado), no desde el horómetro real.**

Umbral 250 h, servicio a las 280 h, intervalo 250 → el siguiente umbral es **500**, no 530.
El desfase de 30 h se guarda en `MaintenanceRecord.overdueHours` como indicador, no como
crédito.

Razón: si contara desde el horómetro real, cada atraso correría la ventana hacia adelante y
el desfase se acumularía; en un año la unidad habría recibido menos servicios de los que
exige el fabricante y nadie lo notaría, porque cada ciclo individual se vería "correcto".
Anclar al umbral convierte el atraso en un evento aislado y medible.

**Salvaguarda:** si el atraso se comió un ciclo entero (servicio a las 780 h con umbral 250
e intervalo 250), anclar daría 500 h y el equipo saldría del taller ya bloqueado. En ese
caso re-anclo al primer múltiplo por encima del horómetro real (1.000) y marco
`reAnchored = true` en el registro para que el caso sea visible en reportería. Está cubierto
por tests.

*Alternativa descartada:* contar desde el horómetro real. Es lo que hace la hoja de cálculo
hoy, y es justamente la fuente del desfase silencioso que el enunciado señala entre paréntesis.

### 2.4 El turno se cerró con más o menos horas de las planificadas

**Decisión: manda lo real; el desvío se registra y, si es grande, se justifica.**

- El horómetro suma **`actualHours`**, siempre. El horómetro describe la máquina, no el plan.
- Se conservan `plannedHours` y `actualHours` por asignación; el desvío es consultable.
- Desvío mayor a 2 h en valor absoluto (o más del 25 %) → **nota obligatoria**. Fricción
  proporcional al tamaño del error: sin ella el dato se ensucia y el reporte no sirve.
- El cierre es **idempotente**: un turno `CLOSED` no se vuelve a cerrar.
- Horas fuera de rango (≤ 0 o > 24) se rechazan por `CHECK` en la base, no solo por la UI.
- Si hubo un error de digitación después del cierre, no se edita el pasado: se registra un
  `MANUAL_ADJUSTMENT` en el ledger con motivo y autor. El horómetro nunca "cambia de
  opinión": se corrige con un asiento nuevo, como en contabilidad.

### 2.5 Una certificación vence a mitad de un turno ya programado a futuro

Separo dos casos, porque no son el mismo problema:

- **Vence antes de que empiece el turno** → violación `CERTIFICATION_EXPIRED` (regla 9). Si
  el turno ya estaba asignado cuando la certificación se venció o se acortó, la asignación
  pasa a `AT_RISK` con alerta `CERT_EXPIRING_BEFORE_SHIFT` y hay que resolverla antes del
  cierre. Mismo mecanismo que el equipo bloqueado (§2.1): avisar, no borrar.
- **Vence a mitad del turno** (vigente al iniciar, vencida al terminar) → **se permite** con
  violación de severidad `WARNING`, visible en la asignación y registrada. Decidir si se
  acorta el turno, se releva al operador a mitad de jornada o se acelera la renovación es una
  decisión de operaciones; el software da el dato exacto (*"vence a las 03:00 del turno
  noche"*) y no decide por ellos.

Además, al crear o renovar una certificación se recalcula el riesgo de todos los turnos
futuros de ese operador, para que la alerta aparezca el día que se genera el problema y no
el día del turno.

### 2.6 Dos supervisores asignan el mismo equipo al mismo turno a la vez

**Decisión: la garantía la da la base de datos; la transacción solo mejora el mensaje.**

Tres capas, de la más fuerte a la más cosmética:

1. **Índice único** `UNIQUE (shift_id, equipment_id, active_slot)` (y el equivalente para
   operador). Si dos requests pasan la validación al mismo tiempo, uno inserta y el otro
   recibe violación de unicidad, que traduzco a
   **409 "otro usuario acaba de tomar este equipo para este turno"**. Funciona con N
   instancias serverless y sin coordinación entre ellas. Es la única capa que *no* puede
   fallar.
2. **`SELECT … FOR UPDATE` sobre la fila del equipo** dentro de la transacción (aislamiento
   `Serializable`): serializa las validaciones sobre el mismo equipo y evita que dos
   procesos lean el mismo estado y ambos concluyan "disponible".
3. **Bloqueo optimista** con columna `version` en `Equipment` para los movimientos de
   horómetro (cierre de turno, mantenimiento): si la versión cambió se reintenta una vez y
   si no, 409.

Está probado: `tests/integration/concurrency.spec.ts` dispara dos (y veinte) creaciones
simultáneas con `Promise.allSettled` y verifica que exactamente una tenga éxito y que la
base quede con una sola fila vigente.

*Alternativa descartada:* bloqueo a nivel de aplicación (mutex en memoria). Inútil apenas
hay más de una instancia, que es exactamente lo que pasa en un despliegue serverless.

---

## 3. Otras decisiones de criterio

- **Postgres en vez de MySQL.** El enunciado acepta ambos. Elegí PostgreSQL porque el free
  tier de Neon **despierta solo** tras la inactividad, mientras que el MySQL gratuito de
  Aiven se apaga y hay que reencenderlo a mano — riesgo directo sobre el requisito
  "desplegado y funcionando" cuando el link se abre días después. La app usa Prisma, así que el
  cambio a MySQL es el `provider` del datasource, `@db.VarChar(191)` en los campos
  indexados y regenerar la migración inicial: unos diez minutos.
- **Monolito, un repo, un despliegue.** Lo que se evalúa es el modelo, las reglas y que esté
  en línea. Separar backend y frontend habría duplicado infraestructura sin sumar puntos.
- **Reglas en TypeScript puro, sin ORM.** `src/domain/` no importa Prisma ni Next: recibe
  datos planos y devuelve `Violation[]`. Esto hace que las reglas se testeen en milisegundos
  y —más importante— que se puedan leer y discutir sin conocer el framework.
- **Sin *early return* en el motor.** La regla 11 obliga a mostrar todas las razones, así que
  la validación acumula y nunca corta al primer problema. Es una decisión de diseño, no un
  detalle: cortar en la primera es el bug clásico de este tipo de sistemas.
- **Autenticación mínima con roles.** Sin identidad no existe "autorización de supervisor",
  así que hay login con tres roles (`SUPERVISOR`, `PLANNER`, `VIEWER`). No hay recuperación
  de contraseña ni gestión de usuarios: no aporta al problema.
- **Zona horaria `America/Lima`, almacenamiento en UTC**, fecha del turno como `date` pura.

---

## 4. Qué dejé fuera

Con criterio de "el núcleo bien resuelto antes que todo a medias":

| Fuera | Por qué |
|---|---|
| Notificaciones por correo/WhatsApp de las alertas | Las alertas existen y se ven en el tablero; el canal de salida es infraestructura, no reglas. |
| Calendario con drag & drop para reprogramar turnos | Alto costo en UI, cero peso en la evaluación. |
| Gestión de usuarios desde la interfaz | Tres usuarios sembrados alcanzan para demostrar los roles. |
| Reportes exportables (Excel/PDF) y KPIs históricos | Los datos están modelados para soportarlos (ledger, `overdueHours`, desvíos); construirlos es trabajo posterior. |
| Órdenes de trabajo, repuestos, costos de mantenimiento | Es otro dominio (un CMMS completo), fuera del enunciado. |
| Multi-tenant / varias operaciones mineras | No pedido; agregaría una dimensión a todas las tablas sin aportar. |
| Pruebas E2E con Playwright | Los flujos críticos están cubiertos por tests de integración contra base real. |
| Auditoría genérica de todos los cambios | Hay traza específica en lo que importa (horómetro, excepciones, cierres). Una tabla de auditoría universal era más ruido que valor en 7 días. |

---

## 5. Qué haría con más tiempo

1. **Reprogramación asistida:** cuando un equipo se bloquea, sugerir automáticamente equipos
   equivalentes disponibles con operador certificado para ese turno. Es el paso natural
   entre "avisar" y "resolver".
2. **Proyección con horas reales promedio** en vez de horas planificadas: usar el histórico
   de desvío por equipo o frente para estimar mejor cuándo se cruza el umbral.
3. **Job programado** (cron diario) que recalcule riesgos y genere el resumen de la mañana
   antes del cambio de guardia, con envío por correo.
4. **Mantenimiento preventivo por calendario**, no solo por horómetro (hay componentes que
   se sirven por tiempo aunque el equipo esté parado).
5. **Métricas de operación:** disponibilidad mecánica, utilización, cumplimiento del plan de
   mantenimiento, horas por operador. Los datos ya están; falta la capa de reportes.
6. **Observabilidad:** logs estructurados a un servicio externo, trazas y alertas de errores
   (hoy solo hay logs JSON en la plataforma).
7. **Modo offline/campo:** captura de horas reales desde el frente con sincronización, que es
   el punto donde estos sistemas suelen morir en la práctica.

---

## 6. Uso de inteligencia artificial

Declaración pedida por el enunciado.

**Herramientas usadas:** `<completar: p. ej. Claude (Anthropic) y GitHub Copilot>`.

**Para qué las usé:**
- Discutir alternativas de modelado (dónde vive el intervalo, umbral almacenado vs.
  calculado, política de desfase) y contrastar mi razonamiento antes de decidir.
- Redactar y ordenar esta documentación.
- Generar código repetitivo: componentes de tabla, formularios, tipos, esqueletos de tests.
- Revisar mis migraciones e índices y buscar casos borde que se me hubieran pasado.

**Para qué NO las usé:**
- El motor de reglas (`src/domain/`), el algoritmo de proyección, la política de umbrales y
  el manejo de concurrencia los diseñé y escribí yo. Es la parte que se evalúa y la parte
  que tengo que poder sustentar.

**Control de calidad:** todo lo generado fue leído, adaptado y cubierto por tests. No hay
código en el repositorio que no pueda explicar línea por línea, incluidas las decisiones que
descarté y por qué.
