# FE-P6 — Brief de ejecución para Codex (Limpieza Settings/Patients + Help & Support)

> Epic FE-POLISH. Leer antes: `FE-POLISH_EPIC.md` (decisiones), `WEB_INTERFACE_GUIDELINES.md`. Usar tokens/componentes de `src/design/`.

## 0. Objetivo
Sacar los paneles técnicos que no aportan al usuario, reconvertir **Settings** en configuración del profesional, y crear **Help & Support** como pantalla real donde vive el detalle de compliance/privacidad. Sin romper flujos.

## Parte A — Fix menor de FE-P1
- Al abrir un caso (vista `review` = Case Review), mantener **iluminado en el sidebar el origen** (Studies o Review Queue, según de dónde se abrió). Guardar la "última sección de nav" y usarla para el highlight mientras se está en el detalle.

## Parte B — Settings (hoy `App.tsx:380`)
Composición actual: `<AiMvpCompletionCard /><DemoReadinessPanel /><MultiplanarWorkspaceCard /><SystemDiagnosticsView />`.
- **Eliminar de Settings:** `AiMvpCompletionCard` (Completitud MVP IA), `DemoReadinessPanel` (Readiness demo), `SystemDiagnosticsView` completo (incluye "Resumen operativo"/Actualizar diagnóstico/Warmup AI Module, "AI Module readiness", `PipelineContractCard` = "Contrato técnico del pipeline", y "Condiciones de seguridad del MVP").
- **Conservar `MultiplanarWorkspaceCard`** (upload real) por ahora — P5 lo re-hogar en el timeline. Puede quedar temporalmente en Settings o en una ubicación transitoria; NO borrarlo.
- **Construir Settings = configuración del profesional**, en 3 secciones (decisión Enzo):
  1. **Perfil:** nombre, rol, matrícula/credencial, centro/institución.
  2. **Preferencias:** idioma, densidad visual, notificaciones.
  3. **Cuenta / sesión:** cambiar contraseña, cerrar sesión, seguridad de la cuenta.
- ⚠️ Si el backend no persiste estos datos aún, implementar la UI y marcar honestamente lo que **no** persiste ("guardado local / pendiente backend"); no fingir persistencia. Reportar qué persiste.

## Parte C — Patients (quitar redundancia de compliance)
En `PatientHistoryView.tsx`:
- **Eliminar** la tab/sección **Data Governance** y sus paneles: `GovernancePanel` ("Data Governance & Privacy"), `ExportRulesPanel` ("Export & Sharing Restrictions"), "Data Provenance & Audit", `StudyLibrary`, y los `check-list` de privacidad/human-review. (Decisión: los avisos de compliance salen de la UI; el detalle va a Help & Support.)
- Mantener lo funcional del paciente (header, timeline, trends/key-measurements honestos de FE-RD-005). Solo se va la parte de governance/privacidad/librería.

## Parte D — Help & Support (crear pantalla real)
- Hoy el botón "Help & Support" del sidebar **no hace nada**. Convertirlo en una **vista real** (nuevo `ViewKey` o ruta).
- Ahí vive **todo el detalle de compliance/privacidad** que se sacó del resto: uso académico/de-identificado, HIPAA Safe Harbor, "revisión humana requerida", "no es diagnóstico clínico", restricciones de export, gobernanza de datos, y ayuda/soporte general (cómo usar la app, contacto).
- Contenido real/estático correcto; sin datos inventados.
- ⚠️ **Arreglar el mojibake de encoding** en los textos que se muevan (los `â€œ` que aparecen en los check-list): usar caracteres UTF-8 correctos (viñetas/checks limpios) y asegurar que los archivos queden en UTF-8. (P2 cubre la traducción; acá al menos no arrastrar el encoding roto.)

## Honestidad / alcance
- Nada de datos inventados en Settings/Help.
- No romper: logout, apertura de revisión, flujos existentes.
- No tocar los generadores de reportes/HTML export.
- La traducción total a español es **P2** (no en este ticket), pero el contenido nuevo que escribas acá va directamente en español.

## Criterios de aceptación
- [ ] `npm run build` OK (nº módulos) + `npm run lint` sin violaciones nuevas.
- [ ] Settings sin los paneles técnicos; con Perfil + Preferencias + Cuenta/sesión.
- [ ] `MultiplanarWorkspaceCard` (upload) conservado (no borrado).
- [ ] Patients sin la sección de governance/privacidad/librería.
- [ ] Help & Support es una pantalla real con el detalle de compliance; botón del sidebar la abre.
- [ ] Mojibake corregido en el contenido movido.
- [ ] Origen del sidebar iluminado al abrir un caso (Parte A).
- [ ] Solo tokens; 0 hex nuevos; `!important` ausente o justificado.
- [ ] Smoke test visual de Settings, Patients y Help & Support.

## Fuera de alcance
Timeline de carga/gating (P5), 3D (P3), Case Review polish (P4), traducción total (P2). No tocar contratos ni backend.

## Formato de devolución
```
### Revisión — FE-P6
Instalación usada:
Build: <salida + nº módulos>  ·  Lint:
Parte A (origen iluminado): cómo
Settings: paneles removidos; secciones nuevas; qué persiste vs pendiente backend
MultiplanarWorkspaceCard conservado: dónde quedó
Patients: qué se removió
Help & Support: qué contiene; cómo se abre
Mojibake corregido: sí/no; dónde
a11y: violaciones nuevas (0 esperado)
Smoke test visual:
Decisiones abiertas (para que decidamos):
Notas / deuda:
```
