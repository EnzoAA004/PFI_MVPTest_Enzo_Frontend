# FE-RD-005 — Brief de ejecución para Codex (Patient longitudinal, estados honestos)

> Depende de FE-RD-000..004 (puede ir en paralelo a otras). Leer SIEMPRE antes: `DESIGN_SPEC.md` (§4.2 y §7), `WEB_INTERFACE_GUIDELINES.md`, y la mockup de **Patient longitudinal** (`PAT-0087`). Usar tokens/componentes de `src/design/`.

## 0. Objetivo
La vista de paciente al nivel de la mockup, pero **honesta sobre datos que hoy no existen**. La data longitudinal / trends / AI-vs-Reviewer **NO está en el backend** (§7 DESIGN_SPEC: requiere modelo longitudinal). Se implementa la UI con **estados vacíos honestos**; **cero datos inventados**.

## 1. ⚠️ Punto de partida crítico: la vista actual INVENTA datos
`PatientHistoryView.tsx` hoy fabrica AI-vs-Reviewer:
- **Key Measurements (línea ~101):** "AI Initial" = `study.metrics.l45DiscHeight + 0.4` y delta **hardcodeado** `-0.4 mm`. Eso es dato inventado. **Eliminarlo.**
- **Trends (línea ~100):** `TrendChart` dibuja una serie sobre `studies`; el subtítulo dice "AI initial vs Reviewer final" pero **no existe** una serie histórica de AI-initial real. No fingir dos series (AI punteada vs Reviewer sólida) si el dato no existe.
- La vista asume **múltiples estudios por paciente con métricas históricas**, que el backend no agrega. Verificar de dónde sale `studies` (¿mock/seed? ¿real?). Si es mock/seed, **no** presentarlo como histórico real.

## 2. Regla de oro de esta fase
Para CADA bloque longitudinal: si el dato **real** existe → mostrarlo; si **no** → **estado vacío honesto** ("Histórico longitudinal no disponible — requiere modelo longitudinal en backend"). Nunca derivar, offsetear (+0.4) ni hardcodear valores. La serie/columna "AI Initial" solo se muestra si viene de **dato almacenado real**; si no, se omite o se marca vacía.

## 3. Entregable — layout (DESIGN_SPEC §4.2)
Construir/reestilizar al nivel de la mockup, con honestidad por bloque:
- **Header de paciente:** PAT-xxxx, badge De-identified, Sex/Age unknown (deidentificado), Total Studies, First / Most Recent. Acciones Export Summary / Add Study. Valores **reales**; si solo hay 1 estudio, decir "1 estudio" (no simular 5).
- **Tabs:** Longitudinal Overview, Study Repository, Activity & Audit, Data Governance.
- **Study Timeline:** lista de estudios **reales** del sujeto (con modelo vX y estado de review). Si hay 0/1, estado honesto (ya hay placeholder para 0; extender a "sin histórico" cuando corresponde).
- **Trends Over Time:** charts SOLO si hay ≥2 puntos reales por métrica. Si no, estado vacío honesto. No dibujar la serie "AI Initial" salvo dato real; nada de dual-series fingido.
- **Key Measurements (AI vs Reviewer):** tabla por fecha/versión **solo con dato real**. Quitar el `+0.4`/delta hardcodeado. Si no hay histórico ni AI-initial almacenado → estado vacío honesto.
- **Data Governance & Privacy, Data Provenance & Audit, Export & Sharing Restrictions** (raw images / full reports / per-patient export = Not permitted; derived visuals = Permitted): contenido real/estático correcto (ya existe parte).
- **Study Library** (datasets públicos deidentificados): ya existe; mantener, marcado como fuentes de research/testing.

## 4. Honestidad (no negociable, §7/§8)
- Cero datos longitudinales/trends/AI-vs-Reviewer inventados, derivados u offseteados.
- Estados vacíos claros que expliquen que el histórico requiere el **modelo longitudinal en backend** (dependencia para el chat técnico).
- Deidentificación total (PAT-xxxx, sin identificadores, sin fechas/lugares directos).
- Export restringido según reglas reales.

## 5. Dependencia backend (reportar, no resolver acá)
**Modelo longitudinal por paciente** (múltiples estudios, histórico de mediciones, AI-vs-Reviewer en el tiempo) → chat de planificación técnica. Este ticket solo hace la UI honesta sobre lo que existe.

## 6. Criterios de aceptación
- [ ] `npm run build` OK (nº módulos) + `npm run lint` sin violaciones nuevas.
- [ ] **0 datos inventados**: no queda `+0.4`, delta hardcodeado, ni serie AI-initial fabricada (grep debe confirmarlo).
- [ ] Cada bloque longitudinal muestra dato real o estado vacío honesto.
- [ ] Header/tabs/gobernanza/export/library al nivel de la mockup.
- [ ] Solo tokens; 0 hex nuevos; `!important` ausente o justificado.
- [ ] Deidentificación respetada.
- [ ] Smoke test visual (con 0/1 estudio: estados vacíos; con datos reales si los hay).

## 7. Fuera de alcance
El modelo longitudinal backend (chat técnico), 3D real (Fase 6). No inventar el dato; no tocar contratos.

## 8. Formato de devolución
```
### Revisión — FE-RD-005
Instalación usada:
Build: <salida + nº módulos>  ·  Lint:
Datos inventados eliminados: +0.4 / delta hardcodeado / serie AI-initial fabricada (evidencia)
Origen de `studies`: mock/seed vs real (qué es y cómo se trató)
Bloques con dato real vs estado vacío honesto: lista
Header/tabs/gobernanza/export/library: qué cambió
Dependencia backend reportada (modelo longitudinal):
a11y: violaciones nuevas (0 esperado)
Smoke test visual:
Decisiones abiertas (para que decidamos):
Notas / deuda:
```
