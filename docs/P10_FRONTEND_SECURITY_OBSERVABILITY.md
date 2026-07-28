# P10-C.1 — Cierre de seguridad, sesión y observabilidad del Frontend

Base exacta: commit `57fa76b19c3208e07e8ae633e00089e7e89e9a05` de `PFI_MVPTest_Enzo_Frontend`.
Referencias de integración (sin modificar): Backend `822384f...` / AI Module `06185de...`.

No se modificó el Backend ni el AI Module. No se reabrió alcance funcional de P9 salvo los defectos de seguridad directamente relacionados descriptos abajo (swallow silencioso de refresh en `reviewPersistenceApi.ts`, inconsistencia de gating de `console.warn`, ausencia de manejo de 401 en 3 módulos).

## 1. Alcance

Auditoría transversal y endurecimiento del cliente HTTP, la sesión, el manejo de errores, la trazabilidad y la configuración pública del Frontend. No se tocó el flujo funcional de P9 (carga sagital/axial, corrida multiplanar, proxy 3D experimental, reapertura vía `canonicalRun`, revisión, exportaciones).

## 2. Vulnerabilidades encontradas y severidad

| # | Hallazgo | Severidad | Corrección |
|---|---|---|---|
| 1 | Sin política de origen centralizada; 9 módulos HTTP independientes | Alta | `src/security/originPolicy.ts` (`isAuthorizedBackendUrl`), aplicado a todo módulo que adjunta `Authorization` |
| 2 | Sin single-flight de refresh; 401 concurrentes podían disparar refresh en carrera | Alta | `src/security/refreshCoordinator.ts`, usado dentro de `authClient.refreshDoctorSession()` |
| 3 | `reviewPersistenceApi.ts` tragaba en silencio un fallo de refresh | Media | Se eliminó el `try/catch` que preservaba el 401 original |
| 4 | `studyApi.ts`, `subjectHistoryApi.ts`, `pipelineContractApi.ts` sin manejo de 401 | Alta | Retry-once-on-401 agregado a los tres |
| 5 | Logout incompleto (no limpiaba historial de revisión, estudio seleccionado, estado en memoria) | Alta | `src/security/sessionCleanup.ts: clearAllProtectedData()` + `resetProtectedState()` en `App.tsx` |
| 6 | Sin sincronización de logout entre pestañas | Media | `BroadcastChannel` en `sessionCleanup.ts` (`onCrossTabSessionSync`) |
| 7 | Mensajes de error sin sanitizar por status; sin protección explícita contra fuga de stacks/paths/JWT | Alta | `src/security/safeError.ts` (`SafeFrontendError`, `toSafeFrontendError`, `isUnsafeErrorText`) |
| 8 | `traceId` en 3 formatos distintos; ausente en 6 módulos | Media | `src/security/traceId.ts` centralizado, aplicado a los 6 módulos que carecían de él |
| 9 | Inconsistencia de gating DEV en `console.warn` (falso positivo en la auditoría inicial: ya estaba corregido; se agregó test estático de regresión) | Baja | `scripts/p10c1-security-tests.mjs` test 21 |
| 10 | Sin cabeceras de seguridad en `vercel.json`/`index.html` | Media | `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`, `Content-Security-Policy-Report-Only` |
| 11 | Sin validación de `API_BASE_URL` al arrancar | Media | `validateApiBaseUrlAtStartup()` en `api.ts` (no bloqueante, solo diagnóstico) |

## 3. Archivos modificados

**Nuevos** (`src/security/`): `originPolicy.ts`, `refreshCoordinator.ts`, `safeError.ts`, `traceId.ts`, `frontendLogger.ts`, `sessionCleanup.ts`.

**Modificados**: `src/api.ts`, `src/authClient.ts`, `src/multiplanarApi.ts`, `src/studyApi.ts`, `src/subjectHistoryApi.ts`, `src/pipelineContractApi.ts`, `src/reviewPersistenceApi.ts`, `src/authenticatedAssets.ts`, `src/components/Header.tsx`, `src/App.tsx`, `src/dataMode.ts`, `vercel.json`, `index.html`, `package.json`.

