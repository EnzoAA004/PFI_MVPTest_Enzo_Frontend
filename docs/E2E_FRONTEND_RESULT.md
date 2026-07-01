# E2E Frontend Result

Fecha de validacion: 2026-07-01

## Variables usadas

Frontend:

```text
VITE_API_BASE_URL=http://localhost:8080
VITE_USE_MOCK=false
```

Referencia de demo:

```text
.env.example:
VITE_API_BASE_URL=http://localhost:8080
VITE_USE_MOCK=true
```

## Resultado build

```text
npm install: OK
npm run build: OK
vite v7.3.6 built successfully
```

## Flujo probado

- AI Module iniciado en `http://localhost:8000`.
- Backend Spring Boot iniciado en `http://localhost:8080`.
- Frontend iniciado en `http://localhost:5173`.
- `GET http://localhost:8080/api/ai/health`: OK, con `aiModuleAvailable=true`.
- `GET http://localhost:8080/api/ai/models`: OK, respuesta real del backend en formato `{ models, paths }`.
- UI mostro dashboard, estado backend `ok`, 2 modelos normalizados, banner asistivo y revision profesional requerida.
- Boton "Ejecutar caso demo": probado.
- `POST /api/ai/pipeline/run`: backend devolvio error para la corrida remota durante la prueba local.
- UI no crasheo, activo "modo demo local", mostro runId demo, detalle, panel agente, mediciones y overlay placeholder.
- Cambio de revision a `observado`: probado.
- Guardado de observacion: probado con fallback local y aviso visible.
- Nota de cierre: el proceso Spring Boot usado para la prueba termino luego de la validacion; para repetir el flujo se debe levantar nuevamente el backend.

## Capturas sugeridas

- Dashboard con backend `ok` y modelos disponibles.
- Banner "Salida asistiva. Requiere revision profesional."
- Worklist con caso demo.
- Detalle con `runId`.
- Panel agente con prioridad y badge de revision requerida.
- Evidencia visual con placeholder y ruta de overlay.
- Tabla de mediciones.
- Formulario de revision con estado `observado`.
- Aviso de modo demo local tras error del pipeline.

## Estado final

Ready para demo local del frontend con backend real para health/modelos y fallback mock para pipeline cuando la corrida remota no este disponible.

Pending para E2E totalmente real: corregir disponibilidad de datos/modelos/rutas del AI Module para que `POST /api/ai/pipeline/run` devuelva un `runId` real sin fallback.
