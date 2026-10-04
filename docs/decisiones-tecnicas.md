# Decisiones técnicas

## Decisiones confirmadas

| Área | Decisión | Motivo general |
|---|---|---|
| Experiencia | Mobile-first | El descubrimiento y compra de entradas ocurre frecuentemente desde teléfonos. |
| Frontend | Next.js, React y Tailwind CSS | Stack conocido, productivo y con buen ecosistema. |
| Nube | AWS | Permite integrar cómputo, colas, base de datos, distribución y observabilidad. |
| API | API Gateway y Lambda | Adecuado para un inicio con tráfico variable y bajo costo fijo. |
| Scraping | ECS Fargate Tasks | Aísla navegadores y permite trabajos con más duración y recursos que una Lambda. |
| Base de datos | RDS PostgreSQL | Modelo relacional apropiado para eventos, artistas, funciones, recintos y fuentes. |
| Mensajería | SQS | Desacopla ingesta y procesamiento, y facilita reintentos. |
| Programación | EventBridge | Permite planificar actualizaciones por fuente. |
| Correo | SES | Integración directa con AWS para notificaciones futuras. |
| Trazabilidad | W3C Trace Context | Mantiene correlación estándar entre servicios. |

## Decisiones abiertas

| Tema | Alternativas iniciales | Criterio para decidir |
|---|---|---|
| Scraper | Playwright / Puppeteer | Compatibilidad con fuentes, estabilidad, imagen de contenedor y experiencia de desarrollo. |
| Infraestructura como código | CDK / Terraform / otro | Experiencia, mantenibilidad y automatización. |
| Autenticación | Sin login en MVP / Cognito / proveedor externo | Casos reales que requieran favoritos, alertas o administración. |
| Búsqueda | PostgreSQL / motor especializado | Volumen, relevancia, filtros y costo operacional. |
| Fuente inicial | Por definir | Cobertura, estabilidad técnica y valor para usuarios en Chile. |

## Registro de nuevas decisiones

Cuando se cierre una decisión relevante, documentarla con:

- Fecha.
- Estado: propuesta, aceptada, reemplazada o descartada.
- Contexto y restricciones.
- Alternativas consideradas.
- Consecuencias y compromisos.

### 2026-09-13 — Organización del código: monorepo con npm workspaces

- **Estado:** aceptada.
- **Contexto:** una sola persona, contratos compartidos entre scraper, dominio,
  persistencia y frontend; se busca no pagar el costo de reorganizar más adelante.
- **Alternativas:** repositorios separados desde el inicio.
- **Consecuencias:** fronteras por paquete (`@mishow/*`) e importación por nombre;
  cada workspace puede extraerse a su propio repo sin reescrituras. Ver
  `docs/brief-etapa1-estructura-frontend.md`.

### 2026-09-13 — Renderizado frontend: estático (SSG), preparado para híbrido

- **Estado:** aceptada.
- **Contexto:** arranque a costo cero sin servidor permanente; el acceso a datos
  está aislado en `@mishow/catalog-client`.
- **Alternativas:** SSR/ISR desde el inicio.
- **Consecuencias:** `apps/web` exporta estático (`output: "export"`). La ruta de
  migración a híbrido está documentada en `apps/web/next.config.mjs` y no requiere
  cambiar la UI ni la capa de datos.

### 2026-09-13 — Hosting frontend: Cloudflare Pages

- **Estado:** aceptada.
- **Contexto:** publicar el export estático a costo cero (plan gratuito, 500
  builds/mes). El DNS podría gestionarse en GoDaddy.
- **Alternativas:** hosting estático en S3/CloudFront (arquitectura AWS futura).
- **Consecuencias:** despliegue por workflow al hacer push a `main`; solo la clave
  publishable llega al navegador. Ver `docs/despliegue-cloudflare-pages.md`.

### 2026-09-13 — Scraping programado: cron 2x/día en GitHub Actions