**Tests nuevos**: `scripts/p10c1-security-tests.mjs` (32 tests estáticos), `scripts/playwright-p10c1-security-e2e.mjs` (6 escenarios E2E).

**Tests existentes ajustados** (para que sigan cargando los módulos reales en su sandbox sin regresión): `scripts/authenticated-assets-tests.mjs`, `scripts/p8b-postgres-contract-tests.mjs`, `scripts/p8d2-canonical-review-tests.mjs` — se agregaron stubs de `URL`/`frontendLogger`/`toSafeFrontendError`/`generateTraceId`/`isAuthorizedBackendUrl` a sus sandboxes de `vm.runInNewContext`, ya que esos scripts transpilan `src/api.ts`/`src/authenticatedAssets.ts` de forma aislada con los imports eliminados por regex. Esto no cambia ninguna aserción de esos tests, solo repone los globals que sus sandboxes necesitan tras la refactorización.

## 4. Arquitectura final de sesión

- Storage: sin cambios de mecanismo — `authStorage.ts` sobre IndexedDB (`browserStorage.ts`), con caché síncrona en memoria.
- Refresh: `authClient.refreshDoctorSession()` ahora es el único punto de entrada; internamente usa `coordinateRefresh()` (single-flight — una promesa compartida por todas las llamadas concurrentes). Un fallo de refresh limpia la sesión (`notifySessionInvalidated()`) y dispara el evento `pfi:session-invalidated`, que `App.tsx` escucha para cerrar sesión de forma controlada sin importar qué módulo disparó el refresh.
- Logout: `logoutDoctor()` llama al backend (best-effort) y siempre ejecuta `clearAllProtectedData()` (auth + historial de revisión + estudio seleccionado). `App.tsx.logout()` además resetea el estado en memoria (`resetProtectedState()`: mediciones, corrida seleccionada, revisión, estudios, historial de paciente, errores).
- Sincronización entre pestañas: `BroadcastChannel("pfi-session-sync")` — logout o invalidación de sesión en una pestaña cierra la sesión en todas las demás.
- Preferencias no sensibles (`lumbar-mri-professional-settings-v1`: idioma/densidad/notificaciones) se preservan deliberadamente tras el logout.

## 5. Política final de origen

`src/security/originPolicy.ts: isAuthorizedBackendUrl()` — única política aplicada a todo módulo que adjunta `Authorization`:

- Acepta: ruta relativa `/api/...`, o URL absoluta cuyo `origin` sea exactamente igual a `API_BASE_URL` y cuyo `pathname` empiece con `/api/`.
- Rechaza: esquemas `file:`/`data:`/`blob:`/`javascript:`/`ftp:`; URLs protocol-relative (`//host/...`); path traversal (`..`); credenciales embebidas (`user:pass@host`); downgrade HTTP cuando el backend es HTTPS; cualquier host que no coincida exactamente (incluye subdominios como `backend.example.evil.com`).
- `multiplanarRunAdapter.ts` conserva su propia copia (`isDurableMeshAssetUrl`, ya validada en P9-C.5 Parte B) porque su test (`p9c5b-reopening-tests.mjs`) transpila ese archivo de forma aislada con los imports eliminados — unificarla habría requerido reescribir ese arnés de test. Ambas implementaciones son semánticamente equivalentes (mismo criterio: `/api/...` relativo o origin exacto); queda documentado como riesgo residual menor (dos fuentes de verdad idénticas en vez de una).
- Aplicada en: `authenticatedAssets.ts` (descarga de imágenes IA), `Header.tsx` (reporte técnico).

## 6. Comportamiento final de 401/403

- **401** = sesión ausente/vencida/inválida → dispara refresh coordinado una única vez; si el refresh falla, limpia la sesión y fuerza login. Módulos con este comportamiento: `api.ts`, `multiplanarApi.ts`, `studyApi.ts`, `subjectHistoryApi.ts`, `pipelineContractApi.ts`, `reviewPersistenceApi.ts`, `authenticatedAssets.ts`, `Header.tsx`.
- **403** = sesión válida, permiso insuficiente → **nunca** dispara refresh ni logout. La sesión permanece activa; se muestra un mensaje seguro ("No tenés permiso para realizar esta acción.") y se conserva el estado de navegación. Verificado en `E2E4`.

