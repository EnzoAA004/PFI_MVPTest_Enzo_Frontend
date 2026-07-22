# MVP Frontend Progress

## Implementado

- Dashboard obtiene la lista de estudios desde el backend.
- La tabla de worklist puede abrir la fila seleccionada.
- El detalle seleccionado se guarda en `sessionStorage` para que el workspace de revisión muestre el caso correspondiente.
- Se reemplazaron los iconos custom de visibilidad por `lucide-react`.
- Se refinó el estilo de botones de visualización con estados visible/oculto más sobrios.
- Se refinó el estilo de switches tipo iOS para 2FA y aprobación profesional.
- Se corrigió la tarjeta de trazabilidad de corrida para que los datos largos no desborden sobre el visor.
- Las filas de la worklist son seleccionables y tienen botón `Abrir revisión`.
- Dashboard e History muestran un estado de carga animado mientras hidratan datos desde backend/Postgres, evitando que aparezcan mocks antes del fetch.
- Resultados IA y revisión calcula delta entre IA y Reviewer, ordena outliers/cambios relevantes arriba y conserva persistencia solo al guardar.
- El workspace de revisión permite exportar un resumen académico de-identificado en JSON, CSV e informe HTML, sin imágenes crudas ni identificadores directos.
- El frontend envía JWT a endpoints protegidos de estudios, historial y revisión.
- Logout revoca el refresh token en backend antes de limpiar la sesión local.
- La sesión se restaura desde almacenamiento asincrónico del navegador.
- Login soporta doble verificación opcional: si el profesional la deshabilita, ingresa directo con JWT.
- Settings incluye configuración de doble verificación por profesional.
- Settings incluye panel admin para aprobar o pausar profesionales.
- Un profesional pendiente de aprobación ve una pantalla restringida y no accede a worklist/estudios.
- El primer ingreso de un profesional aprobado muestra un mini tutorial de uso de la herramienta.
- La inferencia real estricta usa el flujo recomendado `POST /api/ai/inputs` -> `inputId` opaco -> `POST /api/ai/pipeline/run`/multiplanar con `metadata.inferenceMode=real_baseline` y `allowContractFallback=false`; no se usa `inputPath: demo/...` en modo real.
- La revisión persistida de corridas multiplanar envía `corrections` con snapshot `beforeValue`/`afterValue`, alineado con `/api/ai/runs/{multiplanarRunId}/review`.
- El gate multiplanar resuelve defensivamente el modo por plano (`effectiveInferenceMode`, `inferenceMode`, `aiOutput.inferenceMode`, `metadata.inferenceMode`) y bloquea contrato/mock/fallback/degradado.
- Nuevo análisis valida el sagital final `sagittal_spider` con `modelVersion=sagittal-spider-final-v1` y `artifactHash=cf11dcc0ad77a7c787e64a796a2fd7398ef906add461cef4b3d61f1a5238e944`.
- La UI muestra provenance técnica de inferencia y separa capacidades `sagittalRunReady`, `axialRunReady` y `dualRunReady` sin simular axial.

## Pendiente

- Agregar endpoint backend de export si se quiere auditar descargas desde servidor.
- Reemplazar códigos demo por envío real de email/SMS si el alcance lo requiere.
- Persistir historial longitudinal completo por sujeto en tablas dedicadas.
- Conectar maskContours por clase cuando el AI Module entregue máscaras por clase; los assets visuales se consumen vía `/api/ai/assets/{runId}/{plane}/{assetName}`.
- Mantener `VITE_USE_MOCK=false` para E2E real; el modo mock queda reservado para demos y no habilita evaluación real.
