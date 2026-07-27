# P9-C.1 — Frontera canónica para resultados multiplanares (frontend)

Commit base: `0b320fb31658d91aa08e50fc0d99a976147f09ec`.
Backend de referencia: Railway, `PFI_AI_SERVICE_MULTIPLANAR_CONTRACT_VERSION=v2`,
`schemaVersion=pfi.multiplanar-run.v2` confirmado en `POST /api/ai/multiplanar/run`.

## 1. Problema anterior

`MultiplanarRunResponse` y `MultiplanarPlaneRun` (`src/multiplanarRunTypes.ts`) eran
tipos híbridos que mezclaban en un mismo nivel:

- campos públicos actuales del contrato v2 (`effectiveInferenceMode`, `assets`,
  `landmarks`, `measurements`, ...);
- aliases legacy heredados de corridas v1 (`inferenceMode`, `modelVersion` suelto,
  `artifactHash` suelto);
- estructuras tomadas de `AiRunResponse` (pipeline single-plane), vía
  `Omit<AiRunResponse, "landmarks" | "measurements">`;
- bolsones sin tipar (`aiOutput`, `modelArtifact`, `metadata`) tipados como
  `Record<string, unknown>` abiertos.

`runMultiplanarAnalysis()` en `src/multiplanarApi.ts` hacía un `fetch(...).json()`
con cast directo (`as T`) a `MultiplanarRunResponse`, sin ninguna validación de
forma. Cualquier cambio de forma en el backend (incluida la migración a
`pfi.multiplanar-run.v2`) se propagaba sin control a toda la UI.

## 2. Frontera HTTP / canónica / UI

```
Backend (HTTP)  --unknown-->  Adapter  --CanonicalMultiplanarRun-->  (P9-C.1: adapter temporal)  --MultiplanarRunResponse (legacy)-->  UI
```

- **HTTP**: `multiplanarRequest<unknown>()` en `src/multiplanarApi.ts` ya no
  tipa la respuesta como `MultiplanarRunResponse`. Se recibe `unknown`.
- **Canónica**: `parseMultiplanarRunResponse(raw: unknown): CanonicalMultiplanarRun`
  (`src/adapters/multiplanarRunAdapter.ts`) es el único punto donde se interpreta
  el JSON crudo. Produce siempre la forma definida en
  `src/contracts/canonicalMultiplanarRun.ts`, sin aliases, sin `Record` genérico
  como estructura principal y sin inventar valores.
- **UI (P9-C.1, temporal)**: `canonicalRunToLegacyViewModel()` convierte el
  modelo canónico de vuelta a la forma legacy `MultiplanarRunResponse` /
  `MultiplanarPlaneRun` que consumen hoy `AnalysisTimelineView.tsx` e
  `inferenceReadiness.ts`. Toda la compatibilidad hacia atrás vive en esta única
  función; no se agregaron aliases nuevos en componentes.

`runMultiplanarAnalysis()` devuelve `CanonicalMultiplanarRun`. El único punto de
consumo actual (`AnalysisTimelineView.tsx`) llama explícitamente a
`canonicalRunToLegacyViewModel()` antes de pasar el resultado al resto del flujo
de cuatro pasos, que no fue modificado.

## 3. Tabla de aliases aceptados temporalmente (solo dentro del adapter)

| Alias de entrada (v1 / legacy) | Campo canónico |
| --- | --- |
| `plane.runId` | `planeRunId` |
| `plane.modelKey` / `plane.modelArtifact.key` | `model.key` |
| `plane.modelVersion` / `plane.modelArtifact.version` | `model.version` |
| `plane.artifactHash` / `plane.aiOutput.artifactHash` / `plane.modelArtifact.artifactHash` | `model.artifactHash` |
| `plane.modelArtifact.baselineReady` | `model.baselineReady` |
| `plane.modelArtifact.availableForRealInference` / `plane.aiOutput.realInferenceAvailable` | `model.availableForRealInference` |
| `plane.metadata.inputId` / `plane.inputId` | `input.inputId` |
| `plane.metadata.inputShapeNative` / `plane.metadata.nativeShape` | `input.nativeShape` |
| `plane.metadata.inputShapeCanonical` / `plane.metadata.canonicalShape` | `input.canonicalShape` |
| `plane.metadata.inputOrientationTransform` / `plane.metadata.orientationTransform` | `input.orientationTransform` |
| `plane.metadata.selectedSlice` / `plane.metadata.selectedSliceIndex` | `input.selectedSliceIndex` |
| `plane.metadata.sliceCount` | `input.sliceCount` |
| `plane.metadata.selectedAxis` | `input.selectedAxis` |
| `plane.metadata.inPlaneSpacing` / `plane.metadata.inPlaneSpacingMm` | `input.inPlaneSpacingMm` |
| `assets` como mapa `{ [assetName]: AssetRef \| url }` | `assets: CanonicalPlaneAsset[]` |
| medición con `label` (sin `labelKey`) | `measurement.labelKey` |
| `plane.inferenceMode` / `plane.aiOutput.inferenceMode` | `plane.effectiveInferenceMode` (si falta `effectiveInferenceMode`) |
| `plane.humanReviewRequired` ausente pero `plane.aiOutput.humanReviewRequired` presente | `plane.humanReviewRequired` |
| `plane.notClinicalDiagnosis` ausente pero `plane.aiOutput.notClinicalDiagnosis` presente | `plane.notClinicalDiagnosis` |

