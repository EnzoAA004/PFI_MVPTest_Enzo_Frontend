# Frontend Final Evidence

Commit actual al preparar esta evidencia:

```text
5b3f854 Validate frontend for local E2E integration
```

## Comandos locales

```bash
npm install
npm run dev
```

Abrir:

```text
http://localhost:5173
```

## Comando build

```bash
npm run build
```

Salida esperada:

```text
dist/
```

## Variables

Desarrollo local:

```text
VITE_API_BASE_URL=http://localhost:8080
VITE_USE_MOCK=true
```

Produccion Vercel:

```text
VITE_API_BASE_URL=https://url-backend
VITE_USE_MOCK=false
```

## Pantallas para capturar

1. Dashboard principal.
2. Estado backend y modelos disponibles.
3. Ejecucion del caso demo.
4. Detalle de caso con `runId`.
5. Panel agente con flags y prioridad.
6. Overlay o placeholder de evidencia visual.
7. Formulario de revision profesional.
8. Revision guardada con estado actualizado.

## Aclaracion metodologica

La interfaz presenta apoyo tecnico, evidencia visual, mediciones revisables y priorizacion. La salida es asistiva y requiere revision profesional antes de incorporarse a cualquier entrega o informe.

El frontend consume solo el backend Spring Boot mediante `VITE_API_BASE_URL`. No debe consumir directamente el modulo Python FastAPI.
