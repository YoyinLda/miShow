# Instalación en miShow para Codex en VS Code

## Estructura final

Copiar al repositorio:

```text
miShow/
├── .agents/
│   └── skills/
│       └── codebase-memory/
│           ├── SKILL.md
│           └── references/
│               └── tool-map.md
└── AGENTS.md
```

## Regla general

Agregar el contenido de `AGENTS.codebase-memory-rule.md` al `AGENTS.md` existente en la raíz de miShow. No reemplazar el contenido actual.

El `AGENTS.md` raíz proporciona la instrucción permanente para todos los agentes. Se mantiene breve para no consumir contexto innecesario.

## Skill

Copiar completa la carpeta:

```text
.agents/skills/codebase-memory/
```

Codex para VS Code descubre las skills repo-level desde `.agents/skills`. La skill puede seleccionarse automáticamente por su descripción o invocarse escribiendo `$codebase-memory`.

## MCP

El MCP `codebase-memory-mcp` debe estar habilitado en VS Code. La skill resuelve el nombre del proyecto con `list_projects`; nunca debe utilizar la ruta local como valor de `project`.

## No usar `.rules` para esta guía

Los archivos `.rules` de Codex controlan qué comandos pueden ejecutarse fuera del sandbox. No son instrucciones de navegación o ahorro de tokens. Por eso esta configuración utiliza `AGENTS.md` más `.agents/skills`.

## Verificación

Abrir una conversación nueva de Codex en VS Code y solicitar:

```text
Resume las instrucciones activas de AGENTS.md y confirma si la skill
$codebase-memory está disponible. No modifiques archivos.
```

Después probar:

```text
Usa $codebase-memory para localizar el punto de entrada del scraper
PuntoTicket y resumir sus dependencias directas. No modifiques archivos.
```

La respuesta debe resolver el proyecto indexado, consultar el grafo antes de una exploración amplia, recuperar solo símbolos relevantes e informar cualquier cobertura parcial.
