# MineOps — Control de equipos mineros y mantenimiento por horómetro

[![CI](https://github.com/GutoPin/miners-fullstack-challenge/actions/workflows/ci.yml/badge.svg)](https://github.com/GutoPin/miners-fullstack-challenge/actions/workflows/ci.yml)

Aplicación web para asignar equipos (camiones de acarreo, excavadoras, perforadoras) a los
turnos de una operación minera y controlar cuándo entran a mantenimiento, en reemplazo de
las hojas de cálculo con las que hoy se lleva ese control.

El sistema **impide** asignar un equipo bloqueado por horómetro, un operador sin
certificación vigente o el mismo equipo dos veces en el mismo turno; cuando rechaza, muestra
**todas** las razones a la vez. Y **proyecta** qué equipos van a alcanzar su mantenimiento en
los próximos 7 días según los turnos ya programados, para que el bloqueo se anticipe en vez
de sorprender al inicio de la guardia.

| | |
|---|---|
| **Aplicación** | https://miners-fullstack-challenge.vercel.app |
| **Decisiones de diseño** | [`DECISIONES.md`](./DECISIONES.md) |

---

## Acceso

| Rol | Usuario | Contraseña | Alcance |
|---|---|---|---|
| Supervisor | `supervisor@mineops.pe` | `supervisor123` | Todo, incluido **autorizar excepciones** |
| Planificador | `planner@mineops.pe` | `planner123` | Crear turnos y asignaciones, cerrar turnos, registrar mantenimientos |
| Consulta | `viewer@mineops.pe` | `viewer123` | Solo lectura |

---

## Funcionalidad

| Módulo | Qué resuelve |
|---|---|
| **Equipos** | Horómetro, estado (`DISPONIBLE / BLOQUEADO / EN MANTENIMIENTO / FUERA DE SERVICIO`) y umbral del próximo servicio. |
| **Operadores y certificaciones** | Certificación por tipo de equipo con vencimiento; la vigencia se evalúa contra la fecha del turno, no contra hoy. |
| **Turnos y asignaciones** | Turno = fecha + jornada (día/noche) + duración. Cada asignación se valida contra las 12 reglas del enunciado. |
| **Motor de reglas** | Un rechazo devuelve el listado completo de violaciones, cada una con su severidad y qué hacer para resolverla. |
| **Excepciones con autorización** | Un supervisor puede forzar las reglas que son política (equipo bloqueado, certificación vencida) dejando motivo y traza; las que son imposibilidad física no se fuerzan nunca. |
| **Cierre de turno** | Registra horas reales, las suma al horómetro y bloquea el equipo si cruzó el umbral, en una sola transacción. |
| **Mantenimiento** | Libera el equipo, ancla el próximo umbral y deja historial con responsable, horómetro y atraso. |
| **Proyección a 7 días** | Simula el consumo de horas de los turnos programados: qué equipo cruza su umbral, en qué fecha y en qué turno. |
| **Auditoría** | Libro mayor del horómetro y registro de excepciones autorizadas. |

---

## Recorrido de la demo

Los datos de ejemplo están cargados y los casos borde ya montados; el recorrido se hace
sobre el sistema tal como está.

1. **Un rechazo con todas sus razones** — en *Turnos*, abrir el turno de **dentro de cinco
   días** y asignar `CAM-003` a **Luis Mamani (OP-005)**. El sistema responde con las tres
   reglas incumplidas a la vez: equipo bloqueado por horómetro, operador ya asignado en ese
   turno y certificación de camión vencida a la fecha del turno. Una de ellas es
   infranqueable, así que la asignación no ofrece forzarse.
2. **Excepción autorizada** — en el turno de **hoy (día)**, asignar `CAM-003` a **María
   Flores (OP-002)**. Aquí la única regla incumplida es una política, así que un supervisor
   ve *Forzar con autorización*: exige motivo, queda firmada en la auditoría y la asignación
   nace **EN RIESGO**, no activa. Cancelarla después demuestra la otra mitad de la regla: el
   turno no se deja cerrar mientras haya asignaciones en riesgo sin resolver.
3. **Bloqueo por horómetro** — cerrar el turno de hoy. `CAM-002` pasa de 738 a 750 h, cruza
   su umbral y queda **BLOQUEADO** solo; su asignación de pasado mañana pasa a **EN RIESGO**
   con alerta crítica, en la misma transacción.
4. **Proyección** — */proyeccion* anticipa lo anterior sin necesidad de que ocurra:
   `CAM-002` y `EXC-001` cruzan su umbral dentro de la semana, con la fecha y la jornada
   exactas en que sucede.
5. **Mantenimiento** — registrar el servicio de `CAM-002` lo libera, ancla el siguiente
   umbral al anterior (no al horómetro real) y devuelve a activas las asignaciones que
   estaban en riesgo por ese bloqueo.
6. **Auditoría** — */auditoria* muestra el libro mayor del horómetro, con horas antes y
   después de cada movimiento, y las excepciones firmadas.

---

## Stack

| Capa | Elección |
|---|---|
| Framework (UI + API en un despliegue) | Next.js 16 (App Router) + TypeScript |
| Base de datos | PostgreSQL (Neon) |
| ORM y migraciones | Prisma 7 con driver adapter `@prisma/adapter-pg` |
| Autenticación | Auth.js (Credentials) + bcrypt, roles `SUPERVISOR / PLANNER / VIEWER` |
| Validación | Zod en el borde HTTP; las reglas de negocio, en TypeScript puro |
| UI | Tailwind CSS 4 |
| Tests | Vitest: unitarios del motor de reglas + integración contra PostgreSQL real |
| CI | GitHub Actions: lint, typecheck y ambas suites en cada push |
| Infraestructura | Vercel + Neon; `docker compose` para levantar todo en local |

El porqué de cada elección está en [`DECISIONES.md`](./DECISIONES.md).

---

## Ejecución local

Con Docker, que además migra y siembra los datos de ejemplo:

```bash
docker compose up --build        # http://localhost:3000
```

Con Node, contra una base propia:

```bash
cp .env.example .env             # completar AUTH_SECRET y las cadenas de conexión
docker compose up -d db          # PostgreSQL 17 en localhost:5432
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

### Variables de entorno

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión que usa la aplicación (en Neon, la del *pooler*). |
| `MIGRATE_DATABASE_URL` | Conexión directa que usan las migraciones; la lee `prisma.config.ts`. |
| `AUTH_SECRET` | Firma de la sesión (`openssl rand -base64 32`). |
| `AUTH_URL` | URL pública de la aplicación, con esquema. |

### Comandos

```bash
npm run dev            # desarrollo
npm run lint           # eslint
npm run typecheck      # tsc --noEmit
npm run test           # unitarios: reglas, política de umbrales y proyección
npm run test:int       # integración: cierre, mantenimiento y concurrencia (requiere base)
npm run db:seed        # datos de ejemplo
```

---

## Despliegue

La aplicación corre en Vercel y la base en Neon (PostgreSQL serverless). Cada push a `main`
despliega y aplica las migraciones pendientes; un workflow programado consulta
`/api/health` cada 6 horas para que la base no esté fría cuando se abra la demo.

Los rechazos y errores del API se registran como una línea JSON con `requestId`, y ese mismo
identificador vuelve en la cabecera `x-request-id` de la respuesta: con el número que ve el
usuario se ubica la línea exacta en los logs.

---

## Estructura

```
src/domain/      Reglas de negocio en TypeScript puro: sin ORM, sin framework
src/services/    Casos de uso y transacciones
app/api/         Endpoints REST
app/(dashboard)/ Interfaz
prisma/          Esquema, migraciones versionadas y datos de ejemplo
tests/           Unitarios del dominio e integración contra PostgreSQL
```
