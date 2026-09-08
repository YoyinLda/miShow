# miShow

miShow es una plataforma para centralizar conciertos y eventos musicales publicados por distintas ticketeras y fuentes, facilitando su búsqueda y descubrimiento desde una experiencia mobile-first.

Este repositorio contiene el contexto inicial del producto y las decisiones técnicas acordadas. Aún no incluye una aplicación ejecutable: su propósito es servir como base documental para comenzar el desarrollo asistido con Codex en VS Code.

## Estado

Proyecto en etapa de definición y construcción inicial.

## Objetivo inicial

- Reunir eventos musicales desde múltiples fuentes.
- Normalizar artistas, recintos, fechas, precios y enlaces de compra.
- Permitir búsqueda y exploración simple de eventos.
- Mantener trazabilidad sobre la fuente original.
- Preparar una arquitectura que pueda crecer sin sobredimensionar el MVP.

## Arquitectura definida

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

Consulta [docs/brief-ejecucion.md](docs/brief-ejecucion.md) para la estrategia por etapas, [docs/equipo-agentes.md](docs/equipo-agentes.md) para el flujo TL/PO–Diseño–Dev–QA y [docs/arquitectura.md](docs/arquitectura.md) para la arquitectura objetivo.

## Base fixture-first de PuntoTicket

La base técnica del scraper está en `src/puntoticket`. Es deliberadamente pura:
recibe HTML, extrae referencias o detalles, y normaliza sin red, Playwright ni
persistencia. Las URLs `source_url` y `purchase_url` se conservan separadas; el
segundo enlace solo se identifica y nunca se sigue.

Requisitos: Node.js >=20.18.1. Este mínimo coincide con la dependencia efectiva
`cheerio@1.2.0` declarada en `package-lock.json`.

```bash
npm install
npm test
npm run typecheck
npm run lint
```

Los fixtures sintéticos de `tests/puntoticket.test.ts` cubren rutas de evento
relativas y absolutas, landings respaldadas por tarjetas estructurales,
deduplicación, funciones múltiples, estados, cola de compra, JSON-LD inválido
y zona horaria `America/Santiago`, incluyendo identificadores por performance,
fechas calendario inválidas, ruta raíz y tipos JSON-LD `Event` completos. Los
enlaces de compra solo se conservan si son `http`/`https` del origen permitido
de PuntoTicket. La extracción reporta JSON-LD inválido y funciones rechazadas
por fecha en `ExtractionResult.errors` sin perder el HTML crudo.

Consulta [docs/ejecucion-fixture-first-puntoticket.md](docs/ejecucion-fixture-first-puntoticket.md)
para la instalación normal y limpia, el alcance detallado de las pruebas,
troubleshooting y el handoff para QA.

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

1. Definir el alcance exacto del MVP.
2. Elegir las primeras fuentes o ticketeras.
3. Definir el modelo de datos inicial.
4. Crear el monorepo o separar frontend, backend y scrapers.
5. Implementar una fuente de punta a punta antes de generalizar.

## Nombre y marca

El nombre provisional es **miShow**. La identidad visual explorada utiliza un sombrero de copa con ojos, inspirada de manera no pública en una referencia cultural. Antes de publicar o escalar la marca se debe validar disponibilidad del nombre, dominio y posibles conflictos de propiedad intelectual.
