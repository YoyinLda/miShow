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
