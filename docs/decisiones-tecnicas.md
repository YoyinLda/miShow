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
| Organización del código | Monorepo / repositorios separados | Tamaño del equipo, despliegues y reutilización de contratos. |
| Renderizado frontend | Estático / híbrido | SEO, actualización de contenido, costo y compatibilidad con S3. |
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

