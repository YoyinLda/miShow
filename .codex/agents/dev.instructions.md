---
applyTo: "supabase/**"
description: "Supabase-specific rules for migrations, RLS, and schema design"
---

# Supabase Development Rules

Aplica al trabajar en `supabase/` (migraciones, RLS, schemas, functions).

## Migraciones

- **Lectura primero:** inspecciona schema actual, enumeraciones, índices, políticas RLS existentes.
- **Versionado:** nombra con timestamp (ej: `20260909151251_descripcion.sql`). No edites migraciones anteriores.
- **Reversible:** incluye `DROP` correspondiente. Testa rollback.
- **Idempotencia:** usa `IF NOT EXISTS`, `IF EXISTS`. Tolera re-ejecución.
- **Sin cobros:** evita pg_vector, pg_graphql salvo aprobación. Mantén capa gratuita.

## RLS y Seguridad

- **Por defecto DENY:** inicia con `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`. Abre solo lo necesario.
- **Contexto seguro:** lee `auth.uid()`, verifica tenant/project si aplica.
- **Auditoría:** registra cambios sensibles con `auth.jwt()->'sub'` en logs.
- **Test explícito:** escribe tests en `supabase/tests/` verificando acceso denegado y permitido.

## Schema Design

- **Tipos portables:** evita extensiones propietarias. Usa `smallint`, `integer`, `text`, `timestamp with time zone`.
- **Zona horaria explícita:** timestamps con `with time zone`. Nunca `without time zone` o `date`.
- **Índices justificados:** solo para queries medidas, no preventivos. Justifica en comentario.
- **Foreign keys:** ON DELETE CASCADE si es seguro, else RESTRICT. Documenta.
- **Nombres:** snake_case, tablas plural (ej: `events`, `scraped_sources`).

## Procedimiento

1. Lee schema actual (migraciones previas, extensiones activas).
2. Diseña cambio: tabla nueva, alteración, índice, política.
3. Escribe migración con comentarios de intención.
4. Escribe test SQL verificando estructura y políticas.
5. Ejecuta: `supabase db reset && npm run tests` localmente.
6. Entrega: migración + test + resumen cambio + riesgos.

No despliegues directamente a producción. No uses credenciales productivas. Cambios pasan por dev → staging → producción con TL/PO.
