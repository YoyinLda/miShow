# Mapa de herramientas

| Intención | Herramienta | Parámetros recomendados |
| --- | --- | --- |
| Resolver proyecto | `list_projects` | Ejecutar una vez por sesión |
| Indexar miShow | `index_repository` | `repo_path=<root absoluto>`, `mode="fast"` |
| Buscar símbolo | `search_graph` | `name_pattern`, opcional `label` y `path_filter` |
| Callers | `trace_path` | `direction="inbound"` |
| Callees | `trace_path` | `direction="outbound"` |
| Flujo acotado | `trace_path` | `direction="both"`, `depth=3` |
| Leer símbolo | `get_code_snippet` | `qualified_name` obtenido del grafo |
| Arquitectura | `get_architecture` | Solo los `aspects` necesarios |
| Impacto del diff | `detect_changes` | `scope="impact"` |
| Texto con ranking | `search_code` | `pattern` y `path_filter` |
| Verificar índice | `check_index_coverage` | Solo paths citados o modificados |

## Presupuesto orientativo

Para una investigación normal:

1. una llamada de descubrimiento del proyecto, si aún no se hizo;
2. una búsqueda de símbolos;
3. un trazado o snippet;
4. verificación de cobertura antes de una conclusión material.

Superar este patrón es válido cuando la complejidad lo justifica, pero no debe convertirse en un barrido automático.

## Índice incompleto

Cuando exista cobertura parcial:

- identificar los paths faltantes;
- usar `rg` únicamente sobre esos paths;
- evitar reindexar si una lectura puntual resuelve la duda;
- reindexar cuando el índice esté desactualizado de manera material o el usuario lo solicite.

