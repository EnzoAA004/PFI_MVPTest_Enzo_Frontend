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

## 8. P9-C.1.1 — Hotfix: gobernanza detrás del presenter público P8

Commit base del hotfix: `89636144fa39c33ff02309a6637be27b3a3b51ec`.

### 8.1 Wire del AI Module vs. modelo canónico del backend vs. presenter público v2

Existen tres capas distintas en el lado backend, y P9-C.1 asumió que la
segunda y la tercera coincidían exactamente. No es así:

1. **Wire del AI Module**: la salida cruda de los modelos de inferencia
   (`mask.npy`, rutas de contenedor, artefactos internos). El frontend nunca
   la ve.
2. **Modelo canónico del backend**: la forma interna que el backend usa una
   vez validado el contrato v2 (`schemaVersion=pfi.multiplanar-run.v2`,
   `synthetic`, `fallbackReason` como campos de primer nivel tanto en la raíz
   como en cada plano).
3. **Presentación pública temporal v2→P8** (`CanonicalMultiplanarRunLegacyPresenter`
   en el backend): la respuesta HTTP real de `POST /api/ai/multiplanar/run`
   mientras el backend mantiene compatibilidad con consumidores P8. Esta capa
   **no** expone `root.synthetic` ni `plane.synthetic` de forma directa en
   todos los casos: los codifica a través de `degradedMode`,
   `plane.aiOutput.synthetic`, `plane.metadata.synthetic` y sus equivalentes
   de `fallbackReason`.

P9-C.1 exigía únicamente `record.synthetic` (y `plane.synthetic` directo),
que es la forma de la capa 2, no la capa 3 que realmente responde el backend
en producción. Resultado: `ContractError: falta synthetic obligatorio para
pfi.multiplanar-run.v2` en toda corrida real, y bloqueo del botón "Continuar
a evaluación" incluso cuando sí se resolvía synthetic, porque
`canonicalRunToLegacyViewModel()` no derivaba `allowContractFallback` /
`degradedMode` a partir de los datos canónicos y los dejaba en `undefined`.

### 8.2 Alias `synthetic` → `degradedMode` / `aiOutput.*` / `metadata.*` aceptado temporalmente

El adapter (`src/adapters/multiplanarRunAdapter.ts`) ahora resuelve
`synthetic` con esta prioridad, vía `requireBooleanAlias()` (raíz) y
`resolvePlaneSynthetic()` (plano):

| Nivel | Prioridad de resolución |
| --- | --- |
| Raíz | `record.synthetic` → `record.degradedMode` → `ContractError` (v2) / `null` (v1) |
| Plano | `plane.synthetic` → `plane.degradedMode` → `plane.aiOutput.synthetic` → `plane.metadata.synthetic` → `ContractError` (v2) / `null` (v1) |

`fallbackReason` sigue una prioridad análoga (`record.fallbackReason` →
`aiOutput.fallbackReason` → `metadata.fallbackReason` → `null`; string vacío
se trata como `null`), tanto a nivel de plano como de raíz (donde además se
hereda desde `sagittal.fallbackReason` / `axial.fallbackReason` si la raíz no
lo informa explícitamente).

Esto es un alias, no un campo nuevo: en ningún caso se inventa un valor de
`synthetic` que el backend no haya comunicado por alguna de esas rutas. Si
ninguna fuente es `boolean` y la respuesta es v2, se sigue lanzando
`ContractError` (test `P9-C.1.1 B`).

### 8.3 Legacy view model corregido

`canonicalRunToLegacyViewModel()` ahora deriva, en vez de dejar `undefined`:

- `allowContractFallback = !cleanRealBaseline`, donde `cleanRealBaseline`
  exige `effectiveInferenceMode === "real_baseline"`, `synthetic === false` y
  ausencia de `fallbackReason`.
