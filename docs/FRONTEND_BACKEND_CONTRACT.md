# Frontend Backend Contract

El frontend React consume solamente el backend Spring Boot configurado por `VITE_API_BASE_URL`.

Contrato general:

- Las respuestas usan `camelCase`.
- El frontend espera `runId`, `caseId`, `plane`, `modelKey`, `measurements`, `overlayPath`, `agentDecision`, `review` y `humanReviewRequired` cuando esten disponibles.
- Si algun campo falta, la UI debe seguir operativa, pero no puede presentar contrato/mock/fallback como inferencia real.
- `GET /api/ai/models` puede responder un array de modelos o un objeto `{ "models": { ... } }`; el frontend normaliza ambos formatos.
- Si el backend no responde, el frontend activa modo demo local con mock.
- El backend es el unico punto de integracion con el modulo Python FastAPI.

## `GET /api/ai/health`

Respuesta esperada:

```json
{
  "status": "ok",
  "service": "spring-ai-gateway"
}
```

## `GET /api/ai/models`

Respuesta esperada:

```json
[
  {
    "key": "pfi-segmentation-sagittal-v1",
    "name": "Segmentacion tecnica sagital",
    "version": "1.0.0",
    "planes": ["sagittal"],
    "enabled": true
  }
]
```

## `POST /api/ai/pipeline/run`

Payload:

```json
{
  "caseId": "CASE-0142",
  "plane": "sagittal",
  "modelKey": "sagittal_spider",
  "inputId": "inp_case_0142_sagittal",
  "metadata": {
    "inferenceMode": "real_baseline",
    "allowContractFallback": false,
    "source": "frontend-analysis-timeline"
  }
}
```

Flujo recomendado para inferencia real estricta:

1. Subir el archivo con `POST /api/ai/inputs`.
2. Guardar solamente el `inputId` opaco devuelto por backend/AI Module.
3. Enviar ese `inputId` como campo top-level de `POST /api/ai/pipeline/run`.
4. No enviar `inputPath: "demo/..."` cuando `metadata.inferenceMode` es `real_baseline`.
5. Mantener `metadata.allowContractFallback=false`; si el backend/AI Module no puede producir inferencia real, la UI debe mostrar error/estado honesto y no convertirlo en resultado real.

Respuesta:

```json
{
  "runId": "run-001",
  "caseId": "CASE-0142",
  "plane": "sagittal",
  "modelKey": "sagittal_spider",
  "agentDecision": {
    "priority": "media",
    "status": "requiere_revision",
    "flags": ["overlay_disponible"],
    "reasons": ["La salida tecnica debe ser revisada por un profesional."],
    "humanReviewRequired": true
  },
  "measurements": [
    {
      "id": "m-001",
      "label": "Longitud tecnica de referencia",
      "value": 18.4,
      "unit": "mm",
      "confidence": 0.86,
      "plane": "sagittal"
    }
  ],
  "overlayPath": "/api/ai/assets/run-001/sagittal/overlay.png",
  "review": {
    "runId": "run-001",
    "status": "pendiente",
    "observations": ""
  },
  "createdAt": "2026-06-30T21:00:00.000Z"
}
```

## `GET /api/ai/agent/report/{runId}`

Devuelve el mismo contrato de `AiRunResponse`. El frontend lo usa para refrescar el panel de agente, evidencia visual y mediciones luego de ejecutar el pipeline.

## `POST /api/ai/inputs`

Payload multipart:

- `file`: archivo de imagen de entrada.
- `caseId`: identificador de caso.
- `plane`: `sagittal` o `axial`.

Respuesta `InputResponse`:

```json
{
  "inputId": "input-001",
  "caseId": "CASE-DEMO-0142",
  "plane": "sagittal",
  "format": "png",
  "size": 123456
}
```

## `POST /api/ai/multiplanar/run`

Payload `MultiplanarRunRequest`:

```json
{
  "caseId": "CASE-DEMO-0142",
  "sagittalInputId": "input-sag-001",
  "axialInputId": "input-ax-001",
  "sagittalModelKey": "sagittal_spider",
  "axialModelKey": "axial_t2_alkafri",
  "allowContractFallback": false,
  "metadata": {
    "source": "frontend-analysis-timeline",
    "inferenceMode": "real_baseline",
    "allowContractFallback": false
  }
}
```

Respuesta `MultiplanarRunResponse`:

