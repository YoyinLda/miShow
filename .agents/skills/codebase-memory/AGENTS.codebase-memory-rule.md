## Codebase Memory

- Antes de explorar ampliamente código fuente indexado, usar la skill `$codebase-memory` para localizar símbolos, seguir callers/callees, comprender flujos o estimar impacto.
- Preferir una consulta enfocada al grafo y snippets de símbolos sobre recorridos completos con `rg`, lecturas masivas o subagentes que inspeccionen los mismos archivos.
- Usar `rg` y lectura directa para búsquedas literales, documentación, configuración, SQL, migraciones, fixtures, lockfiles y huecos de cobertura del índice.
- Si Codebase Memory no está disponible o el repositorio no puede indexarse, continuar con herramientas locales sin bloquear la tarea.
- Verificar el código fuente actual, la cobertura del índice, las pruebas y el diff antes de formular conclusiones materiales.

