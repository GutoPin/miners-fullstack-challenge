# Decisiones de diseño

Cómo modelé los datos y por qué, cómo resolví cada decisión abierta del enunciado, qué dejé
fuera y qué haría con más tiempo.

---

## 1. Modelo de datos

### 1.1 Decisiones estructurales

**a) El intervalo de mantenimiento vive en el tipo de equipo, con excepción por unidad.**
El enunciado dice que cada tipo de equipo tiene un intervalo, así que lo modelé en
`EquipmentType.maintenanceIntervalHours`. Agregué además
`Equipment.maintenanceIntervalOverride` (nulo por defecto) porque en operación real una
unidad reparada o antigua puede quedar con un régimen distinto al de su familia. Cuesta una
columna y evita tener que migrar la tabla más adelante.

**b) El umbral se almacena, no se calcula.** `Equipment.nextMaintenanceHours` guarda el
valor de horómetro que dispara el bloqueo. Se podría derivar
(`horas del último servicio + intervalo`), pero almacenarlo tiene tres ventajas: la
proyección de 7 días queda como una consulta simple, permite umbrales excepcionales
autorizados, y deja explícita la política de desfase de §2.3 en lugar de esconderla en una
fórmula.

**c) El horómetro es un libro mayor, no un contador.** `HourmeterEntry` registra cada
movimiento con `hoursBefore`, `hoursDelta`, `hoursAfter`, origen (`SHIFT_CLOSE`,
`MAINTENANCE`, `MANUAL_ADJUSTMENT`, `INITIAL_LOAD`) y referencia. `Equipment.currentHours`
es un saldo cacheado que solo se actualiza dentro de la misma transacción que escribe el
asiento. El horómetro determina cuándo entra un equipo a mantenimiento y cuánto cuesta
operarlo, así que tiene que ser auditable y reconstruible. Hay un test que verifica el
invariante `suma(deltas) == currentHours`.

**d) Las reglas 6 y 7 son restricciones de base de datos, no `if` de aplicación.**
`UNIQUE (shift_id, equipment_id, active_slot)` y `UNIQUE (shift_id, operator_id, active_slot)`,
donde `activeSlot` vale `1` mientras la asignación ocupa cupo y pasa a `NULL` al cancelarla.
Tanto PostgreSQL como MySQL tratan los `NULL` como distintos entre sí, así que el histórico
de canceladas convive con la restricción. La comprobación en la aplicación existe para dar
buenos mensajes; la garantía la da el motor, que es lo único que sigue funcionando con
varias instancias en paralelo.

**e) Planificado y real son columnas distintas.** `Assignment.plannedHours` y
`actualHours`, más `Shift.plannedHours`. El horómetro se mueve con las horas reales, y la
diferencia entre ambas es información útil para planeamiento que en las hojas de cálculo se
pierde.

### 1.2 Entidades

`EquipmentType`, `Equipment`, `Operator`, `Certification`, `Shift`, `Assignment`,
`AssignmentOverride`, `MaintenanceRecord`, `HourmeterEntry`, `Alert`, `User`.
El esquema completo, con índices, restricciones `CHECK` y comentarios, está en
`prisma/schema.prisma` y en las migraciones versionadas de `prisma/migrations/`.

Tres decisiones menores del modelo:

- **Certificaciones múltiples por operador y tipo de equipo.** Guardo el historial de
  renovaciones y aplico la de mayor fecha de vencimiento a la fecha del turno. Con una sola
  fila por (operador, tipo) habría que sobrescribir el historial en cada renovación.
- **`Shift` guarda `date` (sin hora) y también `startsAt` / `endsAt`.** La fecha operativa
  es la que usa la mina: un turno noche del 12 sigue siendo del 12 aunque termine el 13. Los
  instantes reales los uso para evaluar si una certificación vence durante el turno.
- **`Alert` es una tabla y no un cálculo al vuelo.** Así queda registro de que el sistema
  avisó y de cuándo lo hizo.

---

## 2. Decisiones abiertas del enunciado

### 2.1 Un equipo se bloquea a mitad de semana y ya tenía turnos programados

**Decisión: las asignaciones no se cancelan. Pasan a `EN RIESGO`, con alerta crítica, y el
turno no se puede cerrar sin resolverlas.**