## 7. Sanitización de errores

`src/security/safeError.ts` — modelo `SafeFrontendError { message, status, code, traceId, suggestedAction }`. Mapeo fijo por status (400/401/403/404/409/413/415/422/429/5xx). Un mensaje curado del backend (`body.message`) solo se muestra si pasa `isUnsafeErrorText()` (detecta `Exception`, `Traceback`, stack frames `at x.y(`, SQL `SELECT...FROM`, `jdbc:`, `postgres://`, `DATABASE_URL`, paths Windows/`\tmp\`/`\app\`/`\content\`, JWT-shaped tokens, HTML/`<!DOCTYPE`, JSON crudo); si no pasa, se usa el mensaje fijo del status. Aplicado en `api.ts` (`buildApiError`), `multiplanarApi.ts` (`backendErrorFrom`), `studyApi.ts`, `subjectHistoryApi.ts`, `pipelineContractApi.ts`, `reviewPersistenceApi.ts`, `Header.tsx`. Verificado en `E2E6` (stack trace de PostgreSQL + JDBC + path Windows simulados → nunca llegan al DOM).

## 8. Trazabilidad (traceId)

`src/security/traceId.ts: generateTraceId(scope)` — formato `${scope}-${timestamp}-${counter}-${random}`, longitud máxima 80. `sanitizeIncomingTraceId()` valida cualquier trace devuelto por el backend antes de confiarlo (patrón `^[a-zA-Z0-9._-]{1,80}$`). Se generó un trace por módulo/acción (`frontend-*`, `frontend-multiplanar-*`, `frontend-threed-asset-*`, `frontend-auth-*`, `frontend-study-*`, `frontend-history-*`, `frontend-pipeline-*`, `frontend-review-*`, `frontend-report-*`), enviado como `X-Trace-Id` en todos los módulos HTTP. `frontendLogger` (nuevo, `src/security/frontendLogger.ts`) centraliza `console.debug/warn/error`: `debug` deshabilitado en producción, `warn`/`error` sanitizan objetos vía `JSON.parse(JSON.stringify(...))`.

## 9. Tests y resultados exactos

Comando: `npm run test` (cadena completa, incluye `test:p10c1-security`) → **exit 0**, 306 aserciones `ok`, 0 fallidas, 0 omitidas.

Comando: `npm run typecheck` → **exit 0**, sin errores.

Comando: `npm run lint` → **exit 0**, sin warnings/errores.

Comando: `npm run build` → **exit 0**, build de producción generado en `dist/` (1854 módulos, sin errores).

Suites individuales relevantes re-verificadas tras el endurecimiento (todas con exit 0):
- `npm run test:p9c5-workspace` — 19/19 ok (P9-C.5 workspace multiplanar).
- `npm run test:p9c5b-reopening` — 12/12 ok (P9-C.5 Parte B reapertura, incluye `isDurableMeshAssetUrl`).
- `npm run test:p10c1-security` — 32/32 ok (nuevo, este ticket).
- `npm run test:e2e:p9c` — Playwright P9-C E2E passed.
- `npm run test:e2e:p9c5` — Playwright P9-C.5 E2E passed.
- `npm run test:e2e:p9c5b` — Playwright P9-C.5 Parte B reopening E2E passed.
- `npm run test:e2e:p10c1` — Playwright P10-C.1 security E2E passed (6/6 escenarios).

**No omitido/no roto**: `npm run test:e2e:contract` (`scripts/playwright-contract-e2e.mjs`) falla por timeout esperando `text=Resultado sagital real_baseline` — **verificado por separado que esta falla ya existía en el commit base `57fa76b` antes de cualquier cambio de P10-C.1** (se hizo `git stash` + `npm run build` + re-ejecución del mismo script sobre el baseline limpio, con el mismo resultado exacto). No se investigó ni corrigió por estar fuera del alcance de P10-C.1 (no es un defecto de seguridad).

## 10. E2E: simulados vs reales

**Los 10 escenarios E2E (4 de regresión P9 + 6 de P10-C.1) corren contra un backend completamente mockeado vía `page.route`, nunca contra un backend real.** Ningún E2E de esta entrega se ejecutó contra el Backend/AI Module reales de P10-B.3/P10 — no se dispuso de esa instancia en este entorno. Si se desea un smoke opcional contra el backend real, debe agregarse un script separado gateado por variables de entorno (p. ej. `E2E_REAL_BACKEND_URL`), sin credenciales en código ni capturas — **no se implementó en este ticket** por estar fuera del alcance mínimo pedido; queda como pendiente explícito (ver sección 12).

Detalle de los 6 escenarios P10-C.1 (`scripts/playwright-p10c1-security-e2e.mjs`):
- **E2E1** sesión válida: sesión sembrada en IndexedDB, bootstrap completo, sin login forzado, sin errores JS.
- **E2E2** token vencido recuperable: primer `/api/studies` devuelve 401 → un único `/api/auth/refresh` → reintento único → dashboard operativo.
- **E2E3** token revocado: `/api/auth/refresh` devuelve 401 → sesión limpiada de IndexedDB → pantalla de login → ninguna pantalla protegida visible.
- **E2E4** permiso insuficiente: `/api/studies` devuelve 403 con un nombre de excepción Java simulado → sesión permanece activa (sin refresh, sin logout) → mensaje seguro, sin el nombre de la excepción en el DOM.
- **E2E5** URL externa maliciosa: `canonicalRun.threeD.assets[0].url` apunta a `https://evil.example/...` → se interceptó ese host y se verificó que **nunca** se emite una solicitud de red hacia él (se descarta durante el parseo, antes de cualquier fetch).
- **E2E6** error interno saneado: `/api/studies` devuelve 500 con un mensaje simulando `PSQLException` + cadena JDBC + path Windows → el DOM solo muestra el mensaje genérico saneado, nunca el texto crudo.

## 11. Riesgos residuales

1. `isDurableMeshAssetUrl` (adapter) e `isAuthorizedBackendUrl` (política común) son dos implementaciones semánticamente equivalentes en vez de una sola fuente de verdad — ver sección 5.
2. `public/env.js` (config runtime inyectada en deploy) no tiene verificación de integridad; es un mecanismo de infraestructura fuera de este repo, solo documentado como vector.
3. La `Content-Security-Policy` se agregó en modo **Report-Only** con `connect-src 'self' https: blob:` (permite conectar a cualquier host HTTPS, no solo al backend configurado) porque `API_BASE_URL` varía por deployment y no se probó una CSP restrictiva con el bundle real de Vite/Three.js/WebGL en este ciclo. Antes de promoverla a bloqueante, hay que fijar `connect-src` al origin real del backend y probar contra el build de producción.
4. No se implementó un smoke E2E opcional contra el Backend/AI Module reales (sección 10).
5. La coordinación single-flight de refresh se probó end-to-end para un único 401 (E2E2) y a nivel unitario para 401 duplicados en `authenticatedAssets.ts` (tests C/D); no se armó un escenario E2E con 3+ llamadas verdaderamente concurrentes contra 401 simultáneos, porque en el bootstrap real solo `getStudies()` usa `includeAuth=true` (health/models no llevan Authorization).

## 12. Pendientes para el P10 del AI Module

- No aplica ningún cambio de contrato ni de seguridad al AI Module en este ticket; su propio pase de P10 debería auditar de forma independiente sus propios logs/errores si expone algún endpoint directo (fuera del proxy del Backend).

## 13. Confirmación P9-C.2 / P9-C.5

`npm run test:e2e:p9c5` y `npm run test:e2e:p9c5b` pasan sin cambios de aserciones tras el endurecimiento — el proxy 3D experimental, la reapertura vía `canonicalRun` y el flujo de revisión multiplanar siguen funcionando exactamente igual. `npm run test:p9c5-workspace` (19/19) y `npm run test:p9c5b-reopening` (12/12) también confirman que la política de origen del mesh 3D (P9-C.2/P9-C.5) no sufrió regresión.

## 14. Rollback

Todos los cambios son aditivos o de reemplazo de lógica interna (sin cambios de esquema de datos persistidos ni de contrato HTTP con el Backend). Revertir es seguro con `git revert`/`git checkout` de los archivos listados en la sección 3; no requiere migración ni limpieza de datos.