- `aiOutput.realInferenceAvailable` es `true` únicamente cuando además del
  `cleanRealBaseline` anterior, `model.availableForRealInference === true`.
  Nunca se copia `model.availableForRealInference` en crudo: una corrida en
  fallback no puede presentarse como inferencia real disponible.
- `degradedMode` (plano y raíz) se deriva de `synthetic` cuando el backend no
  lo informó explícitamente como booleano en la raíz.

### 8.4 Eliminación futura del alias

Este alias debe retirarse cuando el backend deje de necesitar
`CanonicalMultiplanarRunLegacyPresenter` y exponga `root.synthetic` /
`plane.synthetic` directamente en la respuesta pública v2 (es decir, cuando
las capas 2 y 3 de la sección 8.1 converjan). Criterio de salida para
P9-C.2/P9-C.3: si un fixture con solo `record.synthetic` (sin `degradedMode`
ni `aiOutput.synthetic` ni `metadata.synthetic`) sigue pasando todos los
tests de `scripts/p9c1-canonical-contract-tests.mjs`, los alias adicionales
(`degradedMode`, `aiOutput.synthetic`, `metadata.synthetic`) pueden
eliminarse de `resolvePlaneSynthetic()` y `requireBooleanAlias()` sin romper
nada, porque en ese punto el backend ya emite el campo canónico directo.

## 9. P9-C.2 — Readiness y flujo principal migrados al modelo canónico

Commit base de P9-C.2: `2760d039d902ffc4badba3291b83524fda34eb1f`.

### 9.1 `inferenceReadiness.ts` trabaja exclusivamente con el modelo canónico

`src/inferenceReadiness.ts` ya no importa ni acepta `MultiplanarRunResponse`,
`MultiplanarPlaneRun` ni `MultiplanarMeasurementValue`. Todas sus funciones
(`resolvePlaneInferenceMode`, `isRealPlaneRun`, `resolveWorkspaceInferenceMode`,
`extractMeasurementRows`, `hasRealMeasurements`, `hasRealPlaneMeasurements`,
`readSpiderRuntimeMetadata`, `evaluateSagittalReadiness`,
`evaluateAxialReadiness`, `evaluateSagittalReviewReadiness`,
`evaluateDualReadiness`, `evaluateRealInferenceReadiness`,
`resolveReviewWorkspaceMode`, `resolvePlaneAssetUrls`) reciben y devuelven
tipos de `src/contracts/canonicalMultiplanarRun.ts` (`CanonicalMultiplanarRun`,
`CanonicalPlaneRun`, `CanonicalMeasurement`, `CanonicalPlaneAsset`).

No quedan referencias a `aiOutput`, `modelArtifact`, `metadata` legacy,
`allowContractFallback`, `inputShapeCanonical`/`selectedSlice` como aliases de
un bolsón `metadata`, ni a ningún nombre de campo suelto (`modelKey`,
`modelVersion`, `artifactHash`) fuera de `model.key` / `model.version` /
`model.artifactHash`. La resolución de alias de la respuesta HTTP pública
sigue viviendo exclusivamente en `src/adapters/multiplanarRunAdapter.ts`;
`inferenceReadiness.ts` no conoce `schemaVersion` ni distingue v1 de v2 — solo
conoce campos canónicos, algunos de los cuales pueden ser `null` (gobernanza
no informada) en vez de `boolean`.

Cambios de comportamiento intencionales respecto a P9-C.1 (más estrictos, no
más laxos):

- `evaluateSagittalReviewReadiness` y `evaluateDualReadiness` ya no aceptan
  `null` como gobernanza válida: `humanReviewRequired`/`notClinicalDiagnosis`
  deben ser exactamente `true`, y `synthetic` exactamente `false`, a nivel de
  raíz. Antes (P9-C.1) solo se bloqueaba con `false` explícito; `null` pasaba
  sin bloquear. Esto es deliberado: una corrida v1 histórica sin gobernanza
  informada ahora queda "no evaluable" en vez de evaluable por omisión.