No cancelo automáticamente porque el planificador se enteraría del hueco recién en el cambio
de guardia, que es el peor momento. Tampoco me parece correcto que el sistema borre por su
cuenta algo que una persona decidió. Lo que sí hace es impedir que el problema pase
desapercibido:

1. Al bloquearse el equipo, sus asignaciones en turnos futuros `PLANNED` pasan a `AT_RISK`
   con su `riskReason`, dentro de la misma transacción que produjo el bloqueo.
2. Se crea una alerta `ASSIGNMENT_AT_RISK` de severidad `CRITICAL`, visible en el tablero,
   con acceso directo a reasignar o cancelar.
3. El cierre de turno exige resolver toda asignación `AT_RISK`: reasignar, cancelar o forzar
   con autorización de un supervisor.
4. Si se registra el mantenimiento antes del turno, las asignaciones vuelven a `ACTIVE` y
   las alertas quedan resueltas automáticamente.

*Alternativa descartada:* cancelación automática con notificación. Es más simple de
programar, pero traslada el problema a la operación en el peor momento.

### 2.2 ¿Se puede forzar una asignación con autorización de un supervisor?

**Decisión: sí, pero solo para algunas reglas y dejando traza completa.**

Clasifiqué cada violación en dos grupos; el catálogo completo está en
`src/domain/rules/violation.ts`:

- **`HARD`, no se puede forzar:** operador o equipo ya asignados en el mismo turno, turno
  cerrado, equipo dado de baja. Son imposibilidades físicas o inconsistencias de datos, y
  autorizarlas no cambiaría el hecho de que un equipo no puede estar en dos frentes a la vez.
- **`OVERRIDABLE`, se puede forzar con firma:** equipo bloqueado por horómetro, equipo en
  mantenimiento, certificación vencida o inexistente. Son políticas de la empresa, y en una
  operación real un superintendente puede levantarlas bajo su responsabilidad.

Cómo queda registrada la excepción:

- Solo el rol `SUPERVISOR` puede enviarla.
- El motivo es obligatorio, con un mínimo de 15 caracteres, y se guarda en
  `AssignmentOverride.reason`.
- Se guarda también el detalle de las violaciones que se saltaron, en `violatedRules` (JSON).
  Si mañana cambia una regla, el registro conserva qué se saltó ese día y con qué datos.
- La asignación queda en estado `AT_RISK` y no `ACTIVE`, y se muestra como tal en toda la
  aplicación.
- Se genera una alerta `OVERRIDE_USED` y la pantalla `/auditoria` lista todas las
  excepciones con su supervisor, motivo y fecha.

La idea es que forzar sea posible pero quede registrado. Si el sistema no admitiera ninguna
excepción, la operación terminaría resolviéndolo por fuera y perderíamos la traza.

### 2.3 Mantenimiento hecho 30 horas después del umbral: ¿desde dónde cuenta el siguiente ciclo?

**Decisión: desde el umbral, no desde el horómetro real.**

Con umbral 250 h, servicio a las 280 h e intervalo de 250 h, el siguiente umbral es **500**,
no 530. Las 30 horas de atraso se guardan en `MaintenanceRecord.overdueHours` como
indicador, no como crédito.

El motivo es el desfase que menciona el enunciado: si contara desde el horómetro real, cada
atraso correría la ventana hacia adelante y el retraso se iría acumulando. Al cabo de un año
la unidad habría recibido menos servicios de los que indica el fabricante, y sería difícil de
detectar porque cada ciclo por separado se vería correcto. Anclando al umbral, el atraso
queda como un dato aislado y medible.

**Salvaguarda:** si el atraso superó un ciclo completo (por ejemplo, servicio a las 780 h con
umbral 250 e intervalo 250), anclar daría 500 h y el equipo saldría del taller ya bloqueado.
En ese caso el siguiente umbral se calcula como el primer múltiplo por encima del horómetro
real (1.000) y se marca `reAnchored = true` en el registro, para que el caso se pueda revisar
después. Está cubierto por tests.

*Alternativa descartada:* contar desde el horómetro real. Es lo que hace la hoja de cálculo
actual y es la causa del desfase que señala el enunciado.

### 2.4 El turno se cerró con más o menos horas de las planificadas

**Decisión: mandan las horas reales; el desvío se registra y, si es grande, se justifica.**

