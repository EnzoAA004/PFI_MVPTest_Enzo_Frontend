# FE-P4 — Brief de ejecución para Codex (Case Review polish: alinear Measurements y Notas)

> Epic FE-POLISH. Leer antes: `FE-POLISH_EPIC.md`, `WEB_INTERFACE_GUIDELINES.md`. Usar tokens/componentes de `src/design/`. Es un ticket de **alineación/CSS**, no de lógica.

## 0. Objetivo
Corregir la alineación de la tabla de **Measurements** y del panel de **Notas** en Case Review, que hoy se ven desalineados/sin formato.

## 1. Estado actual (a corregir)
- **Measurements:** `MeasurementsPanel.tsx` usa `.measurement-head` / `.measurement-row` (grid de columnas: Measurement, Value, Unit, Conf., Source, Status, Outlier). Además, la tabla de resultados AI-vs-Reviewer de `StudyReviewView` (columnas Measurement / AI Initial / Reviewer / Delta / AI Confidence / Outlier) se ve con columnas desalineadas (header ↔ filas no coinciden; los `input` no alinean con su columna).
  - ⚠️ **Causa probable:** `.measurement-head, .measurement-row` está **definido dos veces** en `src/design/components.css` (~línea 622 y ~línea 976) con `grid-template-columns` potencialmente distintos → conflicto. Consolidar en una sola definición coherente.
- **Notas:** `notes-card` con `textarea` (placeholder "Add notes...") y botones `Save Draft` / `Approve & Complete` debajo (`.review-actions .decision-actions`). El textarea se ve sin formato y los botones desalineados.

## 2. Entregable
### 2.1 Tabla de Measurements
- **Header y filas comparten exactamente el mismo `grid-template-columns`** (header ↔ celdas ↔ inputs alineados). Consolidar las definiciones duplicadas en `components.css` en una sola.
- Los `input` de valor ocupan su columna sin desbordar; **valores numéricos con `tabular-nums`**.
- Confidence/Outlier con su semántica de color (tokens) y alineación consistente (centrado en su columna).
- Densidad cómoda; que no se corten columnas en el ancho del panel derecho. Si hay demasiadas columnas para el ancho, priorizar/ajustar (sin romper el contenido) — reportar si algo se reacomoda.

### 2.2 Panel de Notas
- `textarea` con formato del design system: ancho completo del panel, `min-height` razonable, borde/radio/spacing con **tokens** (consistente con los inputs/FormField).
- Botones **`Save Draft` / `Approve & Complete`** alineados prolijamente debajo (spacing consistente, alineación coherente —p. ej. a la derecha o full-width en móvil—), sin encimarse ni desalinearse.

## 3. Honestidad / alcance
- Solo alineación/estilo. **No** cambiar la lógica de mediciones/edición (FE-RD-004 se mantiene) ni el flujo de review.
- No tocar los generadores de reportes/HTML export.
- No inventar columnas/datos.

## 4. Criterios de aceptación
- [ ] `npm run build` OK (nº módulos) + `npm run lint` sin violaciones nuevas.
- [ ] Header y filas de Measurements perfectamente alineados (una sola definición de grid; sin duplicado en conflicto).
- [ ] Valores numéricos con `tabular-nums`; confidence/outlier alineados.
- [ ] Notas: textarea con formato de tokens; botones Save Draft / Approve alineados.
- [ ] Solo tokens; 0 hex nuevos; `!important` ausente o justificado.
- [ ] Flujo de review intacto (editar medición, Save Draft, Approve).
- [ ] Smoke test visual de Case Review (measurements + notas alineados).

## 5. Fuera de alcance
Traducción a español (P2), a11y baseline (deuda/ticket futuro). No tocar contratos ni backend.

## 6. Formato de devolución
```
### Revisión — FE-P4
Instalación usada:
Build: <salida + nº módulos>  ·  Lint:
Measurements: cómo se alineó; definición de grid consolidada (duplicado resuelto)
Notas: textarea con tokens; botones alineados
tabular-nums aplicado: sí
a11y: violaciones nuevas (0 esperado)
Smoke test visual:
Decisiones abiertas (para que decidamos):
Notas / deuda:
```