- `allowContractFallback` no existe en el modelo canónico. Su equivalencia es
  `effectiveInferenceMode === "real_baseline" && synthetic === false &&
  !fallbackReason`, verificada explícitamente en `evaluateSagittalReadiness`
  (a través de `isRealPlaneRun`) en vez de leer un campo suelto.

### 9.2 `AnalysisTimelineView.tsx` conserva `CanonicalMultiplanarRun`

El estado principal es `useState<CanonicalMultiplanarRun | null>(null)`.
`executeRun()` llama `runMultiplanarAnalysis()` (que ya devuelve
`CanonicalMultiplanarRun` desde P9-C.1) y evalúa
`evaluateRealInferenceReadiness()` directamente sobre ese resultado, sin
ninguna conversión intermedia. Todos los cálculos de habilitación/bloqueo
(`sagittalRunReady`, `sagittalReviewReady`, `axialRunReady`, `dualRunReady`,
`realInferenceReady`, `workspaceMode`, `measurementRows`,
`measurementsFromRun`, `fallbackReason`, `planeRunStatus`, los paneles
`ProvenancePanel`/`TechnicalStatusPanel`/`AssetProvenancePanel`,
`reviewPayloadReady`, `saveReview`) leen directamente
`run.planes.sagittal.model.key` / `.model.version` / `.model.artifactHash` /
`.input` / `.assets`, sin aliases locales.

`canonicalRunToLegacyViewModel()` **no se importa** en
`AnalysisTimelineView.tsx`: ningún componente hijo lo necesitaba. Se revisó
`AgentSummary` (recibe un objeto `agentDecision` construido localmente, sin
depender de la forma del run), `MeasurementsPanel` (recibe `Measurement[]`, ya
mapeado por `toMeasurement()`) y `MriSliceViewer` (sus props `series`/`masks`
son `any` y aceptan la forma canónica sin cambios; solo `landmarks` requiere
el campo `label` en vez de `labelKey`, resuelto con un mapeo local puntual
`sagittalLandmarksForViewer()` — no es una reintroducción de la capa legacy,
es un renombre de un único campo para un prop de un componente todavía no
migrado). Si en P9-C.3 se migra `MriSliceViewer` a landmarks canónicos, ese
mapeo puntual puede eliminarse.

### 9.3 Componentes legacy pendientes para P9-C.3

- `MriSliceViewer.tsx`: sigue tipando `series`/`masks` como `any` y esperando
  `landmark.label` en vez de `landmark.labelKey`. Candidato principal de
  P9-C.3.
- `src/multiplanarRunTypes.ts` (`MultiplanarRunResponse`, `MultiplanarPlaneRun`,
  `MultiplanarMeasurementValue`) sigue existiendo porque `multiplanarApi.ts`
  todavía tipa `RunReviewRequest`/`RunReviewResponse`/`InputResponse` con ese
  archivo, y `canonicalRunToLegacyViewModel()` en el adapter sigue
  exportado (sin consumidores en el árbol de componentes hoy, pero mantenido
  por si un componente legacy lo necesita puntualmente — ver criterio de
  eliminación abajo).

### 9.4 Criterio para eliminar `canonicalRunToLegacyViewModel`

`canonicalRunToLegacyViewModel()` puede eliminarse de
`src/adapters/multiplanarRunAdapter.ts` cuando:

1. Ningún archivo bajo `src/components/` la importe (verificar con
   `grep -r canonicalRunToLegacyViewModel src/components/`).
2. `MriSliceViewer.tsx` consuma `series`/`masks`/`landmarks` canónicos
   directamente (sin el mapeo puntual `sagittalLandmarksForViewer`).
3. Los tests de `scripts/p9c1-canonical-contract-tests.mjs` que ejercitan
   `canonicalRunToLegacyViewModel()` se retiren o se muevan a un test de
   deprecación explícito.

Hasta entonces permanece exportada como compatibilidad temporal, tal como
anticipa la sección 5.
