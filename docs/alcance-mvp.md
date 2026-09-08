# Alcance preliminar del MVP

Este alcance es una propuesta inicial y debe validarse antes de comenzar la implementación completa.

## Incluido

- Ingesta automática desde una primera fuente.
- Normalización básica de eventos, funciones, artistas y recintos.
- Persistencia en PostgreSQL.
- Listado de próximos eventos.
- Búsqueda básica por texto.
- Filtros por fecha y ubicación cuando existan datos confiables.
- Página de detalle con enlace a la fuente original para comprar.
- Diseño responsive con prioridad móvil.
- Registro de resultados, errores y última ejecución de la fuente.

## Fuera del primer incremento

- Venta o pago de entradas dentro de miShow.
- Recomendaciones personalizadas avanzadas.
- Aplicación móvil nativa.
- Panel completo para organizadores.
- Integraciones con todas las ticketeras desde el inicio.
- Motor de búsqueda externo sin evidencia de necesidad.
- Microservicios independientes para cada entidad.

## Primer flujo vertical sugerido

1. Elegir una fuente.
2. Extraer una muestra reproducible.
3. Normalizarla mediante contratos tipados.
4. Persistirla idempotentemente.
5. Exponerla mediante un endpoint.
6. Mostrar listado y detalle en el frontend.
7. Agregar métricas y manejo de fallas.

## Criterios de éxito iniciales

- La actualización automática funciona sin intervención cotidiana.
- Repetir una ingesta no duplica eventos.
- Cada evento conserva un enlace verificable a su fuente.
- Las fechas se presentan correctamente en horario de Chile.
- Un fallo del scraper queda visible y puede reintentarse.

