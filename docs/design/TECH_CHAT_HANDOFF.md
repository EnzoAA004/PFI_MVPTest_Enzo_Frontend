# Hand-off al chat de planificación técnica (backend / IA / GCP)

> Para llevar al **chat de planificación técnica**. Este chat (rediseño+pulido del frontend) NO ejecuta backend/IA/deploy. Acá quedan consolidadas las dependencias que habilitan lo que el frontend ya construyó en estados honestos. Referencia detallada de contratos: `FE_MODEL_INTEGRATION_READINESS.md`.

## Contexto en una línea
El frontend está terminado y "listo para encender": todas las features que dependen del modelo están construidas y honestamente deshabilitadas. Lo que falta para el "sistema perfecto" es backend/IA/infra. Objetivo del usuario: dejar todo listo para **entrenar el modelo IA en GCP** y, al terminar, integrar.

## Dependencias que habilitan features del frontend
| ID | Qué es | Habilita en el FE | Estado FE hoy |
|---|---|---|---|
| Inferencia real | Modelo produce inferencia real (artifacts presentes) vs modo contrato | Timeline paso 2→3, evaluación con mediciones reales | Bloqueado honesto (`allowContractFallback:false`) |
| AI-009 | Ingesta DICOM real + multi-corte + W/L real | W/L radiológico real, navegación de cortes | Opera sobre PNG único, limitación documentada |
| AI-011 | Espacio de coordenadas real (`model_256` vs `original`) + mapeo | Edición de landmarks sobre la imagen | Deshabilitado si no hay `coordinateSpace` |
| AI-017 / FE-007 | Máscaras por clase (no solo overlay combinado) | Visibilidad de capas por clase en el visor | Deshabilitado, tooltip honesto |
| Longitudinal | Modelo/almacenamiento longitudinal por paciente (múltiples estudios, histórico, AI-initial + Reviewer-final por fecha) | Trends, Key Measurements AI-vs-Reviewer, Study Timeline | Estados vacíos honestos |
| BE-007 / BE-008 / FE-010 | Contrato de revisión + persistencia versionada de mediciones y landmarks | Persistencia real de landmarks, historial de versiones | Mediciones persisten; landmarks = borrador local |
| 3D volumétrico | Pipeline volumétrico (`sagittal_masks`, `axial_masks`, `spacing`, `slice_index_mapping`) | Reconstrucción 3D paciente-específica (Modo B) | Atlas genérico; Modo B deshabilitado |
| IA conversacional | Endpoint para "charlar con el modelo" (mediciones/diagnósticos) | UI de feedback conversacional | No existe (feature futura) |

## Infra / GCP (fuera del FE, para el chat técnico)
- Entrenamiento del modelo IA en GCP (dataset, pipeline de training, versionado de artifacts `.pt`).
- Servido de artifacts reales al backend (para que `effectiveInferenceMode` pase a real).
- Deploy del sistema (backend Spring Boot + AI Module FastAPI + Postgres + frontend) en GCP.
- Calidad del modelo (QUAL): métricas, validación, gating de "real baseline".
- Verificación de accesibilidad **axe en runtime** en el entorno con backend/sesión (el FE dejó los fixes; falta la corrida de confirmación — ver FE-P7).

## Principio a mantener en la integración
Honestidad de datos: encender cada feature solo cuando el dato real exista; nunca presentar contrato/mock como real. El frontend ya impone ese gate; el backend/modelo debe exponer las señales (`effectiveInferenceMode`, `coordinateSpace`, máscaras por clase, histórico, `threeD.enabled`, versionado) para destrabarlas.

## Sugerencia de secuencia (para el chat técnico)
1. Entrenar modelo + servir artifacts reales → destraba **Inferencia real** (mayor impacto: enciende todo el flujo del timeline).
2. AI-011 (coordenadas) → landmarks editables.
3. AI-017/FE-007 (máscaras por clase) → visibilidad por clase.
4. BE-008/FE-010 → persistencia versionada (landmarks + historial).
5. AI-009 (DICOM/multi-corte) → W/L real.
6. Longitudinal → trends/AI-vs-Reviewer.
7. 3D volumétrico → Modo B.
8. Deploy GCP + QUAL + axe runtime → cierre.
