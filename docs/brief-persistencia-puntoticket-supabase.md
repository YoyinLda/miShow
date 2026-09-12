# Brief de ejecución: persistencia PuntoTicket en Supabase

## 1. Identificación

- **Proyecto:** miShow
- **Etapa:** persistencia de resultados normalizados del scraper PuntoTicket
- **Branch sugerida:** `feat/puntoticket-supabase-persistence`
- **Branch base:** `main`
- **Flujo obligatorio:** `designer → aprobación TL/PO → dev → qa`
- **Resultado requerido:** `VEREDICTO QA: APROBADO`

## 2. Contexto

La etapa anterior implementó y validó:

- adquisición HTTP controlada desde PuntoTicket;
- descubrimiento de eventos desde páginas de categoría;
- extracción JSON-LD + HTML;
- normalización determinista;
- múltiples funciones por evento;
- separación entre `source_url` y `purchase_url`;
- disponibilidad global e independiente por función;
- validación estricta de URLs;
- ejecución CLI;
- pruebas sin red y smoke tests en vivo.

Actualmente el scraper produce un documento normalizado en memoria y lo entrega por `stdout`. Esta etapa debe persistir ese resultado en PostgreSQL mediante Supabase, manteniendo desacopladas adquisición, extracción, normalización y persistencia.

No se debe incorporar todavía frontend, autenticación de usuarios, pagos, favoritos, notificaciones ni nuevas ticketeras.

## 3. Objetivo

Implementar una capa de persistencia idempotente que:

- guarde eventos PuntoTicket y sus funciones;
- actualice registros existentes sin duplicarlos;
- preserve `source_url` y `purchase_url`;
- conserve el estado individual de cada función;
- registre cada ejecución del scraper;
- registre errores parciales sin perder eventos exitosos;
- permita consultar posteriormente un catálogo público;
- mantenga las credenciales privilegiadas fuera del frontend;
- pueda probarse localmente sin depender obligatoriamente de una base remota.

## 4. Principios de diseño

### Fuente de verdad

El contrato normalizado existente es la entrada de la persistencia. La capa de base de datos no debe volver a interpretar HTML ni contener reglas específicas de PuntoTicket.

### Idempotencia

Procesar dos veces el mismo resultado debe actualizar los registros correspondientes y no crear duplicados. La identidad debe definirse con restricciones reales de PostgreSQL, no solo mediante consultas previas desde TypeScript.

### Separación de responsabilidades

- El parser no conoce Supabase.
- La normalización no conoce Supabase.
- El repositorio de persistencia recibe objetos normalizados.
- La CLI/orquestador coordina scraping y persistencia.
- Los tests unitarios del parser siguen funcionando sin red ni base de datos.

### Seguridad

- Nunca exponer `service_role`, secret keys ni credenciales de conexión en código cliente.
- No usar variables `NEXT_PUBLIC_*` para secretos.
- Toda escritura del scraper debe ejecutarse en un contexto servidor/CLI.
- Toda tabla ubicada en un esquema expuesto debe tener RLS habilitado.
- Los permisos SQL y las políticas RLS deben declararse explícitamente en migraciones.

### Migraciones reproducibles

El esquema debe quedar versionado mediante migraciones de Supabase. No se aceptan cambios realizados únicamente desde el Dashboard sin representación en el repositorio.

## 5. Alcance

### Incluido

- configuración local mínima de Supabase;
- migraciones SQL;
- tablas, restricciones e índices;
- repositorio/adaptador de persistencia;
- upsert transaccional de eventos y funciones;
- registro de ejecuciones y errores;
- integración opcional de persistencia en la CLI actual;
- pruebas unitarias y de integración;
- documentación de configuración y operación;
- revisión de seguridad y rendimiento.

### Fuera de alcance

- frontend o API pública completa;
- login, favoritos, alertas o pagos;
- nuevas ticketeras;
- almacenamiento de HTML, HAR o imágenes;
- cron o scheduler productivo;
- Edge Functions y Realtime;
- deduplicación entre fuentes diferentes;
- despliegue productivo automático.

## 6. Modelo mínimo esperado

El agente `designer` debe revisar `docs/modelo-datos.md`, los contratos TypeScript actuales y las migraciones existentes antes de proponer nombres definitivos.

### Fuentes

Campos mínimos sugeridos:

- `id`;
- `code`, único, por ejemplo `puntoticket`;
- `name`;
- `base_url`;
- `created_at`;
- `updated_at`.

### Eventos

Campos mínimos sugeridos:

- `id`;
- `source_id`;
- `source_url`;
- `name`;
- `image_url`;
- datos de artista, según el modelo vigente;
- datos del recinto;
- estado global;
- precio mínimo y máximo;
- moneda;
- `source_extracted_at`;
- `first_seen_at`;
- `last_seen_at`;
- `created_at`;
- `updated_at`.

Restricción mínima:

```text
unique(source_id, source_url)
```

### Funciones

Campos mínimos sugeridos:

- `id`;
- `event_id`;
- `starts_at` como `timestamptz`;
- `timezone`;
- `status`;
- `performance_code`;
- `purchase_url`;
- `first_seen_at`;
- `last_seen_at`;
- `created_at`;
- `updated_at`.

La clave natural debe respetar la deduplicación por instante real. `designer` debe decidir y justificar la restricción exacta considerando que `performance_code` puede estar ausente. No usar una expresión que permita duplicados silenciosos por valores `NULL`.

### Ejecuciones del scraper

Campos mínimos sugeridos:

- `id`;
- `source_id`;
- `listing_url`;
- `started_at`;
- `finished_at`;
- `status`;
- `discovered_count`;
- `attempted_count`;
- `succeeded_count`;
- `failed_count`;
- parámetros operativos no secretos;
- `created_at`.

Estados sugeridos: `running`, `succeeded`, `partial` y `failed`.

### Errores de ejecución

Campos mínimos sugeridos:

- `id`;
- `run_id`;
- `source_url`, cuando corresponda;
- `stage`;
- `error_code`;
- mensaje sanitizado;
- `created_at`.

No guardar headers de autorización, cookies, tokens, secretos ni cuerpos completos potencialmente sensibles.

## 7. Decisiones que debe resolver `designer`

Antes de implementar, presentar al TL/PO:

1. diagrama final de tablas y relaciones;
2. clave de idempotencia de eventos;
3. clave de idempotencia de funciones;
4. representación de artistas;
5. representación del recinto;
6. estrategia para valores ausentes;
7. reglas de transición de estados;
8. comportamiento cuando una extracción posterior trae menos información;
9. estrategia transaccional por evento y por ejecución;
10. política de lectura pública y escritura privada;
11. estrategia para eventos que dejan de aparecer en el listing;
12. retención de ejecuciones y errores.

No asumir que la ausencia temporal de un evento significa que fue cancelado o eliminado.

## 8. Reglas de actualización

### Datos parciales

Una extracción con campos ausentes no debe borrar automáticamente información válida obtenida anteriormente. Distinguir entre campo removido por la fuente, campo no extraído, valor desconocido y error parcial.

### Estados

`unknown` es un estado válido y conservador. No debe reemplazar automáticamente un estado más informativo cuando una ejecución perdió evidencia por un fallo de extracción. `designer` debe definir una regla determinista.

### URLs

- Persistir únicamente URLs que hayan pasado la validación.
- `source_url` identifica la publicación.
- `purchase_url` dirige a la compra.
- Nunca sustituir una por la otra.
- No reconstruir enlaces con información incompleta.

### Timestamps

- usar `timestamptz` para instantes;
- conservar `America/Santiago` como timezone semántica;
- almacenar tiempos técnicos en UTC;
- no depender del timezone del sistema operativo;
- diferenciar `extracted_at`, `first_seen_at`, `last_seen_at`, `created_at` y `updated_at`.

## 9. API, RLS y permisos

El catálogo será público posteriormente, pero la escritura será exclusivamente privada.

La migración debe declarar:

- RLS habilitado en todas las tablas del esquema `public`;
- `GRANT SELECT` solo en tablas o vistas realmente públicas;
- ausencia de permisos de escritura para `anon` y `authenticated`;
- permisos mínimos para el rol usado por el backend;
- políticas RLS coherentes con el acceso previsto.

No asumir que crear una tabla en `public` la expone automáticamente mediante Data API. Grants y RLS son capas distintas y ambas deben configurarse.

Si se crea una vista pública:

- preferir `security_invoker = true`;
- excluir datos operativos y errores internos;
- revisar permisos y RLS;
- documentar su contrato.

