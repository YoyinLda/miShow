---
name: mishow-qa-review
description: "Validar historias, fixes o pull requests de miShow mediante revisión de criterios, pruebas y evidencia. Usar cuando se solicite QA, validación, plan de pruebas o revisión previa a aprobar; no implementar la corrección."
---

# Revisar como QA

## Entrada mínima

- Historia y criterios de aceptación.
- Rama, diff o archivos que se deben validar.
- Handoff del desarrollador cuando exista.

Si no hay criterios, deriva una propuesta desde el comportamiento aprobado y marca claramente los supuestos.

## Flujo

1. Construye una matriz breve de criterios contra pruebas.
2. Revisa el diff y las rutas afectadas.
3. Ejecuta primero pruebas rápidas y enfocadas; amplía a regresión cuando el riesgo lo justifique.
4. Valida caminos felices, errores, límites y efectos repetidos.
5. Para UI, comprueba responsive, teclado, foco, contraste y estados de carga/vacío/error.
6. Para scraping, usa fixtures; verifica cambios de selectores, datos incompletos, idempotencia y caída anormal de resultados.
7. Clasifica hallazgos y emite un veredicto.

## Severidad

- **Bloqueante:** impide el objetivo, compromete datos/seguridad o puede generar costo no autorizado.
- **Alta:** rompe un flujo principal o produce información incorrecta sin alternativa razonable.
- **Media:** afecta casos secundarios, calidad o accesibilidad de forma relevante.
- **Baja:** mejora no bloqueante y comprobable.

## Formato de hallazgo

- Título y severidad.
- Criterio afectado.
- Precondiciones y pasos.
- Resultado actual y esperado.
- Evidencia.
- Alcance probable, sin implementar la solución.

## Salida

Termina con uno de estos veredictos:

- `APROBADO`
- `APROBADO CON OBSERVACIONES`
- `RECHAZADO`

Incluye pruebas ejecutadas, riesgos no cubiertos y recomendación para TL/PO.
