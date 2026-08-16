# Contexto del proyecto para el agente

> Este archivo se lee automáticamente al inicio de cada sesión. Cópialo también como
> `AGENTS.md` si usas otra herramienta.

## Qué es esto

Prueba técnica de 7 días para un puesto full stack. Aplicación de control de equipos
mineros y mantenimiento por horómetro. **Se evalúa, en este orden:**

1. Modelo de datos y correcta implementación de reglas de negocio que se cruzan entre sí.
2. Que esté desplegado y funcione de verdad.
3. Criterio y sustento de las decisiones (`DECISIONES.md`).
4. Calidad del código y del repositorio (estructura, legibilidad, historial de commits).
5. Interfaz usable. **No se evalúa diseño gráfico.**

## Restricción que gobierna todo

**El autor tiene que poder explicar cada línea entregada en una sustentación oral.**
El enunciado lo dice de forma explícita: *"si hay código que no puedes sustentar, es mejor
que no lo entregues"*.

En la práctica esto significa:
- Prefiere la solución simple y legible sobre la ingeniosa.
- Nada de abstracciones "por si acaso", patrones no pedidos ni capas de indirección.
- Si una solución requiere conocimiento no obvio (un lock, un índice parcial, un truco de
  Prisma), **explícalo en el momento en 2–3 líneas de chat**, no solo en un comentario.
- No agregues dependencias sin preguntar primero y justificar por qué.

## Documentación: léela antes de escribir código

| Archivo | Cuándo consultarlo |
|---|---|
| `docs/ARQUITECTURA.md` | Estructura de carpetas, capas, flujo de una asignación, concurrencia |
| `docs/MODELO-DATOS.md` | Esquema Prisma completo, índices, invariantes, política de umbrales |
| `docs/REGLAS-NEGOCIO.md` | Las 12 reglas, códigos de violación, severidades, algoritmo de proyección |
| `docs/DESPLIEGUE.md` | Neon, Vercel, Docker, CI, variante MySQL |
| `docs/PRUEBAS.md` | Casos de test obligatorios, datos semilla, guion de demo |
| `docs/UI.md` | Pantallas, estados, mensajes de error |
| `docs/SETUP.md` | Entorno local en WSL |
| `TODO.md` | Plan día por día y checklist de entrega |
| `DECISIONES.md` | Entregable obligatorio: decisiones ya tomadas y argumentadas |

**Estos documentos son la fuente de verdad.** Si algo del código contradice la
documentación, no elijas por tu cuenta: avisa y pregunta cuál de los dos se corrige.

## Stack (ya decidido, no proponer alternativas)

Next.js 15 App Router · TypeScript · **Prisma 7** · PostgreSQL (Neon) · Tailwind +
shadcn/ui · Zod · Auth.js Credentials · Vitest · Vercel.

### ⚠️ Prisma 7, no 6

La mayoría de ejemplos que conoces son de Prisma 6 y **no compilan aquí**. En este proyecto:

- La URL de conexión **no** va en `schema.prisma`. Va en `prisma.config.ts`, en
  `datasource.url`, leyendo `MIGRATE_DATABASE_URL` (conexión directa, sin pooler).
- `directUrl` ya no existe como propiedad.
- `PrismaClient` **exige** un driver adapter: `new PrismaClient({ adapter })` con
  `PrismaPg` de `@prisma/adapter-pg`. `new PrismaClient()` a secas es un error.
- El cliente se importa desde `src/db/generated/client` (ruta propia), no desde
  `@prisma/client`.
- El singleton vive en `src/db/prisma.ts`; todo el código importa `prisma` desde ahí.
- `prisma.config.ts` necesita `import 'dotenv/config'` al inicio: la CLI de la v7 no carga
  `.env` automáticamente.
- El seed se declara en `prisma.config.ts` (`migrations.seed`), nunca en `package.json`.
- Migraciones siempre con `migrate dev` / `migrate deploy`. Nunca `db push`.

