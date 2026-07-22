# PFI MVP Frontend

Frontend React independiente para el PFI MVP. Implementa una worklist, detalle de caso, visualizacion de evidencia/overlay, panel de agente, mediciones revisables y formulario de revision profesional.

## Arquitectura

Flujo esperado:

```text
Frontend React -> Spring Boot Backend -> Python FastAPI AI Module
```

Este repositorio consume solamente el backend Spring Boot. No se conecta directo al modulo Python FastAPI.

## Variables

Copiar `.env.example` a `.env` para desarrollo local:

```text
VITE_API_BASE_URL=http://localhost:8080
VITE_USE_MOCK=false
```

`VITE_API_BASE_URL` siempre debe apuntar al Backend Spring Boot. El frontend nunca llama directo al AI Module FastAPI ni consume rutas internas del modelo.

`VITE_USE_MOCK=false` es obligatorio para E2E real. `VITE_USE_MOCK=true` queda reservado para demos locales y no habilita el gate de evaluación real.

## Comandos

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run test:contract
npm run test:e2e:contract
npm run build
npm run preview
```

## Backend

Endpoints consumidos:

- `GET /api/ai/health`
- `GET /api/ai/models`
- `POST /api/ai/pipeline/run`
- `GET /api/ai/agent/report/{runId}`
- `PATCH /api/ai/review/{runId}`
- `POST /api/ai/inputs`
- `POST /api/ai/multiplanar/run`
- `POST/PUT /api/ai/runs/{multiplanarRunId}/review`
- `GET /api/ai/assets/{runId}/{plane}/{assetName}`

La base local esperada es `http://localhost:8080`.

## Inferencia real

El flujo real usa `inputId` opaco devuelto por `POST /api/ai/inputs`, `metadata.inferenceMode=real_baseline` y `allowContractFallback=false`. La pantalla de nuevo análisis resuelve defensivamente el modo efectivo por plano desde `effectiveInferenceMode`, `inferenceMode`, `aiOutput.inferenceMode` o `metadata.inferenceMode`.

Para el sagital final se valida `modelVersion=sagittal-spider-final-v1` y la huella `cf11dcc0ad77a7c787e64a796a2fd7398ef906add461cef4b3d61f1a5238e944`. El workspace dual queda bloqueado si el axial no vuelve en modo real. Los assets permitidos son `input.png`, `overlay.png` y `mask-preview.png`, siempre servidos por el Backend.

## Deploy en Vercel

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`

Variables recomendadas:

```text
VITE_API_BASE_URL=https://url-backend
VITE_USE_MOCK=false
```

## Advertencia metodologica

La salida de esta aplicacion es asistiva. Presenta apoyo tecnico, evidencia visual, mediciones revisables y priorizacion para un flujo human-in-the-loop. No reemplaza la revision profesional obligatoria.
