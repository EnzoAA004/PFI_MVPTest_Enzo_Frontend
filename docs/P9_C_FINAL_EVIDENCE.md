# P9-C — Evidencia final de cierre

Repositorio: `EnzoAA004/PFI_MVPTest_Enzo_Frontend`.

## 1. Commits de la serie P9-C

| Fase | Commit base declarado | Resumen |
| --- | --- | --- |
| P9-C.1 | `8963614` | `CanonicalMultiplanarRun`, `parseMultiplanarRunResponse(raw: unknown)`, adapter HTTP v1/v2 |
| P9-C.1.1 | `2760d039d902ffc4badba3291b83524fda34eb1f` | Normalización `synthetic`/`degradedMode`/`fallback` del presenter público v2, hotfix de `ContractError` |
| P9-C.2 | `c88a18b81a5824a70aa2717b0b0aa2e1ac0a7b9f` | `inferenceReadiness.ts` y `AnalysisTimelineView` migrados al dominio canónico; gobernanza estricta |
| P9-C.3 | `0cf4cda3755067097a447ec1365ff2bf4b61c125` | Componentes visuales migrados, `canonicalRunToLegacyViewModel` eliminado, `canonicalRunSelectors`, `measurementViewModel`, DTO de input/revisión separados |
| P9-C.4 (este trabajo) | `0cf4cda3755067097a447ec1365ff2bf4b61c125` | `MriViewerModel` puro, retiro de las uniones `Viewer*`, renombre de `multiplanarRunTypes.ts` → `contracts/multiplanarHttpTypes.ts`, navegación post-guardado, E2E de cierre |

## 2. Arquitectura final

```
HTTP unknown
  → parseMultiplanarRunResponse()          (multiplanarRunAdapter.ts — única interpretación v1/v2)
  → CanonicalMultiplanarRun                (contracts/canonicalMultiplanarRun.ts)
  → inferenceReadiness.ts / selectores      (selectors/canonicalRunSelectors.ts)
  → view models visuales explícitos         (viewModels/measurementViewModel.ts,
                                              viewModels/mriViewerViewModel.ts)
  → componentes de presentación tipados     (AnalysisTimelineView.tsx, MriSliceViewer.tsx)
```

Para el visor compartido:

```
Dominio canónico multiplanar (CanonicalPlaneRun)
  → canonicalPlaneToMriViewerModel() ─┐
                                       ├→ MriViewerModel → MriSliceViewer (presentación pura)
Dominio StudyReview anterior (Study*) ┘
  → studyRunToMriViewerModel()
```

`MriSliceViewer.tsx` no importa `CanonicalPlaneRun`, `StudySeries`,
`StudyMask`, `StudyLandmark`, ni contiene `any` o tipos unión entre
dominios (verificado en `scripts/p9c4-canonical-closure-tests.mjs`).

DTO HTTP separados del dominio de corrida:

- `src/contracts/inputApiTypes.ts` — `InputResponse` (`POST /api/ai/inputs`).
- `src/contracts/reviewApiTypes.ts` — `RunReviewStatus`, `RunReviewRequest`,
  `RunReviewResponse`, `RunReviewCorrection` (`/api/ai/runs/{id}/review`).
- `src/contracts/multiplanarHttpTypes.ts` — `AssetName`,
  `DiagnosticEndpointResponse`, `MultiplanarRunRequest`,
  `MultiplanarRunPayload` (`POST /api/ai/multiplanar/run` y endpoints de
  diagnóstico). Reemplaza a `src/multiplanarRunTypes.ts`, que fue eliminado.

## 3. Tests ejecutados

`npm run test` (agregador de 16 scripts, incluye los 4 scripts `p9c*` de
esta serie):

| Script | Resultado |
| --- | --- |
| `test:contract` | 36/36 |
| `test:assets` | 9/9 |
| `test:review-workspace` | 25/25 |
| `test:data-mode` | ok |
| `test:p7-behavior` | ok |
| `test:p8b-contract` | ok |
| `test:p8d2-review` | ok |
| `test:p8c2-assets` | 14/14 |
| `test:p8d3-corrections` | 9/9 |
| `test:p8d4-status` | 9/9 |
| `test:p8e2-history` | 35/35 |
| `test:p8e3-labelkey` | 9/9 |
| `test:p9c1-canonical` | 21/21 |
| `test:p9c2-readiness` | 31/31 |
| `test:p9c3-components` | 21/21 |
| `test:p9c4-closure` | 24/24 |

**Total con conteo explícito: 243 aprobados, 0 fallos, 0 errores.**
(Los scripts sin conteo numérico — `data-mode`, `p7-behavior`,
`p8b-contract`, `p8d2-review` — reportan `ok` agregado sin desglose
individual, heredado de fases anteriores a P9-C; todos en verde.)

`npm run test:e2e:p9c` (Playwright, Chromium real, backend íntegramente
mockeado, **no** incluido en `npm test`): **PASSED** — cubre login, nuevo
análisis, carga sagital, corrida canónica v2, 9 mediciones, edición de una
medición, guardado como "observado", permanencia en paso 4, clic en "Ver
estudio guardado", reapertura de la revisión persistida con el delta
before/after conservado (`+87.50`), ausencia de `ContractError` y ausencia
de errores de JavaScript en consola.

## 4. Resultado typecheck

```
npm run typecheck
> tsc -b
```
Exit code 0. Sin errores.

## 5. Resultado lint

```
npm run lint
> eslint src --ext .ts,.tsx
```
Exit code 0. Sin errores ni warnings.

## 6. Resultado test

