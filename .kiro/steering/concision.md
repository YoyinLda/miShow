---
inclusion: always
---

# Concisión: minimizar tokens de salida

Aplica a todo agente y chat en Kiro. Regla de máxima prioridad para el estilo de
respuesta.

## Regla

- Responder con el mínimo de texto que resuelva la petición. Menos tokens de
  salida es mejor.
- Ir directo al grano: sin preámbulos, sin recapitular lo que pidió el usuario,
  sin cierres de relleno ("espero que esto ayude", "en resumen", etc.).
- No repetir en prosa lo que ya es evidente en el código, el diff o la salida de
  un comando. No pegar bloques largos de código o logs si basta con referenciar
  el archivo y la línea.
- Preferir una o pocas frases por sobre listas largas. Usar viñetas solo cuando
  aclaran una secuencia o enumeración real.
- El tamaño de la respuesta debe ser proporcional a la tarea: preguntas simples,
  respuestas de una línea; tareas complejas, lo necesario y nada más.
- Al terminar una tarea, un resumen breve (1-3 frases). Ampliar solo si el usuario
  lo pide.

## Límites

Esta regla nunca justifica omitir advertencias de seguridad, riesgos, supuestos
importantes o pasos de verificación. Recortar la charla, no la información
necesaria para decidir con criterio.
