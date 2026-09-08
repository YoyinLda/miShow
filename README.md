# miShow

miShow es una plataforma para centralizar conciertos y eventos musicales publicados por distintas ticketeras y fuentes, facilitando su búsqueda y descubrimiento desde una experiencia mobile-first.

Este repositorio contiene el contexto inicial del producto y parsers ejecutables de PuntoTicket. La implementación actual es fixture-first; todavía no es un scraper autónomo ni una aplicación completa.

## Estado

Proyecto en etapa de definición y construcción inicial.

## Objetivo inicial

- Reunir eventos musicales desde múltiples fuentes.
- Normalizar artistas, recintos, fechas, precios y enlaces de compra.
- Permitir búsqueda y exploración simple de eventos.
- Mantener trazabilidad sobre la fuente original.
- Preparar una arquitectura que pueda crecer sin sobredimensionar el MVP.

## Arquitectura propuesta

- Frontend: Next.js, React y Tailwind CSS, con enfoque mobile-first.
- Hosting frontend: Amazon S3 y CloudFront.
- API pública: AWS Lambda y API Gateway.
- Orquestación privada: AWS Lambda.
- Scrapers: Playwright o Puppeteer ejecutados en ECS Fargate Tasks.
- Base de datos: Amazon RDS PostgreSQL.
- Procesamiento asíncrono: Amazon SQS.
- Programación de procesos: Amazon EventBridge.
- Correos: Amazon SES.
- Observabilidad: logs estructurados y trazabilidad W3C Trace Context.

La arquitectura AWS anterior es una propuesta histórica/alternativa futura, no infraestructura implementada. Consulta [docs/brief-ejecucion.md](docs/brief-ejecucion.md) para la estrategia por etapas y [docs/arquitectura.md](docs/arquitectura.md) para el contexto.

## Base fixture-first de PuntoTicket

La base técnica del scraper está en `src/puntoticket`. Es deliberadamente pura:
recibe HTML, extrae referencias o detalles, y normaliza sin red, Playwright ni
persistencia. Las URLs `source_url` y `purchase_url` se conservan separadas; el
segundo enlace solo se identifica y nunca se sigue.

Requisitos: Node.js >=20.18.1. Este mínimo coincide con la dependencia efectiva
`cheerio@1.2.0` declarada en `package-lock.json`.

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run lint
npm run qa
npm --silent run puntoticket:listing -- <ruta-html> [base-url]
npm --silent run puntoticket:detail -- <ruta-html> <source-url> <extracted-at>
```

`npm run dev` ejecuta Vitest en modo observación sobre los fixtures. Las CLI
ejecutables leen HTML local, escriben únicamente JSON válido en stdout y envían
errores a stderr; por eso se documentan con `npm --silent run`. Listing devuelve
`{ count, references, errors }`. Detail requiere siempre
`<extracted-at>` como timestamp ISO-8601 con zona horaria. Ninguna CLI realiza
adquisición HTTP programada.

Los fixtures sintéticos de `tests/puntoticket.test.ts` cubren rutas de evento
relativas y absolutas, landings respaldadas por tarjetas estructurales,
deduplicación, funciones múltiples, estados, cola de compra, JSON-LD inválido
y zona horaria `America/Santiago`, incluyendo identificadores por performance,
fechas calendario inválidas, ruta raíz, tipos JSON-LD `Event` completos,
metadatos HTTPS/coordenadas y precios límite. Los
enlaces de compra solo se conservan si son HTTPS del host exacto
`www.puntoticket.com` y usan rutas permitidas
`/queue/enqueue/<codigo>` o `/comprar/evento/<codigo>/cal/<calendario>`.
Nunca se siguen durante adquisición. La extracción reporta JSON-LD inválido y
funciones rechazadas por fecha en `ExtractionResult.errors` sin perder el HTML
crudo.

Las funciones se identifican por su fecha y hora normalizadas. Los bloques
comerciales sin fecha se asocian únicamente cuando existe una sola función
conocida; si la asociación no es segura, se reporta
`ambiguous performance purchase mapping`, el evento puede quedar globalmente
`available` y la función permanece `unknown` sin `purchase_url`. Las fechas
mencionadas en textos legales de venta no se interpretan como fechas de
función. `extracted_at` debe ser un timestamp ISO-8601 con zona horaria.

Consulta [docs/ejecucion-fixture-first-puntoticket.md](docs/ejecucion-fixture-first-puntoticket.md)
para la instalación normal y limpia, el alcance detallado de las pruebas,
troubleshooting y el handoff para QA.

No existe todavía persistencia, Supabase, API ni frontend. Tampoco hay base de
datos ni adquisición HTTP programada. `.local/` y los fixtures reales locales
no se versionan.

## Uso con Codex

1. Descomprime este archivo.
2. Crea un repositorio vacío en GitHub.
3. Sube el contenido de esta carpeta a la raíz del repositorio.
4. Clona o abre el repositorio en VS Code.
5. Abre Codex y solicita:

```text
Lee AGENTS.md y todos los archivos de docs/. Resume tu comprensión del proyecto y enumera las decisiones pendientes. No escribas código todavía.
```

## Próximos pasos sugeridos

1. Integrar el parser fixture-first con una adquisición HTTP programada y
   controlada, después de definir límites y condiciones de la fuente.
2. Persistir resultados normalizados con idempotencia.
3. Exponer una API y construir el frontend cuando exista ese flujo de datos.

## Nombre y marca

El nombre provisional es **miShow**. La identidad visual explorada utiliza un sombrero de copa con ojos, inspirada de manera no pública en una referencia cultural. Antes de publicar o escalar la marca se debe validar disponibilidad del nombre, dominio y posibles conflictos de propiedad intelectual.