- El horómetro suma siempre `actualHours`, porque refleja el uso real del equipo.
- Se conservan `plannedHours` y `actualHours` por asignación, así que el desvío queda
  consultable.
- Si el desvío supera 2 horas en valor absoluto o el 25 % de lo planificado, la nota es
  obligatoria. Sin ella el dato pierde valor para reportería.
- El cierre es idempotente: un turno ya cerrado no se vuelve a cerrar ni suma horas de nuevo.
- Las horas fuera de rango (≤ 0 o > 24) se rechazan con una restricción `CHECK` en la base,
  no solo desde la interfaz.
- Si después del cierre se detecta un error de digitación, no se edita el registro anterior:
  se agrega un asiento `MANUAL_ADJUSTMENT` con su motivo y su autor.

### 2.5 Una certificación vence a mitad de un turno ya programado a futuro

Separo dos casos porque tienen consecuencias distintas:

- **Vence antes de que empiece el turno.** Es una violación `CERTIFICATION_EXPIRED` (regla
  9). Si el turno ya estaba asignado cuando la certificación venció, la asignación pasa a
  `AT_RISK` con alerta `CERT_EXPIRING_BEFORE_SHIFT` y hay que resolverla antes del cierre.
  Es el mismo mecanismo que uso para el equipo bloqueado en §2.1.
- **Vence a mitad del turno**, es decir, vigente al iniciar y vencida al terminar. Se permite
  con una violación de severidad `WARNING`, visible en la asignación y registrada. Si se
  acorta el turno, se releva al operador o se acelera la renovación es una decisión de
  operaciones; el sistema aporta el dato exacto ("vence a las 03:00 del turno noche").

Además, al crear o renovar una certificación se recalcula el riesgo de todos los turnos
futuros de ese operador, para que la alerta aparezca el día en que se genera el problema y no
el día del turno.

### 2.6 Dos supervisores asignan el mismo equipo al mismo turno a la vez

**Decisión: la garantía la da la base de datos; la transacción sirve para dar un mejor
mensaje.**

Tres capas, de la más fuerte a la menos:

1. **Índice único** `UNIQUE (shift_id, equipment_id, active_slot)`, y su equivalente para el
   operador. Si dos peticiones pasan la validación al mismo tiempo, una inserta y la otra
   recibe una violación de unicidad, que traduzco a un **409 "otro usuario acaba de tomar
   este equipo para este turno"**. Funciona con varias instancias y sin coordinación entre
   ellas, porque no depende del código de aplicación.
2. **`SELECT … FOR UPDATE` sobre la fila del equipo** dentro de la transacción, con
   aislamiento `Serializable`. Serializa las validaciones sobre el mismo equipo y evita que
   dos procesos lean el mismo estado y ambos concluyan que está disponible.
3. **Bloqueo optimista** con una columna `version` en `Equipment` para los movimientos de
   horómetro (cierre de turno y mantenimiento). Si la versión cambió, se reintenta una vez y,
   si vuelve a fallar, se responde 409.

Está probado en `tests/integration/concurrency.spec.ts`, que dispara dos y veinte creaciones
simultáneas con `Promise.allSettled` y verifica que solo una tenga éxito y que quede una sola
fila vigente en la base.

*Alternativa descartada:* un bloqueo en memoria de la aplicación. Deja de servir apenas hay
más de una instancia, que es justamente lo que ocurre en un despliegue serverless.

---

## 3. Otras decisiones de criterio

- **PostgreSQL en vez de MySQL.** El enunciado acepta ambos. Elegí PostgreSQL porque el plan
  gratuito de Neon reactiva la base sola tras la inactividad, mientras que el MySQL gratuito
  de Aiven se apaga y hay que encenderlo a mano desde la consola. Como la prueba se evalúa
  días después de entregarla, eso era un riesgo directo sobre el requisito de que esté
  desplegada y funcionando. El cambio a MySQL sería el `provider` del datasource,
  `@db.VarChar(191)` en los campos indexados y regenerar la migración inicial.
- **Monolito, un repositorio, un despliegue.** Lo que se evalúa es el modelo, las reglas y
  que la aplicación esté en línea. Separar backend y frontend habría duplicado
  infraestructura sin aportar a eso.
