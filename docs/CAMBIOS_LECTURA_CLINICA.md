# Frontend — rediseño: estación de lectura, navegación y anotaciones

Fecha: 2026-07-30/31. Rama: `integration/redesign`.

Continúa el plan de rediseño. Cierra las fases 3 y 4, colapsa la arquitectura de
navegación a cuatro destinos y elimina la duplicación de superficies.

---

## 1. Recorrido de la serie

### Rueda, teclado y barra de stack

La rueda del mouse cambia de corte (el zoom pasó a `Ctrl`+rueda). Flechas,
`PageUp`/`PageDown` (±5), `Home`/`End`.

`SliceNavigation` expone `onStep(delta)` además de `onChange(index)`. No es
redundante: varios eventos de rueda seguidos se procesan en el mismo tick de React,
y calcular el destino con un `current` ya obsoleto perdía pasos al scrollear rápido.
`onStep` resuelve el destino dentro del setter funcional.

### Imagen por corte

Cada corte muestra su propia previsualización (`slice-NNN.png`, servidas por el
backend). Solo el corte que la IA analizó conserva `input.png` con su superposición:
la máscara no se arrastra a los demás porque existe únicamente para ese corte.

`slicePreviewCount` decide si un corte tiene imagen. Cuando no la tiene, se dice
explícitamente en vez de dejar el visor en blanco o repetir la imagen de otro corte.

### Sin parpadeo

Dos cosas lo causaban y las dos están resueltas:

- **Caché de blobs** acotada (96 entradas, desalojo del más antiguo). Antes, volver a
  un corte ya visto repetía la descarga y el visor caía al cartel de "verificando
  recurso". El objeto URL lo posee la caché, no quien lo consume, así que solo se
  revoca al desalojar.
- **Decodificación previa.** Descargar el blob no alcanzaba: al cambiar el `src` el
  navegador todavía tenía que decodificar el PNG, y ese intervalo dejaba el visor en
  negro. Ahora se llama `image.decode()` antes de reportar "loaded".

Además se precargan los cortes contiguos. Solo los inmediatos: traer la serie entera
pediría decenas de imágenes que quizás nunca se miran.

### Marcadores de contenido

La barra de stack marca con un punto el corte que analizó la IA y los cortes con
anotaciones del revisor. De un vistazo se ve dónde hay algo que mirar.

---

## 2. Disposición sagital + axial (1×1 / 1×2)

Selector en la barra superior. En 1×2 el stage se parte en dos —filas, o columnas si
la pantalla es ancha— y el plano activo se distingue por su borde.

**Cada plano mantiene su corte de forma independiente.** No hay geometría
(`origin`/`direction`) para ligarlos, y ligarlos por índice sería inventar una
correspondencia que el dato no respalda.

El botón 1×2 queda deshabilitado si el estudio no trae axial: si no, la mitad
inferior quedaría vacía prometiendo una comparación que no existe.

### La línea de referencia sigue bloqueada

El contrato v2 no transporta `origin` ni `direction` de paciente —
`coordinateSpace.origin` es `"top_left"`, espacio de píxel. Es el bloqueo
VOL-CONTRACT-04. Por la regla del proyecto (la coordinación espacial no se simula),
no se dibuja nada.

---

## 3. Hallazgos por nivel lumbar

El panel derecho organiza por L1-L2 … L5-S1, que es el eje sobre el que se lee y se
reporta una lumbar. Seleccionar un nivel filtra sus mediciones.

Las mediciones que el modelo no puede atribuir a un nivel (canal, grupo vertebral, y
discos fuera del rango lumbar) se listan bajo "Sin nivel asignado" en vez de
repartirse por suposición.

El nivel viaja desde el AI Module. Se estaba descartando en tres capas —el ejecutor
v2 del módulo, el DTO de Java y `studyApi.ts`—; las tres corregidas.

---

## 4. Anotaciones con alcance

**Archivo:** `src/features/reading/annotations.ts`

```ts
type AnnotationScope = "study" | "level" | "slice";
```

Responde al pedido de las entrevistas: algunas observaciones valen para todo el
estudio, otras están acotadas a un corte.

- Una anotación de **corte** solo se dibuja sobre su corte, y no cruza de plano ni de
  serie.
