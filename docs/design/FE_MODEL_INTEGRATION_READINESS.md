# Readiness de integración Frontend ↔ Modelo IA

> Propósito: cuando el modelo IA se entrene e integre, el frontend ya tiene construidas las features futuras en estados honestos deshabilitados. Este documento define qué campo/contrato espera el frontend para encender cada feature. No define backend/AI; define qué necesita el FE para consumirlo.

## Cómo leer esto

Cada bloque: **Feature futura → qué muestra hoy → qué campo/contrato espera → qué se enciende cuando llega.** Nombres de campos según lo que el FE lee en código.

---

## 1. Inferencia real vs contrato

- **Hoy:** `AnalysisTimelineView` ejecuta `runMultiplanarAnalysis({ allowContractFallback: false })` y bloquea la evaluación si el run no vuelve en modo real, mostrando un estado honesto.
- **Espera del backend/modelo:**
  - Por plano, modo real en `effectiveInferenceMode`, `inferenceMode`, `aiOutput.inferenceMode` o `metadata.inferenceMode`.
  - `requestedInferenceMode` se muestra como referencia, pero no habilita por sí solo.
  - `sagittal` y `axial` deben resolver a `real` o `real_baseline`; `contract`, `fallback`, `mock`, `mixed`, ausente o degradado bloquean.
  - Mediciones reales no placeholder.
  - Flags `humanReviewRequired` y `notClinicalDiagnosis`.
  - Para `sagittal_spider` final: `modelVersion=sagittal-spider-final-v1`, `artifactHash=cf11dcc0ad77a7c787e64a796a2fd7398ef906add461cef4b3d61f1a5238e944`, `allowContractFallback=false` y `aiOutput.realInferenceAvailable=true` si el campo existe.
- **Se enciende:** paso 2→3 del timeline, evaluación con mediciones reales y flujo de aprobación sobre datos reales.
- **Provenance:** la UI muestra metadata técnica segura (`inputId`, modo efectivo, versión/hash, slice, axis, spacing, transformación) sin paths internos y sin denominarlo validación clínica.

## 2. Coordenadas (AI-011)

- **Hoy:** `MriSliceViewer` deshabilita edición de landmarks si no hay `coordinateSpace`; muestra la limitación.
- **Espera:** `series.coordinateSpace` o `landmark.coordinateSpace` con el espacio real (`model_256` vs `original`) y el mapeo para convertir coordenadas.
- **Se enciende:** edición de landmarks sobre la imagen en el espacio correcto.

## 3. Máscaras por clase (AI-017 / FE-007)

- **Hoy:** la visibilidad por clase está deshabilitada porque sólo hay `overlay.png` combinado.
- **Espera:** assets de máscara por clase o estructura de máscaras etiquetadas por clase, además del `overlay.png` combinado.
- **Se enciende:** toggles reales de visibilidad por clase.

## 4. W/L DICOM y multi-corte (AI-009)

- **Hoy:** visor opera sobre `input.png`/`overlay.png` de un solo corte; W/L es aproximación brillo/contraste sobre PNG 8-bit.
- **Espera:** series DICOM reales, parámetros de windowing y navegación de cortes.
- **Se enciende:** W/L radiológico real y navegación de cortes.

## 5. Longitudinal por paciente

- **Hoy:** `PatientHistoryView` muestra timeline/trends/mediciones clave sólo con dato real; si no hay histórico, estado vacío honesto.
- **Espera:** endpoint de historial de paciente con múltiples estudios y métricas reales por fecha/versión.
- **Se enciende:** trends, tabla AI-vs-Revisor y timeline histórico.

## 6. Persistencia versionada de correcciones (BE-007 / BE-008 / FE-010)

- **Hoy:** mediciones editadas se envían a `/api/ai/runs/{multiplanarRunId}/review` usando `corrections` con `beforeValue`/`afterValue`; landmarks quedan como borrador local no persistido.
- **Espera:** persistencia versionada para mediciones y landmarks.
- **Se enciende:** persistencia real de landmarks, historial de versiones y reset contra valor versionado.

## 7. 3D volumétrico paciente-específico

- **Hoy:** `SpineReconstructionPreview` muestra atlas genérico rotable etiquetado como no paciente-específico.
- **Espera:** `threeD.enabled=true` y los inputs volumétricos: `sagittal_masks`, `axial_masks`, `spacing`, `slice_index_mapping`.
- **Se enciende:** reconstrucción 3D volumétrica real del paciente.

## 8. Conversación con el modelo

- **Hoy:** no existe; la revisión se hace por mediciones/notas.
- **Espera:** endpoint conversacional para discutir salidas.
- **Se enciende:** UI de feedback conversacional futura.

---

## Regla de oro

Encender cada feature sólo cuando el dato real exista. Nunca presentar contrato, mock, fallback o placeholder como real. El frontend consume assets sólo vía `/api/ai/assets/{runId}/{plane}/{assetName}` del Backend.
