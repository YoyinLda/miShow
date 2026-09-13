# infra/ — Infraestructura como código (reservado)

Esta carpeta está **reservada** para la definición de infraestructura como código
(IaC) del proyecto. Hoy está intencionalmente vacía de implementación.

## Por qué existe ahora

El brief de Etapa 1 (`docs/brief-etapa1-estructura-frontend.md`) decide preparar
la estructura del monorepo para el despliegue futuro sin construirlo todavía.
Reservar `infra/` desde ahora evita renombrar carpetas o reorganizar cuando se
adopte una herramienta de IaC.

## Estado de la decisión

- **Herramienta de IaC:** abierta (CDK vs. Terraform vs. otra). No se implementa
  en Etapa 1.
- **Hosting del frontend:** diferido. El brief base contempla Cloudflare Pages
  para arranque a costo cero; podría usarse DNS propio (p. ej. GoDaddy).
- **Arquitectura objetivo AWS** (Lambda, RDS, Fargate, SQS, EventBridge, SES):
  descrita en `docs/arquitectura.md` como dirección futura (Etapa 3+), no como
  infraestructura actual.

## Qué se desplegará desde aquí (futuro)

| Unidad desplegable | Workspace | Destino previsto |
|---|---|---|
| Frontend | `apps/web` | Hosting estático/híbrido (Cloudflare Pages u otro) |
| Scraper programado | `scrapers/puntoticket` | Cron (GitHub Actions ahora → ECS Fargate después) |
| API pública (si se añade) | por definir | API Gateway + Lambda o Worker |

Cada workspace se construye de forma independiente, condición necesaria para
pipelines de despliegue separados.

## Cómo separar un workspace en su propio repositorio

Los paquetes usan el scope `@mishow/*` y declaran sus dependencias por nombre.
Para extraer un workspace a un repo aparte:

1. Copiar la carpeta del workspace.
2. Publicar (o versionar) los paquetes `@mishow/*` de los que depende.
3. Ajustar la instalación de dependencias en el nuevo repo.

No hay configuración global que esconda lógica de un solo proyecto, así que la
extracción no requiere reescrituras.