```
npm run test
```
Exit code 0. 243/243 aprobados (ver tabla arriba), 0 fallos, 0 errores.

## 7. Resultado build

```
npm run build
> vite build
✓ 1844 modules transformed.
dist/index.html                        0.51 kB │ gzip:   0.30 kB
dist/assets/index-BjmVQ5as.css        84.34 kB │ gzip:  15.70 kB
dist/assets/sampleRun-CInKFvZb.js      0.26 kB │ gzip:   0.18 kB
dist/assets/vendor-BtSVzllW.js       200.12 kB │ gzip:  63.36 kB
dist/assets/index-D3TddomQ.js        207.19 kB │ gzip:  59.71 kB
dist/assets/vendor-three-PDSP0dbZ.js 734.33 kB │ gzip: 189.46 kB
✓ built in ~4s
```
Exit code 0.

## 8. Archivos eliminados en P9-C.4

- `src/multiplanarRunTypes.ts` (reemplazado por `src/contracts/multiplanarHttpTypes.ts`).
- Tipo `LegacyMultiplanarRunRequest` (sin consumidores reales, auditado por
  `grep` antes de eliminar).
- Tipos unión `ViewerSeries`/`ViewerMask`/`ViewerLandmark` y sus helpers
  internos (`stringField`, `hasField`, `landmarkLabelKey`, `landmarkKeyOf`,
  `maskGroupName`, `maskLabel`) en `MriSliceViewer.tsx`.

Archivos nuevos: `src/viewModels/mriViewerViewModel.ts`,
`src/contracts/multiplanarHttpTypes.ts`, `scripts/p9c4-canonical-closure-tests.mjs`,
`scripts/playwright-p9c-e2e.mjs`.

## 9. Deuda legacy restante (ver también sección 11.7 del contrato)

- `StudyReviewView.tsx` sigue operando sobre `AiRunResponse` (el pipeline de
  plano único anterior, endpoint `/api/ai/pipeline/run` +
  `/api/studies/{caseId}`), fuera del alcance de P9-C. `MriSliceViewer`
  ya no conoce esa forma directamente — la traduce
  `studyRunToMriViewerModel()` — pero el propio `StudyReviewView.tsx` sigue
  siendo un consumidor legítimo de `AiRunResponse`/`aiOutput`/`modelArtifact`
  para su propio dominio.
- "Ver estudio guardado" reabre la revisión a través del flujo existente de
  `/api/studies/{caseId}` (pre-existente, no modificado). La fidelidad
  exacta de esa reapertura depende de ese endpoint del backend, no de este
  cambio de frontend.
- `AgentSummary`/`Header.tsx` conservan lectura de `aiOutput`/`modelArtifact`
  de `AiRunResponse` — DTO HTTP legítimo de un endpoint distinto, sin
  relación con el corredor multiplanar migrado.

## 10. Smoke manual requerido

Antes de desplegar a producción, un humano debe verificar manualmente
contra el backend real (Railway, `PFI_AI_SERVICE_MULTIPLANAR_CONTRACT_VERSION=v2`):

1. Login real y navegación a "Nuevo análisis".
2. Carga de un input sagital real y ejecución de `POST /api/ai/multiplanar/run`
   contra el AI Module real (no mockeado).
3. Verificar que las 9 mediciones, landmarks e imágenes (`input.png`/`overlay.png`)
   se muestran correctamente en el visor.
4. Editar una medición, guardar como "observado", confirmar que el mensaje
   "Revisión guardada por el flujo existente de corridas." aparece y que el
   paso 4 permanece activo.
5. Pulsar "Ver estudio guardado" y confirmar que la revisión reabre
   correctamente desde Postgres con el AI Module apagado.
6. Confirmar rollback v2→v1→v2 (ya validado en P9-C.1.1) sigue funcionando
   con los cambios de P9-C.4.
7. Confirmar que ningún `ContractError` aparece en un flujo real de punta a
   punta.

Este smoke manual **no** fue ejecutado como parte de este trabajo (no hay
acceso a Railway/AI Module real desde este entorno); el E2E automatizado
(`test:e2e:p9c`) cubre la misma secuencia contra un backend mockeado
determinístico.

## 11. Limitaciones conocidas (sin cambios respecto a fases anteriores)

- **Axial `candidate_below_quality_gate`**: el plano axial permanece en uso
  experimental; nunca se presenta como inferencia real disponible
  (`evaluateAxialReadiness`, sin cambios en P9-C.4).
- **`raw_*` sin semántica anatómica**: las máscaras/mediciones axiales con
  prefijo `raw_*` no se traducen a nombres anatómicos ni se agrupan como
  "Grupo vertebral"/"Canal"/"Grupo discal" (verificado explícitamente en
  `scripts/p9c4-canonical-closure-tests.mjs`, prueba B5).
- **Revisión humana obligatoria**: ninguna corrida se presenta como
  evaluable sin `humanReviewRequired === true` confirmado, a nivel raíz y
  de plano.
- **No diagnóstico clínico**: los textos y badges "No apto para diagnóstico
  clínico" / "Revisión profesional obligatoria" permanecen sin cambios en
  toda la superficie visual.
- **Infraestructura temporal dependiente del túnel**: nuevas inferencias
  reales contra el AI Module siguen dependiendo de la infraestructura
  temporal (túnel) documentada en fases anteriores; la persistencia y
  reapertura de estudios ya guardados funciona con el AI Module apagado
  (confirmado en P9-C.3 y re-confirmado por el E2E de P9-C.4), pero generar
  una corrida *nueva* requiere que esa infraestructura esté disponible.
