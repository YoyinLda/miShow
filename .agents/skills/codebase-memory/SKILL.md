---
name: codebase-memory
description: Navegar y analizar código de miShow mediante el MCP Codebase Memory en Codex para VS Code. Usar para localizar símbolos, seguir callers/callees, comprender flujos y arquitectura, evaluar impacto de cambios o revisar código indexado. No usar como primera opción para texto literal, documentación, configuración, SQL, fixtures o lockfiles.
---

# Codebase Memory para Codex en VS Code

Usar el knowledge graph de `codebase-memory-mcp` para reducir lecturas completas del repositorio y evitar ciclos repetidos de búsqueda.

## Inicio de sesión

1. Ejecutar `list_projects` una sola vez por sesión o cuando cambie el workspace.
2. Elegir el proyecto que corresponda al root Git de miShow.
3. Pasar siempre `project=<nombre indexado>`; no pasar rutas locales como proyecto.
4. Si miShow no está indexado, ejecutar una sola vez:

   `index_repository(repo_path=<root absoluto>, mode="fast")`

5. Usar `mode="full"` únicamente si la tarea exige mayor cobertura y el índice rápido resulta insuficiente.

## Flujo graph-first

Elegir la consulta mínima que responda la pregunta:

- símbolo desconocido: `search_graph`;
- quién llama al símbolo: `trace_path(direction="inbound")`;
- qué invoca el símbolo: `trace_path(direction="outbound")`;
- flujo completo: `trace_path(direction="both", depth=3)`;
- implementación exacta: `get_code_snippet`;
- arquitectura o rutas: `get_architecture`;
- impacto del diff: `detect_changes(scope="impact")`;
- búsqueda textual con ranking estructural: `search_code`.

No ejecutar todas las herramientas por defecto. Comenzar con una consulta enfocada y ampliar solo cuando el resultado no sea suficiente.

## Disciplina de contexto

1. Formular búsquedas con nombres, labels y `path_filter` concretos.
2. Preferir una bolsa pequeña de símbolos relacionados antes que un inventario general del repositorio.
3. Tratar `get_code_snippet` como lectura suficiente de ese símbolo.
4. No abrir después el archivo completo salvo que falten imports, tipos, constantes o contexto necesario.
5. Revisar `has_more` y `nextCursor`; paginar solo si los resultados restantes son necesarios.
6. Resumir relaciones; no copiar respuestas extensas del grafo al informe final.
7. Evitar delegar exploraciones paralelas del mismo código cuando una consulta al grafo pueda resolverlas.

## Cobertura y verificación

Antes de afirmar arquitectura, impacto o ausencia de uso:

1. ejecutar `check_index_coverage(paths=[...])` sobre los archivos relevantes;
2. observar `coverage_note`, resultados parciales y símbolos no indexados;
3. completar únicamente los huecos con `rg` y lectura directa;
4. verificar el código fuente actual antes de editar;
5. después de cambios estructurales, usar `detect_changes(scope="impact")` cuando aporte valor.

El grafo es una ayuda de navegación y no reemplaza pruebas, typecheck, lint ni revisión del diff.

## Excepciones

Usar directamente `rg`, `rg --files` o lectura puntual para:

- literales y mensajes de error;
- comentarios y documentación;
- JSON, YAML, TOML y variables de entorno;
- SQL y migraciones;
- fixtures y snapshots;
- lockfiles;
- archivos conocidos cuando solo se requieren pocas líneas;
- paths que el control de cobertura marque como incompletos.

Si el MCP falla o no está disponible en la sesión de VS Code, informar brevemente y continuar con herramientas locales. No reindexar repetidamente ni bloquear la tarea.

## Referencia

Leer [references/tool-map.md](references/tool-map.md) solo si se necesitan parámetros o criterios detallados para elegir una operación.