Si un ejemplo que ibas a usar contradice algo de esta lista, está desactualizado.

## Reglas de código innegociables

1. **`src/domain/` es TypeScript puro.** No importa Prisma, ni Next, ni nada de red.
   Recibe objetos planos y devuelve decisiones. Es lo que se testea sin base de datos.
2. **El motor de reglas nunca hace early return.** `validateAssignment()` acumula y devuelve
   *todas* las violaciones (regla 11 del enunciado). Cortar en la primera es un bug, no una
   optimización.
3. **Toda validación se hace en el servidor.** La validación en el cliente solo mejora la
   experiencia; nunca es la garantía.
4. **Las invariantes fuertes viven en la base de datos**, no en la aplicación: índices
   únicos, `CHECK`, claves foráneas. El código de aplicación existe para dar buenos
   mensajes de error.
5. **Nada toca el horómetro sin escribir su asiento** en `HourmeterEntry`, en la misma
   transacción.
6. **Las escrituras que cruzan varias tablas van en `prisma.$transaction`** con el
   aislamiento indicado en `docs/ARQUITECTURA.md` §5.
7. **Los mensajes de error son en español, concretos y accionables.** Dicen qué pasó, con
   qué dato y qué hacer. Nunca "error de validación".
8. **Fechas:** almacenar en UTC, fecha de turno como `date` pura, mostrar en
   `America/Lima`. La vigencia de una certificación se evalúa contra la **fecha del turno**,
   nunca contra `new Date()`.
9. **Sin `any`, sin `@ts-ignore`, sin `console.log` olvidados.** Los logs de servidor son
   JSON estructurado con `requestId`.

## Flujo de trabajo esperado

- Avanza **por día del `TODO.md`**, no todo a la vez. Al terminar cada bloque: `npm run
  typecheck && npm run lint && npm run test` antes de pasar al siguiente.
- **El dominio se escribe con sus tests en la misma tanda.** Nada de "los tests después".
- Cambios pequeños y revisables. Si un cambio toca más de 5 archivos, propón el plan antes
  de escribirlo.
- **Marca las casillas del `TODO.md`** conforme avanzas.
- Si detectas un caso borde que la documentación no cubre, dilo y propón dos opciones con
  sus consecuencias, en vez de decidir en silencio. Si se decide algo nuevo, se anota en
  `DECISIONES.md`.

## Commits

Formato *conventional commits*, en español, uno por unidad de trabajo lógica:

```
feat(reglas): validacion de certificacion vigente a la fecha del turno
fix(turnos): el cierre no volvia a bloquear el equipo al cruzar el umbral
test(concurrencia): dos asignaciones simultaneas al mismo cupo
docs(decisiones): politica de umbral anclado
chore(deploy): workflow de keepalive
```

El historial se evalúa. Nada de un único commit gigante llamado "final", ni de commits
automáticos con firma de herramienta.

## Qué NO hacer

- No cambiar el esquema de la base sin actualizar `docs/MODELO-DATOS.md` en el mismo cambio.
- No inventar reglas de negocio que no estén en el enunciado o en `docs/REGLAS-NEGOCIO.md`.
- No generar componentes de UI elaborados, animaciones, dark mode ni gráficos: no se evalúan.
- No crear archivos de documentación nuevos sin pedirlo; ya existen los que hacen falta.
- No hacer `git push --force` ni reescribir historia.
- No poner credenciales en el código; van en `.env` (y `.env` está en `.gitignore`).
- No usar `prisma db push` en este proyecto: siempre `migrate dev` / `migrate deploy`, para
  que las migraciones queden versionadas en el repositorio.

## Definición de "terminado" para cualquier tarea

- [ ] Compila (`npm run typecheck`) y pasa el linter.
- [ ] Tiene test si toca dominio o servicios.
- [ ] La validación está en el servidor.
- [ ] Los errores devuelven `{ error: { code, message, violations[] } }`.
- [ ] La documentación afectada quedó actualizada.