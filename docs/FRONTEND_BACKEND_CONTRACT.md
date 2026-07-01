# Frontend Backend Contract

El frontend React consume solamente el backend Spring Boot configurado por `VITE_API_BASE_URL`.

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