- Una de **nivel** cruza sagital y axial: el nivel es la misma referencia en ambos.
- Una de **estudio** no se dibuja sobre la imagen; se lista aparte.

### Herramienta de medición

Dos clics definen una distancia. **Es en milímetros reales**: escala cada eje por su
propio `inPlaneSpacingMm` antes de la norma, porque el píxel no es cuadrado y una
diagonal en píxeles convertida con un solo factor sería una cifra inventada. Si la
corrida no informó escala, reporta px y lo dice.

Los trazos se guardan en la base normalizada 0..256 —la misma de máscaras y
landmarks—, así que siguen sobre la misma anatomía con cualquier zoom o resolución.

### Persistencia

`GET`/`PUT /api/ai/runs/{runId}/annotations`. Se cargan al abrir la corrida y se
descartan al cambiar de corrida.

**Se guardan junto con la revisión, no en cada trazo**: el revisor mide y descarta
varias veces mientras lee, y persistir cada movimiento dejaría en la historia pasos
intermedios que nunca quiso registrar. Si la revisión se guarda pero las anotaciones
fallan, el panel lo dice en vez de dejar creer que las marcas están a salvo.

---

## 5. `AnalysisTimelineView` eliminada (797 líneas)

Era una segunda superficie de revisión, en paralelo a la sala de lectura, con **otro
contrato de revisión**: `accepted/observed/rejected/edited` + `submitRunReview`,
contra `pendiente/observado/aceptado/descartado` + `updateReview`. Dos contratos de
API para el mismo acto profesional.

Contenía además el asistente de cuatro pasos (cargar → procesar → evaluar → aprobar).
Los dos últimos duplicaban la sala de lectura; el patrón de asistente numerado es de
alta de SaaS, no de lectura radiológica.

**Reemplazo:** `features/worklist/NewAnalysisDrawer.tsx`, un panel sobre la lista de
trabajo. Se carga el estudio, se procesa, y aparece en la lista para leerlo, con la
lista visible detrás.

Al borrar la vista, `submitRunReview` y `getRunReview` quedaron sin uso y se
eliminaron de `multiplanarApi.ts`: **la unificación del contrato de revisión salió
sola**.

---

## 6. Navegación por URL

**Archivos:** `src/routes.ts`, `src/App.tsx`, `src/main.tsx`

Antes la navegación vivía solo en estado de React: no había forma de compartir un
caso por link, el botón atrás salía de la app y recargar devolvía siempre a la lista.

Ahora la URL es la fuente de verdad. `activeView` se deriva de `location.pathname` y
`setActiveView` ya no existe.

| Ruta | Pantalla |
|---|---|
| `/worklist` | Lista de trabajo |
| `/estudio/:caseId` | Sala de lectura |
| `/pacientes` | Lista de pacientes |
| `/pacientes/:subjectRef` | Historial de un paciente |
| `/pacientes/estudio/:caseId` | Trazabilidad de un estudio |
| `/ajustes` | Preferencias y ayuda |

Una ruta desconocida cae en la lista de trabajo: un link roto debe llevar a algún
lado usable, no a la nada. El fallback SPA de nginx ya existía.

### El bus por `sessionStorage`, eliminado

`selectedStudyStorage.ts` conectaba la worklist con la sala de lectura por fuera de
React, con una clave de `sessionStorage` y un evento de `window`.

**Era la causa del doble clic**: la fila escribía el detalle *y* disparaba su propio
`fetchStudyDetail` en paralelo al de `App`. Las dos respuestas competían por la misma
clave y la sala de lectura leía la que llegara última.

Ahora la fila solo avisa qué estudio se eligió; `App` carga el detalle y lo pasa por
props. La limpieza de esa clave en el logout se conserva —documentada— para borrar
residuo de versiones anteriores.

---

## 7. Cuatro destinos

- **Lista de trabajo** — absorbió dashboard, estudios y cola.
- **Lectura** — no está en el menú porque no se navega a ella: se llega abriendo un
  estudio.