No crear funciones `SECURITY DEFINER` salvo justificación explícita y revisión de QA.

## 10. Índices y restricciones

Agregar índices respaldados por los accesos previstos:

- unicidad de fuente;
- unicidad de evento por fuente;
- funciones por evento y fecha;
- eventos por estado y próxima función;
- ejecuciones por fuente y fecha;
- errores por ejecución.

QA debe revisar claves únicas, comportamiento con `NULL`, foreign keys, índices redundantes, cascadas y constraints de estados y moneda.

## 11. Capa de persistencia TypeScript

Crear una interfaz independiente del proveedor concreto, conceptualmente:

```ts
interface EventPersistence {
  startRun(input: StartRunInput): Promise<ScrapeRun>;
  persistEvent(runId: string, event: NormalizedEvent): Promise<void>;
  recordError(runId: string, error: ScrapeError): Promise<void>;
  finishRun(runId: string, result: FinishRunInput): Promise<void>;
}
```

El nombre definitivo debe respetar las convenciones del repositorio.

Requisitos:

- dependencias inyectables;
- errores tipados;
- consultas parametrizadas;
- transacciones donde correspondan;
- reintentos limitados solo para errores transitorios;
- ninguna credencial incluida en logs;
- tests unitarios sin red;
- cliente Supabase/Postgres encapsulado;
- versiones de paquetes fijadas y lockfile actualizado.

## 12. Integración con la CLI

Mantener el comportamiento actual por defecto. Proponer una opción explícita como:

```bash
npm run puntoticket:scrape -- --live ... --persist
```

Requisitos:

- sin `--persist`, conservar salida JSON y no requerir credenciales;
- con `--persist`, validar configuración antes de adquirir datos;
- errores de configuración por `stderr`;
- código de salida distinto de cero ante falla total;
- una falla individual no descarta eventos exitosos;
- la corrida queda `partial` cuando hay éxitos y errores;
- no imprimir secretos;
- permitir identificar el `run_id`.

## 13. Variables de entorno

Documentar en `.env.example` únicamente nombres y valores ficticios:

```dotenv
SUPABASE_URL=
SUPABASE_SECRET_KEY=
```

El agente debe verificar los nombres vigentes para el método elegido.

Reglas:

- no versionar `.env`;
- no imprimir valores;
- no usar claves públicas para escrituras privilegiadas;
- no exponer secretos al navegador;
- fallar temprano si falta configuración obligatoria.

## 14. Migraciones

Antes de usar comandos:

```bash
supabase --version
supabase --help
supabase migration --help
```

Crear migraciones mediante:

```bash
supabase migration new <nombre-descriptivo>
```

No inventar manualmente el formato del nombre del archivo.

La migración debe incluir tablas, constraints, foreign keys, índices, RLS, políticas, grants y revokes explícitos.

No usar gestión declarativa experimental basada en `pg-delta` durante esta etapa.

## 15. Estrategia de pruebas

### Pruebas unitarias

Cubrir:

- mapeo del contrato normalizado;
- reglas de actualización;
- tratamiento de `unknown`;
- validación previa;
- errores tipados;
- comportamiento sin configuración.

### Pruebas de integración

Ejecutar contra Supabase local o PostgreSQL efímero controlado y cubrir:

1. primera inserción;
2. repetición idéntica;
3. actualización de precio;
4. actualización de disponibilidad;
5. nueva función para evento existente;
6. múltiples funciones;
7. función sin `purchase_url`;
8. función sin `performance_code`;
9. rechazo de duplicados;
10. rollback ante falla;
11. ejecución exitosa;
12. ejecución parcial;
13. ejecución fallida;
14. error sanitizado;
15. lectura pública permitida;
16. escritura pública rechazada;
17. integridad de foreign keys;
18. dos upserts equivalentes concurrentes.

### Regresión

Todas las pruebas de adquisición, extracción y normalización existentes deben continuar pasando sin iniciar Supabase.

## 16. Validación manual mínima

En un entorno no productivo:

1. ejecutar el scraper con persistencia para pocos eventos;
2. consultar eventos y funciones guardadas;
3. repetir exactamente la ejecución;
4. confirmar que no aumenten artificialmente los registros;
5. comprobar `last_seen_at`;
6. comprobar corrida y contadores;
7. verificar que `anon` no pueda escribir;
8. comprobar que no existan secretos en salidas ni errores.