```json
{
  "runId": "multiplanar-run-001",
  "traceId": "trace-001",
  "effectiveInferenceMode": "contract",
  "planes": {
    "sagittal": {
      "runId": "sagittal-run-001",
      "effectiveInferenceMode": "contract",
      "assets": {
        "input.png": {
          "runId": "sagittal-run-001",
          "plane": "sagittal",
          "assetName": "input.png",
          "url": "/api/ai/assets/sagittal-run-001/sagittal/input.png"
        }
      }
    },
    "axial": {
      "runId": "axial-run-001",
      "effectiveInferenceMode": "contract",
      "assets": {}
    }
  },
  "assets": {},
  "review": {
    "status": "pendiente",
    "humanReviewRequired": true,
    "notClinicalDiagnosis": true
  }
}
```

## `GET /api/ai/assets/{runId}/{plane}/{assetName}`

`assetName` servibles: `input.png`, `overlay.png`, `mask-preview.png`.

El frontend consume assets solo via este proxy del backend. No llama directo al AI Module y no usa paths internos.

## Resolucion defensiva de modo real

Por cada plano, el frontend resuelve el modo efectivo con esta precedencia:

1. `planeRun.effectiveInferenceMode`
2. `planeRun.inferenceMode`
3. `planeRun.aiOutput.inferenceMode`
4. `planeRun.metadata.inferenceMode`

El valor se normaliza con trim/lowercase. Solo `real` y `real_baseline` habilitan evaluacion. `contract`, `mock`, `fallback`, `mixed`, ausente o `degradedMode=true` bloquean el gate.

El workspace dual no usa `requestedInferenceMode` como prueba suficiente. Si ambos planos son reales y coinciden, deriva ese modo; si no, queda `mixed` o no informado.

## Gate de nuevo analisis

La pantalla `Nuevo analisis` exige:

- `VITE_USE_MOCK=false` para E2E real.
- `inputId` opaco por plano.
- `allowContractFallback=false`.
- Sagital y axial en modo real.
- Mediciones reales no placeholder.
- Flags de seguridad `humanReviewRequired` y `notClinicalDiagnosis`.
- Para `sagittal_spider`: `modelVersion=sagittal-spider-final-v1`, `artifactHash=cf11dcc0ad77a7c787e64a796a2fd7398ef906add461cef4b3d61f1a5238e944`, `allowContractFallback=false` y `aiOutput.realInferenceAvailable=true` cuando el campo existe.

Si el axial no esta real, el workspace dual permanece bloqueado. Esto prepara una futura corrida sagital aislada sin simular axial.

## Provenance tecnica

El frontend puede mostrar, sin exponer rutas internas:

- `modelKey`, `modelVersion`, `artifactHash` abreviado.
- modo efectivo, `inputId`.
- `selectedSlice`, `selectedAxis`, `sliceCount`.
- `inputShapeNative`, `inputShapeCanonical`, `inputOrientationTransform`.
- `inPlaneSpacing`, `inPlaneSpacingUnit`.
- `humanReviewRequired`, `notClinicalDiagnosis`.

Cuando el sagital informa `inputShapeNative=[17,512,512]`, se presenta como evidencia tecnica del runtime: canonicalizacion `[512,512,17]`, eje sagital `2`, `17` slices y transformacion `move_axis_0_to_last`. No se denomina validacion clinica.

## `PATCH /api/ai/review/{runId}`

Payload:

```json
{
  "status": "observado",
  "observations": "Revisar alineacion del overlay antes de aceptar.",
  "reviewer": "profesional-revisor"
}
```

## `POST/PUT /api/ai/runs/{multiplanarRunId}/review`

Registra o actualiza la revisión profesional persistida para una corrida multiplanar.

Payload:

```json
{
  "reviewStatus": "observed",
  "reviewer": "dra-demo",
  "comments": "Medición observada para ajuste académico.",
  "corrections": [
    {
      "measurementId": "canalAreaMm2",
      "label": "Área del canal",
      "beforeValue": {
        "value": 82.4,
        "unit": "mm2"
      },
      "afterValue": {
        "value": 85.1,
        "unit": "mm2"
      },
      "comment": "Ajuste manual por borde parcial."
    }
  ]
}
```

Estados válidos de `reviewStatus`: `pending`, `accepted`, `observed`, `rejected`, `edited`.

`reviewer` es obligatorio. Las correcciones usan el campo `corrections`; `measurementCorrections` queda obsoleto.

Respuesta:

```json
{
  "runId": "run-001",
  "status": "observado",
  "observations": "Revisar alineacion del overlay antes de aceptar.",
  "reviewedAt": "2026-06-30T21:10:00.000Z"
}
```

## Estados y planos

`plane`: `sagittal` o `axial`

`review.status`: `pendiente`, `aceptado`, `observado` o `descartado`

## Restriccion metodologica

Toda salida del agente se presenta como apoyo tecnico, evidencia visual y priorizacion. La revision profesional es obligatoria antes de usar cualquier resultado en un informe.