- **Estado:** aceptada.
- **Contexto:** validar frescura del catálogo dentro de la cuota gratuita de
  Actions; una sola fuente (PuntoTicket) y volumen bajo.
- **Alternativas:** frecuencia mayor, o ECS Fargate + EventBridge (etapa futura).
- **Consecuencias:** 2 corridas/día (12:00 y 22:00 UTC), `--max-events 2`,
  persistencia idempotente y fallos visibles en Actions. Ver
  `docs/operacion-scraping-cron.md`.


### 2026-09-13 — Presentación en la web: estado por defecto "Confirmado" y enlace único a la ticketera

- **Estado:** aceptada.
- **Contexto:** tras el e2e detectamos que la UI restaba confianza al mostrar
  "Por confirmar" cuando faltaba evidencia, y que el enlace al evento solo
  aparecía si existía un `purchase_url` de venta. miShow no es la fuente de
  verdad de la disponibilidad: es un puente entre la persona y las ticketeras.
- **Alcance:** cambios solo de presentación en `apps/web`. No se tocan el
  contrato (`@mishow/domain`, `@mishow/catalog-client`), la base de datos ni el
  scraper: el estado `unknown` se sigue persistiendo igual; solo cambia cómo se
  interpreta al mostrarlo.
- **Decisiones:**
  - **Estado a nivel evento:** por defecto se asume **Confirmado**. `statusLabel`
    mapea `unknown → "Confirmado"`; `available`, `sold_out` y `upcoming`
    conservan sus etiquetas ("Disponible", "Agotado", "Próximamente").
  - **Estado a nivel función:** cuando no hay información de disponibilidad
    (`unknown`) se omite la etiqueta y se muestra solo la fecha/hora, vía el
    nuevo helper `performanceStatusLabel` (devuelve `undefined` para `unknown`).
  - **Enlace a la ticketera:** siempre se ofrece un enlace hacia `source_url`
    (la URL del evento en la ticketera) con el texto genérico "Ir a la ticketera",
    tanto en la card del listado (`EventCard`) como en el detalle (`EventDetail`).
    Se eliminó el flujo de compra dentro de miShow (botón "Comprar" por función y
    el enlace condicionado a `purchase_url`): la compra se completa en la
    ticketera.
- **Alternativas:** introducir estados nuevos en el contrato (`confirmed`,
  `cancelled`) y persistirlos; descartada por ahora para evitar tocar dominio,
  DB y scraper. La detección explícita de eventos cancelados queda fuera de
  alcance.
- **Consecuencias:** presentación más honesta y accionable. `EventCard` pasó de
  ser un `<a>` a un `<article>` con enlace-overlay al detalle, para permitir el
  CTA externo sin anidar enlaces. Ver `apps/web/lib/format.ts`,
  `apps/web/components/EventCard.tsx` y `apps/web/components/EventDetail.tsx`.

### 2026-10-04 — Entorno de desarrollo Windows y runtime Node 24 en CI

- **Estado:** aceptada (registrada retroactivamente, ver
  `docs/briefs/004-migracion-entorno-windows.md`).
- **Contexto:** el desarrollo pasa a Windows + PowerShell. CI fijaba Node 20.18.1,
  bajo el mínimo de `vite@7` / `eslint-visitor-keys@5` (>=20.19), y las actions v4
  usan Node 20, deprecado en GitHub Actions.
- **Alternativas:** Node 20.19.x en CI; actions v7; `shell: true` o `cross-spawn`
  para los tests de CLI.
- **Consecuencias:** CI y local usan Node 24.21.0 con `actions/checkout@v5` y
  `actions/setup-node@v5`. Los tests que invocan npm usan el helper portable
  `runNpm` (Windows, macOS, Linux). La configuración MCP del asistente vive en la
  config de usuario, fuera del repo. Ver `docs/entorno-desarrollo-windows.md`.