- **Paciente** — lista y detalle bajo el mismo destino, resueltos por URL.
- **Ajustes** — preferencias y ayuda en dos solapas. Eran dos entradas del menú para
  pantallas que el médico visita por el mismo motivo y casi nunca, ocupando lugares
  que compiten con donde realmente trabaja.

`help` dejó de ser un `ViewKey`.

---

## 8. Defectos encontrados y corregidos

- **Todas las mediciones mostraban el valor vacío.** `resultRows` normaliza "sin
  valor del revisor" a `""`, y el render usaba `??`, que solo cae con `null`.
- **Rótulo de medición triplicado** en `api.ts`, `studyApi.ts` y `StudyReviewView`.
  Unificado en `clinicalDisplay.ts`. Se agregó derivación desde el id canónico
  (`sagittal-vertebra_group-area` → `"vertebra_group area"`) para corridas
  persistidas sin `labelKey`: no se adivina el nombre clínico, se lo lee del
  identificador que ya lo contiene.
- **Tokens CSS inexistentes** (`--accent`, `--border-subtle`, `--text-strong`,
  `--fs-xs`, `--radius-sm`) resolvían a nada en `reading.css`. Auditados todos los
  `var()` contra `tokens.css`.
- **La lista de niveles se comprimía a 1 px** al crecer el panel: es una columna
  flex y le faltaba `flex: none`.
- **Los marcadores de la barra de cortes robaban ancho al slider** y caían
  desalineados; ahora van superpuestos al track.
- **Texto de ayuda obsoleto** que mandaba a "Estudios o Cola de revisión", dos
  vistas que ya no existen.

---

## Verificación

**337 pruebas, 0 fallos.** Suites nuevas:

- `reading-annotations-tests.mjs` (13) — que una anotación no se dibuje fuera de su
  corte, plano o serie, y que sin spacing nunca se rotule en mm.
- `routes-tests.mjs` (15) — que toda vista tenga ruta, que una ruta desconocida caiga
  en un lugar usable, que un `caseId` sobreviva ida y vuelta con caracteres
  escapados, y que el bus por `sessionStorage` no reaparezca.

**Recorrido en navegador** con `101_t2.mha`: deep link en frío a
`/estudio/CASE-SERIE-02`, un solo clic desde la lista, botón atrás, recorrido de la
serie sin parpadeo, medición de 38.3 mm persistida y recuperada tras recargar,
niveles L1-L2…L5-S1 con filtrado por nivel, y las dos solapas de Ajustes.

### Pruebas heredadas

Eliminar `AnalysisTimelineView` dejó 37 referencias a un archivo inexistente en 6
suites. Se revisaron una por una:

- **Reapuntadas** al drawer o a `buildReviewCorrections` las que custodian
  propiedades que siguen vivas (metadata clínica solo en la corrida y nunca en la
  carga, sin `subjectRef` en la metadata técnica, valor de IA en `beforeValue`).
- **Fortalecida** la de `canonicalRunToLegacyViewModel`: ahora recorre todo `src/`,
  porque la propiedad nunca dependió de un archivo.
- **Borradas, con el motivo escrito en el archivo**, las que describían markup del
  asistente (`reviewSaved`, "Iniciar nuevo análisis", el `<details>` del panel 3D, la
  coordinación de selección 2D↔3D). Afirmar que algún componente las cablea sería
  describir código que no existe.

---

## Presupuesto de CSS

`components.css` bajó de 4.321 a 3.553 líneas. Cada pantalla migrada estrena CSS
namespaceado (`worklist.css`, `reading.css`, `settings.css`, `shell.css`) en vez de
apilar otra capa de overrides.

---

## Lo que sigue pendiente

- **Adoptar `src/design/primitives.tsx`** — 11 primitivos, usados en un solo archivo.
  Es lo que evita que el rediseño se vuelva a desarmar cuando alguien agregue una
  pantalla.
- **Línea de referencia sag↔ax** — bloqueada por VOL-CONTRACT-04 en el AI Module.
- **Controles de visibilidad por clase** — deshabilitados mientras el overlay sea un
  PNG compuesto.
- **El plano axial no tiene semántica clínica** — sus clases son `raw_0`, `raw_50`…
- **El layout 1×2 nunca se probó con un estudio real de dos planos.**
- **Fase 5**, comparación entre estudios (diferida).
