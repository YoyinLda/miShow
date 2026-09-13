---
inclusion: always
---

# Análisis de código: Codebase Memory por defecto

Aplica a todo agente y chat en Kiro. Regla de máxima prioridad para el análisis
de código fuente indexado.

## Regla

- Antes de explorar ampliamente código fuente, usar Codebase Memory (el MCP
  `codebase-memory`, skill `codebase-memory`) para localizar símbolos, seguir
  callers/callees, comprender flujos y arquitectura, o estimar impacto de cambios.
- Preferir una consulta enfocada al grafo y snippets de símbolos por sobre
  recorridos completos con `grep`, lecturas masivas de archivos o subagentes que
  inspeccionen los mismos archivos.
- `get_code_snippet` cuenta como lectura suficiente de ese símbolo: no reabrir el
  archivo completo salvo que falten imports, tipos, constantes o contexto.

## Flujo graph-first

Elegir la consulta mínima que responda la pregunta:

- símbolo desconocido: `search_graph`;
- quién llama al símbolo: `trace_path(direction="inbound")`;
- qué invoca el símbolo: `trace_path(direction="outbound")`;
- flujo completo: `trace_path(direction="both")`;
- implementación exacta: `get_code_snippet`;
- arquitectura o rutas: `get_architecture`;
- impacto del diff: `detect_changes(scope="impact")`;
- búsqueda textual con ranking estructural: `search_code`.

Empezar con una consulta enfocada y ampliar solo si el resultado no basta. Al
inicio de sesión, `list_projects` una vez y pasar siempre `project=<indexado>`.
Si el repo no está indexado, `index_repository(mode="fast")` una sola vez.

## Excepciones (usar grep/lectura directa)

- literales, mensajes de error, comentarios y documentación;
- JSON, YAML, TOML, variables de entorno;
- SQL, migraciones, fixtures, snapshots, lockfiles;
- archivos conocidos donde solo se necesitan pocas líneas;
- paths marcados como incompletos por el control de cobertura.

## Degradación

Si Codebase Memory no está disponible en la sesión (por ejemplo, el MCP no está
configurado o falla) o el repositorio no puede indexarse: informarlo brevemente
y continuar con herramientas locales (`grep`, lectura directa) sin bloquear la
tarea ni reindexar en bucle.

## Verificación

El grafo es una ayuda de navegación, no reemplaza la verdad. Antes de afirmar
arquitectura, impacto o ausencia de uso: revisar cobertura
(`check_index_coverage`), completar huecos con lectura directa y verificar el
código fuente actual. Pruebas, typecheck, lint y revisión del diff siguen siendo
obligatorios antes de conclusiones materiales.
