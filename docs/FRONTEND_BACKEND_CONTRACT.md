# Frontend Backend Contract

El frontend React consume solamente el backend Spring Boot configurado por `VITE_API_BASE_URL`.

Contrato general:

- Las respuestas usan `camelCase`.
- El frontend espera `runId`, `caseId`, `plane`, `modelKey`, `measurements`, `overlayPath`, `agentDecision`, `review` y `humanReviewRequired` cuando esten disponibles.
- Si algun campo falta, la UI debe seguir operativa y completar valores de demo/placeholder.
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
  "caseId": "CASE-DEMO-0142",
  "plane": "sagittal",
  "modelKey": "pfi-segmentation-sagittal-v1",
  "imageRef": "backend-managed-reference"
}
```

Respuesta:

```json
{
  "runId": "run-001",
  "caseId": "CASE-DEMO-0142",
  "plane": "sagittal",
  "modelKey": "pfi-segmentation-sagittal-v1",
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
  "overlayPath": "/api/files/overlays/run-001.svg",
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
  "allowContractFallback": true,
  "metadata": {
    "source": "frontend-multiplanar-workspace"
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

## `PATCH /api/ai/review/{runId}`

Payload:

```json
{
  "status": "observado",
  "observations": "Revisar alineacion del overlay antes de aceptar.",
  "reviewer": "profesional-revisor"
}
```

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
