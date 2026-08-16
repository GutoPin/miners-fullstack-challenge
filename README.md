# MineOps — Control de equipos mineros y mantenimiento por horómetro

Aplicación web que reemplaza las hojas de cálculo con las que una operación minera asigna
equipos (camiones de acarreo, excavadoras, perforadoras) a turnos y controla cuándo entran
a mantenimiento.

El sistema **no deja** que se asigne un equipo bloqueado, un operador sin certificación
vigente o el mismo equipo/operador dos veces en el mismo turno, y **proyecta** qué equipos
van a llegar a su mantenimiento en los próximos 7 días según los turnos ya programados.

- 🌐 **App desplegada:** <https://miners-fullstack-challenge.vercel.app>
- 📦 **Repositorio:** <https://github.com/GutoPin/miners-fullstack-challenge>
- 🧠 **Decisiones de diseño:** [`DECISIONES.md`](./DECISIONES.md)

---

## Credenciales de prueba

| Rol | Usuario | Contraseña | Puede |
|---|---|---|---|
| Supervisor | `supervisor@mineops.pe` | `supervisor123` | Todo, incluido **autorizar excepciones** |
| Planificador | `planner@mineops.pe` | `planner123` | Crear turnos y asignaciones, cerrar turnos |
| Consulta | `viewer@mineops.pe` | `viewer123` | Solo lectura |

---

## Qué hace

| Módulo | Qué resuelve |
|---|---|
| **Equipos** | Código, tipo, horómetro, estado (`DISPONIBLE / BLOQUEADO / EN_MANTENIMIENTO / FUERA_DE_SERVICIO`) y umbral del próximo mantenimiento. |
| **Mantenimientos** | Registrar servicio → libera el equipo y deja historial (fecha, horómetro, responsable, observaciones) + recalcula el próximo umbral. |
| **Operadores y certificaciones** | Certificación por tipo de equipo con fecha de vencimiento; validación contra la fecha del turno. |
| **Turnos y asignaciones** | Turno = fecha + jornada (día/noche) + duración. Asignación = operador + equipo + turno, validada contra las 12 reglas. |
| **Motor de reglas** | Cuando una asignación se rechaza devuelve **todas** las razones, no la primera. |
| **Cierre de turno** | Registra horas reales, las suma al horómetro y dispara el bloqueo por mantenimiento si corresponde. |
| **Proyección a 7 días** | Simula el consumo futuro de horas de los turnos programados y dice qué equipo cruza su umbral, en qué fecha y en qué turno. |
| **Excepciones con autorización** | Un supervisor puede forzar ciertas asignaciones dejando motivo y traza; otras reglas son **infranqueables**. |
| **Auditoría** | Bitácora de horómetro (ledger) y registro de excepciones. |

---

## Stack

| Capa | Elección |
|---|---|
| Framework (UI + API en un solo despliegue) | **Next.js 16 (App Router) + TypeScript** |
| UI | Tailwind CSS 4 · tipografía IBM Plex Sans/Mono |
| ORM / migraciones | **Prisma 7** (driver adapter `@prisma/adapter-pg`) |
| Base de datos | **PostgreSQL** en Neon (plan gratuito, serverless) |
| Auth | Auth.js (Credentials) + bcrypt, roles `SUPERVISOR / PLANNER / VIEWER` |
| Validación | Zod (mismos schemas en cliente y servidor) |
| Tests | Vitest (unitarios del motor de reglas + integración contra Postgres real) |
| CI | GitHub Actions (lint + typecheck + tests con servicio Postgres) |
| Local | Docker Compose (app + Postgres) |

El porqué de cada elección está en [`DECISIONES.md`](./DECISIONES.md).

---

## Levantarlo en local

### Puesta en marcha

```bash
cp .env.example .env             # completar AUTH_SECRET y las dos cadenas de conexión
docker compose up -d db          # Postgres 17 en localhost:5432
npm install
npx prisma migrate deploy        # crea el esquema y los CHECK constraints
npm run db:seed                  # carga los datos de ejemplo con los casos borde
npm run dev                      # http://localhost:3000
```

### Variables de entorno

```env
DATABASE_URL="postgresql://mineops:mineops@localhost:5432/mineops?schema=public"
# Conexión directa que usan las migraciones (en local, la misma; en Neon, la que no lleva -pooler)
MIGRATE_DATABASE_URL="postgresql://mineops:mineops@localhost:5432/mineops?schema=public"
AUTH_SECRET="<openssl rand -base64 32>"
AUTH_URL="http://localhost:3000"
TZ="America/Lima"
```

---

## Comandos

```bash
npm run dev            # desarrollo
npm run build          # build de producción
npm run lint           # eslint
npm run typecheck      # tsc --noEmit
npm run test           # unitarios (motor de reglas, proyección)
npm run test:int       # integración contra Postgres (requiere DB levantada)
npm run db:seed        # carga/recarga datos de ejemplo
npm run db:reset       # migrate reset + seed
```

---

## Datos de ejemplo (casos borde ya sembrados)

El seed deja el sistema listo para probar sin crear nada a mano:

1. **CAM-002** — camión a **12 horas** de su umbral de mantenimiento → aparece en la proyección.
2. **CAM-003** — ya **BLOQUEADO** por horómetro → cualquier intento de asignarlo se rechaza.
3. **OP-004 (Rosa Quispe)** — certificación de excavadora **vencida ayer** → rechazo por regla 9.
4. **OP-005** — certificación que **vence a mitad de la próxima semana**, con turnos ya programados después → asignación marcada `EN_RIESGO`.
5. **Turno T-HOY-DÍA** — al cerrarlo con las horas planificadas **dispara el bloqueo** de CAM-002.
6. **OP-001** — ya tiene una asignación en el turno de hoy → sirve para probar el rechazo múltiple (operador duplicado + equipo bloqueado + certificación vencida en un solo intento).

---

## Cómo se desplegó

- **App:** Vercel (plan Hobby, gratis). Cada push a `main` despliega; `prisma migrate deploy` corre en el build.
- **Base de datos:** PostgreSQL serverless en Neon (plan Free), rama `main` para producción.
- **Seed de producción:** `DATABASE_URL=<url-de-neon> npm run db:seed` desde local, una sola vez.

---

## Documentación del repo

| Archivo | Contenido |
|---|---|
| [`DECISIONES.md`](./DECISIONES.md) | **Entregable obligatorio:** modelo de datos, decisiones abiertas, qué quedó fuera, uso de IA. |
| `prisma/schema.prisma` | Esquema completo con índices e invariantes, comentado. |
| `src/domain/` | Motor de reglas en TypeScript puro, sin ORM: es donde vive el núcleo evaluable. |
| `tests/unit/` | Tests del motor de reglas, la política de umbrales y la proyección. |

---

## Alcance

Lo que **no** entra en esta entrega y por qué está en [`DECISIONES.md`](./DECISIONES.md#qué-dejé-fuera).