Ningún componente fuera de `src/adapters/multiplanarRunAdapter.ts` debe conocer
estos aliases.

## 4. Modelo canónico interno

Definido en `src/contracts/canonicalMultiplanarRun.ts`:

- `CanonicalMultiplanarRun`: `status`, `schemaVersion`, `runId`, `traceId`,
  `caseId`, `workspaceMode`, `requestedInferenceMode`, `effectiveInferenceMode`,
  `planes.sagittal` (obligatorio), `planes.axial` (opcional), `humanReviewRequired`,
  `notClinicalDiagnosis`, `synthetic`, `fallbackReason`, `degradedMode`.
- `CanonicalPlaneRun`: `planeRunId`, `plane`, `status`, `effectiveInferenceMode`,
  `synthetic`, `fallbackReason`, `model`, `input`, `coordinateSpace`,
  `assets: CanonicalPlaneAsset[]`, `series`, `masks`, `landmarks`, `measurements`,
  `quality`, `humanReviewRequired`, `notClinicalDiagnosis`.
- `CanonicalPlaneModel`, `CanonicalPlaneInput`, `CanonicalPlaneAsset`,
  `CanonicalMeasurement`, `CanonicalLandmark`, `CanonicalGovernance`: tipos
  estrictos, ninguno extiende `AiRunResponse` ni usa `Record` genérico como
  estructura principal.

Campos de gobernanza (`humanReviewRequired`, `notClinicalDiagnosis`, `synthetic`)
son `boolean | null`: `null` significa "no informado por el backend", nunca se
completa con `true` por defecto. Para respuestas `pfi.multiplanar-run.v2` la
ausencia de estos campos lanza `ContractError` (ver sección de riesgos).

Assets públicos permitidos: `input.png`, `overlay.png`, `mask-preview.png`.
Cualquier otro nombre de asset, ruta Windows, `/tmp`, `/app`, `mask.npy`,
`confidence.npy`, URL de túnel Cloudflare o `localhost` es descartado por el
adapter antes de llegar al modelo canónico.

## 5. Estrategia para retirar compatibilidad

1. **P9-C.1 (este commit)**: el adapter existe, pero `AnalysisTimelineView.tsx`
   e `inferenceReadiness.ts` siguen recibiendo `MultiplanarRunResponse` legacy
   vía `canonicalRunToLegacyViewModel()`. Cero cambios de UI, cero cambios de
   lógica clínica.
2. **P9-C.2 (siguiente)**: migrar `inferenceReadiness.ts` (readiness gates) para
   operar directamente sobre `CanonicalMultiplanarRun`, eliminando su dependencia
   de `MultiplanarPlaneRun`.
3. **P9-C.3**: migrar `AnalysisTimelineView.tsx` y componentes de assets/paneles
   (`AgentSummary`, `MeasurementsPanel`, `MriSliceViewer`) para consumir
   `CanonicalPlaneRun` / `CanonicalMeasurement` directamente.
4. **P9-C.4**: eliminar `canonicalRunToLegacyViewModel()`, `MultiplanarRunResponse`
   y `MultiplanarPlaneRun` de `src/multiplanarRunTypes.ts` una vez que ningún
   componente los importe.

## 6. Criterios de P9-C.2

- `inferenceReadiness.ts` opera sobre `CanonicalMultiplanarRun` /
  `CanonicalPlaneRun`, no sobre `MultiplanarRunResponse` / `MultiplanarPlaneRun`.
- Ningún nuevo alias se agrega fuera de `multiplanarRunAdapter.ts`.
- Las pruebas de `scripts/p9c1-canonical-contract-tests.mjs` se extienden en un
  script `p9c2-*` propio sin duplicar fixtures (reutilizar
  `src/fixtures/multiplanarRunFixtures.ts`).

## 7. Riesgos de estudios persistidos históricos

- Estudios reabiertos que fueron persistidos antes de la migración a
  `pfi.multiplanar-run.v2` pueden no traer `schemaVersion`. El adapter los trata
  como v1: no exige `humanReviewRequired` / `notClinicalDiagnosis` / `synthetic`
  y, si faltan, produce `null` en vez de lanzar `ContractError` o de asumir
  `true`. Cualquier UI que dependa de estos campos para habilitar una acción
  clínica debe tratar `null` como "no evaluable", igual que `false`.
- Corridas v1 no tienen `plane.effectiveInferenceMode` explícito; se resuelve
  desde `plane.inferenceMode` / `plane.aiOutput.inferenceMode`. Si ninguno está
  presente, el campo queda `undefined` (no se infiere `"real_baseline"` porque
  eso sería inventar un dato clínicamente relevante).
- Assets legacy con rutas de archivo (`mask.npy`, rutas Windows, rutas de
  contenedor) se descartan silenciosamente por el adapter. Esto es intencional
  (fuga de infraestructura interna), pero implica que un estudio histórico con
  solo esos assets puede terminar con `assets: []` en el modelo canónico.