- **Reglas en TypeScript puro, sin ORM.** `src/domain/` no importa Prisma ni Next: recibe
  datos planos y devuelve `Violation[]`. Así las reglas se testean en milisegundos y se
  pueden leer sin conocer el framework.
- **Sin salida temprana en el motor de reglas.** La regla 11 pide mostrar todas las razones,
  así que la validación las acumula y nunca corta en la primera.
- **Autenticación mínima con roles.** Sin identidad no puede existir la autorización de un
  supervisor, así que hay login con tres roles (`SUPERVISOR`, `PLANNER`, `VIEWER`). No hay
  recuperación de contraseña ni gestión de usuarios porque no aportan al problema.
- **Zona horaria `America/Lima`, almacenamiento en UTC**, y la fecha del turno como `date`
  sin hora.
- **Un solo lugar donde se construyen los errores y una línea de log por resultado.** Todas
  las respuestas de error salen de `toErrorResponse()`, así que el formato
  `{ error: { code, message, violations } }` no depende de que cada endpoint lo repita. Ahí
  mismo se emite una línea JSON con el `requestId`, el usuario y los códigos de violación, y
  ese identificador vuelve en la cabecera `x-request-id`, de modo que con el número que ve el
  usuario se puede ubicar la línea en los logs. Los rechazos de negocio se registran como
  `warn` y no como `error`, porque son parte del funcionamiento normal.

---

## 4. Qué dejé fuera

Prioricé resolver bien el núcleo antes que cubrir todo parcialmente:

| Fuera | Por qué |
|---|---|
| Notificaciones por correo o WhatsApp de las alertas | Las alertas existen y se ven en el tablero. El canal de salida es infraestructura y no cambia las reglas. |
| Calendario con arrastrar y soltar para reprogramar turnos | Costo alto en interfaz y el enunciado no evalúa diseño. |
| Gestión de usuarios desde la interfaz | Con los tres usuarios sembrados alcanza para demostrar los roles. |
| Reportes exportables (Excel/PDF) y KPIs históricos | Los datos ya están modelados para soportarlos (ledger, `overdueHours`, desvíos); falta la capa de reportes. |
| Órdenes de trabajo, repuestos y costos de mantenimiento | Es otro dominio, un CMMS completo, fuera del enunciado. |
| Multi-tenant o varias operaciones mineras | No se pide y agregaría una dimensión a todas las tablas. |
| Pruebas end to end con Playwright | Los flujos críticos ya están cubiertos con tests de integración contra una base real. |
| Auditoría genérica de todos los cambios | Hay traza específica donde importa: horómetro, excepciones y cierres. Una tabla de auditoría universal aportaba poco en el tiempo disponible. |

---

## 5. Qué haría con más tiempo

1. **Reprogramación asistida:** cuando un equipo se bloquea, sugerir equipos equivalentes
   disponibles con operador certificado para ese turno. Es el paso siguiente entre avisar y
   resolver.
2. **Proyección con horas reales promedio** en lugar de horas planificadas, usando el
   histórico de desvío por equipo o frente para estimar mejor cuándo se cruza el umbral.
3. **Tarea programada diaria** que recalcule riesgos y genere el resumen de la mañana antes
   del cambio de guardia.
4. **Mantenimiento preventivo por calendario** además de por horómetro, porque hay
   componentes que se sirven por tiempo aunque el equipo esté detenido.
5. **Métricas de operación:** disponibilidad mecánica, utilización, cumplimiento del plan de
   mantenimiento y horas por operador. Los datos ya están.
6. **Observabilidad:** envío de los logs estructurados a un servicio externo, con trazas y
   alertas de error.
7. **Captura offline en campo:** registro de horas reales desde el frente con sincronización
   posterior, que suele ser el punto donde estos sistemas fallan en la práctica.

---

## 6. Uso de inteligencia artificial

Usé un asistente de IA (Claude) como apoyo durante el desarrollo, igual que uso la
documentación oficial o la consulta con un colega para contrastar una idea antes de decidir.
Los usos más concretos fueron ampliar los casos borde de los tests, acelerar el código
repetitivo de la interfaz y discutir alternativas de modelado.

Las decisiones de fondo —el modelo de datos, la política de umbral anclado, cómo se resuelve
la concurrencia y qué queda fuera del alcance— son las que están argumentadas en este
documento, con sus alternativas descartadas.