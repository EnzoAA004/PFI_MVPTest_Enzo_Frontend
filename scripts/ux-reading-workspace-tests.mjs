import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function loadPureSource(source, exportNames) {
  const stripped = source
    .replace(/import\s+(?:type\s+)?[\s\S]*?\s+from\s+"[^"]+";\s*/g, "")
    .replace(/export /g, "");
  const js = ts.transpileModule(stripped, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const sandbox = { exports: {}, console };
  vm.runInNewContext(`${js}\n${exportNames.map((name) => `exports.${name} = ${name};`).join("\n")}`, sandbox);
  return sandbox.exports;
}

const layoutSource = readFileSync("src/features/reading/readingWorkspaceLayout.ts", "utf8");
const layout = loadPureSource(layoutSource, ["viewportBindingsFor", "layoutPresetAvailable"]);
const sliceSourceCode = readFileSync("src/features/reading/analyzedSliceSource.ts", "utf8");
const sliceSource = loadPureSource(sliceSourceCode, ["resolveAnalyzedSliceSource"]);
const appSource = readFileSync("src/App.tsx", "utf8");
const shellSource = readFileSync("src/components/AppShell.tsx", "utf8");
const reviewSource = readFileSync("src/components/StudyReviewView.tsx", "utf8");
const viewportSource = readFileSync("src/features/reading/PlaneViewport.tsx", "utf8");
const gridSource = readFileSync("src/features/reading/ViewportGrid.tsx", "utf8");
const cssSource = readFileSync("src/features/reading/reading.css", "utf8");

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

const available = {
  activePlane: "sagittal",
  axialAvailable: true,
  sagittalT1InputId: "series-t1",
  sagittalT2InputId: "series-t2",
};

check("la ruta de revisión activa AppShell inmersivo", () => {
  assert.match(appSource, /immersive=\{activeView === "review"\}/);
  assert.match(shellSource, /immersive \? " is-immersive"/);
});

/*
 * La identidad del revisor dejó de renderizarse como una barra propia sobre el
 * contenido y pasó a vivir al pie de la navegación, así que ya no hay un
 * `{!immersive && <Header` suelto: el Header viaja como `identity` del Sidebar.
 *
 * Lo que el test protege no cambia —que al entrar en revisión no quede ni la
 * navegación ni la identidad ocupando pantalla, y que al salir vuelvan las
 * dos—; ahora alcanza con una sola condición porque una contiene a la otra.
 */
check("salir de revisión restaura Sidebar y Header normales", () => {
  assert.match(shellSource, /\{!immersive && \([\s\S]*<Sidebar/);
  assert.match(shellSource, /identity=\{<Header/);
  assert.doesNotMatch(shellSource, /<main className="main-panel">\s*\{!immersive && <Header/);
  assert.match(shellSource, /localStorage\.setItem\(RAIL_STORAGE_KEY, collapsed/);
  assert.doesNotMatch(shellSource, /localStorage\.setItem\([^\n]*immersive/);
});

check("Lectura conserva el binding del plano activo", () => {
  const bindings = layout.viewportBindingsFor("reading", available);
  assert.deepEqual(JSON.parse(JSON.stringify(bindings)), [{ id: "sagittal", plane: "sagittal", role: "analyzed" }]);
});

check("Sagital + Axial usa bindings correctos e independientes", () => {
  const bindings = layout.viewportBindingsFor("sagittal-axial", available);
  assert.deepEqual(Array.from(bindings, (item) => `${item.id}:${item.plane}`), ["sagittal:sagittal", "axial:axial"]);
});

check("T1 + T2 usa las dos series reales con keys independientes", () => {
  const bindings = layout.viewportBindingsFor("t1-t2", available);
  assert.deepEqual(Array.from(bindings, (item) => item.defaultSeriesInputId), ["series-t1", "series-t2"]);
  assert.notEqual(bindings[0].id, bindings[1].id);
});

check("modalidad faltante deshabilita T1 + T2 y cae en Lectura", () => {
  const missing = { ...available, sagittalT1InputId: undefined };
  assert.equal(layout.layoutPresetAvailable("t1-t2", missing), false);
  assert.equal(layout.viewportBindingsFor("t1-t2", missing).length, 1);
});

check("cambiar preset no mueve ownership de selectedLevel ni inspector tab", () => {
  assert.match(reviewSource, /const \[panelTab, setPanelTab\] = useState<ReviewInspectorTab>/);
  assert.match(reviewSource, /const \[selectedLevel, setSelectedLevel\] = useState<string \| null>/);
  const selector = reviewSource.slice(reviewSource.indexOf("function selectLayoutPreset"), reviewSource.indexOf("function activateViewport"));
  assert.doesNotMatch(selector, /setPanelTab|setSelectedLevel/);
});

check("no existe sincronización de sliceIndex entre bindings", () => {
  assert.match(reviewSource, /\[bindingId\]: clampSlice/);
  assert.doesNotMatch(reviewSource, /sagittalSlice\s*===\s*axialSlice|sliceIndex A|setSliceByPlane\([^\n]*sagittal[^\n]*axial/);
});

check("el corte IA conserva el input.png canónico", () => {
  assert.equal(sliceSource.resolveAnalyzedSliceSource({
    apiBaseUrl: "https://backend.example",
    sourceInputId: "sagittal-input",
    index: 7,
    aiIndex: 7,
  }), undefined);
});

check("los cortes adyacentes usan el inputId exacto de la serie analizada", () => {
  assert.equal(sliceSource.resolveAnalyzedSliceSource({
    apiBaseUrl: "https://backend.example",
    sourceInputId: "input con espacio",
    index: 6,
    aiIndex: 7,
  }), "https://backend.example/api/ai/series/input%20con%20espacio/slices/6");
  assert.match(reviewSource, /sourceInputId = typeof metadata\.inputId/);
  assert.match(reviewSource, /sourceInputId: analyzedSeries\.sourceInputId/);
});

check("los stacks sagital y axial resuelven fuentes independientes", () => {
  const sagittal = sliceSource.resolveAnalyzedSliceSource({ apiBaseUrl: "https://backend.example", sourceInputId: "sag", index: 5, aiIndex: 7 });
  const axial = sliceSource.resolveAnalyzedSliceSource({ apiBaseUrl: "https://backend.example", sourceInputId: "ax", index: 5, aiIndex: 6 });
  assert.match(sagittal, /\/series\/sag\/slices\/5$/);
  assert.match(axial, /\/series\/ax\/slices\/5$/);
  assert.notEqual(sagittal, axial);
});

check("corridas antiguas sin inputId conservan previews declaradas", () => {
  assert.equal(sliceSource.resolveAnalyzedSliceSource({
    apiBaseUrl: "https://backend.example",
    index: 3,
    aiIndex: 4,
    legacyInputUrl: "https://backend.example/api/ai/assets/run/sagittal/input.png",
    legacyPreviewCount: 5,
  }), "https://backend.example/api/ai/assets/run/sagittal/slice-003.png");
});

check("IDs y selección de mediciones permanecen intactos", () => {
  assert.match(reviewSource, /selectedMeasurementId=\{figureIdOf\(selectedMeasurementId\)\}/);
  assert.match(reviewSource, /onSelectMeasurement=\{\(id\) => setSelectedMeasurementId/);
  assert.doesNotMatch(layoutSource, /measurement|row\.id/);
});

check("Proxy 3D queda accesible únicamente como función secundaria", () => {
  assert.match(reviewSource, /<summary>Reconstrucción 3D<\/summary>/);
  assert.match(reviewSource, /Abrir reconstrucción 3D/);
  assert.doesNotMatch(reviewSource, /aria-label="Series del estudio"/);
});

check("información técnica sigue accesible y sale del chrome del viewport", () => {
  assert.match(reviewSource, /<summary>Técnico<\/summary>/);
  assert.match(reviewSource, /Modo efectivo/);
  assert.doesNotMatch(viewportSource, /modelLabel|inferenceLabel/);
  assert.match(viewportSource, /\{displayParams\}/);
});

check("una serie de referencia no recibe overlays ni geometría analizada", () => {
  assert.match(reviewSource, /masks: viewed \? \[\] : masksForPlane/);
  assert.match(reviewSource, /orientation=\{viewed \? null : orientationFor/);
  assert.match(reviewSource, /referenceLine=\{viewed \? null/);
});

check("toolbars permanecen accesibles sin scrollbar invisible", () => {
  assert.match(reviewSource, /<ReadingWorkspaceToolbar>/);
  assert.match(reviewSource, /<summary>Edición avanzada<\/summary>/);
  assert.match(cssSource, /scrollbar-width: thin/);
  assert.doesNotMatch(cssSource, /viewer-controls::-[\s\S]{0,120}display: none/);
});

check("desktop 1366 muestra ambos presets duales en columnas", () => {
  assert.match(gridSource, /preset === "reading" \? "single" : "dual"/);
  assert.match(cssSource, /clamp\(340px, 22vw, 420px\)/);
  assert.match(cssSource, /@media \(min-width: 1280px\)[\s\S]*?\.rr-stage\[data-layout="dual"\][\s\S]*?grid-template-columns:\s*1fr 1fr/);
  assert.doesNotMatch(cssSource, /@media \(min-width: 1600px\)[\s\S]*?\.rr-stage\[data-layout="dual"\]/);
  assert.match(cssSource, /@media \(max-width: 1399px\)/);
  assert.match(cssSource, /@media \(max-width: 1023px\)/);
  assert.match(cssSource, /height: 100dvh/);
});

check("governance global permanece en el workspace", () => {
  assert.match(reviewSource, /<WorkspaceGovernanceNotice \/>/);
  assert.doesNotMatch(viewportSource, /No apto para diagnóstico clínico/);
});

console.log(`ux-reading-workspace: ${passed} passed`);
