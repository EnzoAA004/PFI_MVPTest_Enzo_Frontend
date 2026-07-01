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
VITE_USE_MOCK=true
```

`VITE_USE_MOCK=true` activa el modo demo local. Si el backend falla, la UI tambien usa el mock local para poder demostrar el flujo.

## Comandos

```bash
npm install
npm run dev
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

La base local esperada es `http://localhost:8080`.

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