## 17. Comandos de calidad

Ejecutar, como mínimo:

```bash
npm test
npm run typecheck
npm run lint
git diff --check
TZ=America/Santiago npm test
```

También ejecutar tests de integración, revisar migraciones y usar los advisors de seguridad y rendimiento disponibles.

## 18. Criterios de aceptación

- Existe una migración reproducible.
- El esquema representa eventos, funciones, corridas y errores.
- La persistencia es idempotente y segura ante concurrencia.
- No se duplican eventos ni funciones.
- Los datos parciales no destruyen información válida.
- `source_url` y `purchase_url` permanecen separados.
- `unknown` se conserva sin inferencias inseguras.
- Las fechas mantienen instante y timezone.
- RLS está habilitado.
- Grants y políticas son explícitos.
- La lectura pública autorizada funciona.
- La escritura pública falla.
- Las credenciales privilegiadas solo se usan en servidor/CLI.
- La CLI funciona con y sin persistencia.
- Las pruebas anteriores y nuevas pasan.
- No se accede a producción durante desarrollo o QA.
- La documentación explica instalación, migración, ejecución y rollback.
- QA emite `VEREDICTO QA: APROBADO`.

## 19. Entregables

- migraciones en `supabase/migrations/`;
- configuración local de Supabase;
- interfaz y adaptador de persistencia;
- integración con CLI/orquestador;
- pruebas unitarias y de integración;
- actualización de `.env.example`;
- scripts necesarios en `package.json`;
- documentación de operación;
- decisión técnica sobre idempotencia y estados;
- reporte QA.

## 20. Flujo de agentes

### Paso 1: `designer`

Trabaja en modo lectura y entrega:

- propuesta de esquema;
- restricciones e índices;
- estrategia de upsert;
- política de estados;
- límites transaccionales;
- modelo de permisos;
- decisiones pendientes para TL/PO;
- riesgos y alternativas.

No modifica archivos.

### Paso 2: aprobación TL/PO

El TL/PO aprueba expresamente esquema, identidades naturales, actualización de datos parciales, tratamiento de estados, exposición pública y estrategia de persistencia.

### Paso 3: `dev`

Después de la aprobación:

- implementa migraciones y adaptador;
- integra la CLI;
- crea pruebas;
- actualiza documentación;
- ejecuta validaciones;
- entrega resumen de archivos y comandos.

### Paso 4: `qa`

Revisa independientemente:

- cumplimiento funcional;
- idempotencia y concurrencia;
- SQL y migraciones;
- RLS y permisos;
- ausencia de secretos;
- regresiones;
- rendimiento básico;
- CLI y documentación;
- comandos obligatorios.

QA debe probar casos adversos y no aprobar basándose únicamente en los tests agregados por `dev`.

## 21. Prompt inicial para el orquestador

```text
Lee AGENTS.md, docs/equipo-agentes.md, docs/brief-ejecucion.md,
docs/modelo-datos.md y este brief completo.

Estamos iniciando la etapa de persistencia del scraper PuntoTicket en Supabase.
Trabaja en la branch feat/puntoticket-supabase-persistence basada en main.

Ejecuta primero al agente designer en modo estrictamente lector. Debe revisar
los contratos y el código actual, proponer el esquema, las restricciones de
idempotencia, las reglas de actualización, la estrategia transaccional y el
modelo RLS/grants. No debe modificar archivos.

Detén el flujo después de designer y presenta al TL/PO todas las decisiones que
requieran aprobación. No ejecutes dev hasta recibir aprobación explícita.

Después de la aprobación, ejecuta dev y finalmente qa según el flujo definido.
No uses producción, no expongas secretos y no cierres la tarea sin:

VEREDICTO QA: APROBADO
```

## 22. Consideraciones actuales de Supabase

Antes de implementar, revisar documentación y changelog vigentes.

- Las tablas nuevas pueden no quedar expuestas automáticamente mediante Data API.
- Los `GRANT` y RLS son capas distintas y ambas deben configurarse.
- No asumir que `pg_graphql` está habilitado.
- `pg-delta` continúa experimental y queda fuera de esta etapa.
- Descubrir los comandos mediante `--help` en vez de asumir una versión de Supabase CLI.
