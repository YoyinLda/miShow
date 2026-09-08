# Instrucciones para agentes — miShow

## Contexto

miShow busca centralizar conciertos y eventos musicales publicados por múltiples ticketeras y fuentes. El producto debe privilegiar una experiencia rápida y clara en dispositivos móviles.

Antes de implementar una tarea, lee este archivo y la documentación relevante dentro de `docs/`.

## Stack acordado

- TypeScript como lenguaje principal.
- Next.js, React y Tailwind CSS para el frontend.
- AWS Lambda y API Gateway para la API pública.
- Lambda privada para orquestación.
- Playwright o Puppeteer en ECS Fargate Tasks para scraping.
- PostgreSQL en Amazon RDS.
- SQS y EventBridge para procesamiento asíncrono y programación.
- SES para correo.
- W3C Trace Context y logs JSON para observabilidad.

## Forma de trabajo

- Antes de editar, explica brevemente el alcance y los archivos involucrados.
- No conviertas una decisión pendiente en definitiva sin consultarla.
- Implementa cambios pequeños, comprobables y fáciles de revertir.
- Reutiliza tipos y contratos; evita duplicar modelos entre componentes.
- Agrega o actualiza pruebas cuando cambie el comportamiento.
- Ejecuta las pruebas, lint y validación de tipos disponibles antes de terminar.
- Resume los cambios y cualquier verificación que no haya podido ejecutarse.
- No agregues dependencias sin explicar su propósito.
- No incluyas secretos, tokens, credenciales ni datos personales en el repositorio.
- No ejecutes acciones contra producción.
- No hagas cambios de infraestructura destructivos sin autorización explícita.

## Equipo y delegación

- Rodrigo y el agente principal actúan como TL/PO y conservan la decisión final.
- Usa `designer` para especificaciones UX/UI; trabaja en lectura y no implementa.
- Usa `dev` para una historia aprobada; es el único agente que modifica código de producto.
- Usa `qa` para validación independiente; no implementa correcciones.
- Lee `docs/equipo-agentes.md` para contratos de historia, handoffs y prompts.
- Evita ediciones concurrentes sobre los mismos archivos.
- Detén el ciclo para aprobación TL/PO después del diseño y antes de implementar.

## Criterios del producto

- Diseño mobile-first.
- Accesibilidad y rendimiento como requisitos de base.
- Cada evento debe conservar su fuente y URL original.
- La ingesta debe ser idempotente y tolerar reintentos.
- Los scrapers deben respetar límites, bloqueos y condiciones de cada fuente.
- La normalización no debe destruir el dato original obtenido.
- Fechas y horas deben conservar zona horaria explícita.
- El sistema debe permitir detectar duplicados entre distintas fuentes.

## Arquitectura

- Evita acoplar el modelo de dominio a la estructura HTML de una ticketera.
- Separa extracción, normalización, persistencia y publicación.
- Usa colas para desacoplar procesos lentos o reintentables.
- Propaga `traceparent` y registra identificadores de correlación.
- Favorece infraestructura simple durante el MVP y justifica cualquier componente adicional.

## Definición de terminado

Una tarea se considera terminada cuando:

1. El comportamiento solicitado está implementado.
2. Las pruebas relevantes pasan o queda documentado por qué no pudieron ejecutarse.
3. No se incorporaron secretos ni configuraciones productivas.
4. La documentación afectada fue actualizada.
5. El cambio puede revisarse mediante un diff claro.
