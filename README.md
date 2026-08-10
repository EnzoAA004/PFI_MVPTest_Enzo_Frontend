# PFI RM Lumbar — Frontend

Aplicación React/Vite del prototipo académico de análisis asistido de resonancias magnéticas lumbares. Presenta la worklist, carga de estudios, evidencia por plano, mediciones revisables y el flujo de revisión profesional.

```text
Frontend React → Backend Spring Boot → AI Module FastAPI
```

El frontend consume exclusivamente el backend. No conoce ni llama directamente al AI Module. La arquitectura completa está en el [repositorio backend](https://github.com/EnzoAA004/PFI_MVPTest_Enzo_Backend/blob/main/docs/architecture.md).

## Requisitos

- Node.js 22 recomendado, igual que CI;
- npm y `package-lock.json`;
- backend disponible o modo mock explícito para trabajo de UI.

La imagen Docker compila con Node 24 y sirve el bundle mediante Nginx.

## Desarrollo

```bash
npm ci
cp .env.example .env
npm run dev
```

En PowerShell, usar `Copy-Item .env.example .env`.

La aplicación queda disponible normalmente en <http://localhost:5173>.

Variables de build Vite:

```text
VITE_API_BASE_URL=http://localhost:8080
VITE_USE_MOCK=false
```

- `VITE_API_BASE_URL` debe apuntar al backend Spring Boot visible desde el navegador.
- `VITE_USE_MOCK=true` usa fixtures en memoria y no llama al backend; sólo sirve para desarrollo de UI.
- El flujo real y las pruebas integradas requieren `VITE_USE_MOCK=false`.

## Build y preview

```bash
npm run build
npm run preview
```

El bundle se genera en `dist/`.

## Tests

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Los E2E con Playwright son comandos separados porque requieren frontend y backend levantados; por ejemplo:

```bash
npm run test:e2e:contract
```

`npm run coverage` publica la métrica **tested modules / módulos con suite**. No es cobertura de líneas ni es comparable con JaCoCo o pytest-cov: indica qué módulos de `src/` son ejercitados por al menos una suite, no cuánto código de cada módulo se ejecuta.

## Configuración runtime de la API

Las variables `VITE_*` quedan incorporadas durante el build. La imagen Docker añade configuración runtime:

```text
BACKEND_URL=http://localhost:8080
```

Al iniciar, `docker/entrypoint.sh` escribe `/env.js`; `window.__PFI_CONFIG__.API_BASE_URL` tiene prioridad sobre `VITE_API_BASE_URL`. Esto permite desplegar la misma imagen contra distintos backends sin recompilar.

`BACKEND_URL` es una URL alcanzable por el navegador. No usar `http://backend:8080`, porque ese nombre sólo existe dentro de la red de Compose.

El catálogo completo está en [.env.example](.env.example).

## Docker

Ejecución aislada:

```bash
docker build -t pfi-frontend .
docker run --rm -p 8088:80 \
  -e BACKEND_URL=http://localhost:8080 \
  pfi-frontend
```

Abrir <http://localhost:8088>.

Para ejecutar el producto completo, usar `compose.yml` o `compose.local.yml` del [backend](https://github.com/EnzoAA004/PFI_MVPTest_Enzo_Backend). La imagen publicada es `ghcr.io/enzoaa004/pfi-frontend`, con tags `latest` y `sha-<commit>`.

## Flujo de usuario

1. Autenticación contra el backend.
2. Carga de estudio o selección de caso.
3. Ejecución de análisis a través del backend.
4. Inspección de assets, planos y mediciones.
5. Verificación del modo efectivo de inferencia.
6. Revisión profesional y persistencia de la decisión.

Un HTTP 200 no implica automáticamente inferencia real. La interfaz debe respetar `degradedMode`, `aiModuleAvailable`, `effectiveInferenceMode`, `humanReviewRequired` y `notClinicalDiagnosis` según el contrato recibido.

El recorrido equivalente por API está en [docs/api-examples.md del backend](https://github.com/EnzoAA004/PFI_MVPTest_Enzo_Backend/blob/main/docs/api-examples.md).

## Limitaciones

- Prototipo académico, no dispositivo médico.
- El modo mock no demuestra integración ni inferencia real.
- Algunas capacidades degenerativas pueden quedar indisponibles si el AI Module no tiene los checkpoints externos no redistribuidos.
- Toda salida requiere revisión profesional.

Los documentos `P9_*`, `P10_*`, `*_EVIDENCE.md` y briefs de diseño se conservan como historial y evidencia. Para operación actual usar este README, `.env.example` y la documentación del backend.
