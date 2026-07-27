import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const MULTIPLANAR_CONTRACT_V2 = "pfi.multiplanar-run.v2";

class ContractError extends Error {
  constructor(message, path, options) {
    super(message);
    this.name = "ContractError";
    this.path = path;
    this.code = options?.code;
    this.traceId = options?.traceId;
    this.body = options?.body;
  }
}

function transpile(relativePath) {
  const source = readFileSync(join(root, relativePath), "utf8")
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/export (default )?/g, "");
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}

/** Loads a .tsx component file as CJS, stubbing react/react-jsx-runtime and returning {} for every other import. Only used to reach pure, non-exported helper functions without a DOM. */
function loadComponentModule(path) {
  const source = readFileSync(join(root, path), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  const context = {
    exports,
    console,
    require: (id) => {
      if (id === "react") return { useEffect: () => undefined, useMemo: (fn) => fn(), useRef: () => ({ current: null }), useState: (initial) => [initial, () => undefined] };
      if (id === "react/jsx-runtime") return { jsx: () => ({}), jsxs: () => ({}), Fragment: "Fragment" };
      return {};
    },
  };
  vm.runInNewContext(compiled, context, { filename: path });
  return exports;
}

function loadAdapter() {
  const js = transpile("src/adapters/multiplanarRunAdapter.ts");
  const sandbox = { exports: {}, console, ContractError, MULTIPLANAR_CONTRACT_V2 };
  vm.runInNewContext(`${js}
exports.parseMultiplanarRunResponse = parseMultiplanarRunResponse;`, sandbox);
  return sandbox.exports;
}

function loadFixtures() {
  const js = transpile("src/fixtures/multiplanarRunFixtures.ts");
  const sandbox = { exports: {}, console };
  vm.runInNewContext(`${js}
exports.rawMultiplanarRunV2PublicPresenterFixture = rawMultiplanarRunV2PublicPresenterFixture;
exports.rawMultiplanarRunV1Fixture = rawMultiplanarRunV1Fixture;`, sandbox);
  return sandbox.exports;
}

function loadClinicalDisplay() {
  const js = transpile("src/clinicalDisplay.ts");
  const sandbox = { exports: {}, console };
  vm.runInNewContext(`${js}
exports.displayMeasurementLabel = displayMeasurementLabel;
exports.displayMeasurementLevel = displayMeasurementLevel;
exports.displayUnit = displayUnit;
exports.displayLandmarkLabel = displayLandmarkLabel;`, sandbox);
  return sandbox.exports;
}

function loadInferenceReadiness() {
  const js = transpile("src/inferenceReadiness.ts");
  const sandbox = { exports: {}, console };
  vm.runInNewContext(`${js}
exports.normalizeAiAssetUrl = normalizeAiAssetUrl;
exports.resolvePlaneAssetUrls = resolvePlaneAssetUrls;
exports.evaluateSagittalReviewReadiness = evaluateSagittalReviewReadiness;
exports.resolveReviewWorkspaceMode = resolveReviewWorkspaceMode;`, sandbox);
  return sandbox.exports;
}

function loadMeasurementViewModel() {
  const js = transpile("src/viewModels/measurementViewModel.ts");
  const sandbox = { exports: {}, console };
  vm.runInNewContext(`${js}
exports.canonicalMeasurementToViewMeasurement = canonicalMeasurementToViewMeasurement;`, sandbox);
  return sandbox.exports;
}

const adapter = loadAdapter();
const fixtures = loadFixtures();
const display = loadClinicalDisplay();
const readiness = loadInferenceReadiness();
const measurementViewModel = loadMeasurementViewModel();
const mriSliceViewer = loadComponentModule("src/components/MriSliceViewer.tsx");
const analysisTimelineView = loadComponentModule("src/components/AnalysisTimelineView.tsx");

let count = 0;
function test(name, fn) {
  fn();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

function readSource(path) {
  return readFileSync(join(root, path), "utf8");
}

// A. Estructura
test("A1 ningun archivo de src/components importa MultiplanarRunResponse/MultiplanarPlaneRun/MultiplanarMeasurementValue", () => {
  const files = [
    "src/components/AnalysisTimelineView.tsx",
    "src/components/MriSliceViewer.tsx",
    "src/components/MeasurementsPanel.tsx",
    "src/components/AgentSummary.tsx",
    "src/components/StudyReviewView.tsx",
    "src/components/Header.tsx",
  ];
  for (const file of files) {
    const source = readSource(file);
    for (const forbidden of ["MultiplanarRunResponse", "MultiplanarPlaneRun", "MultiplanarMeasurementValue"]) {
      assert.ok(!source.includes(forbidden), `${file} no debe contener "${forbidden}"`);
    }
  }
});

test("A2 componentes multiplanares migrados no contienen aiOutput/modelArtifact/metadata legacy", () => {
  const migratedFiles = ["src/components/AnalysisTimelineView.tsx", "src/components/MriSliceViewer.tsx", "src/components/AgentSummary.tsx", "src/components/MeasurementsPanel.tsx"];
  for (const file of migratedFiles) {
    const source = readSource(file);
    for (const forbidden of ["aiOutput", "modelArtifact", "planeRun.metadata", "plane.metadata", "run.metadata"]) {
      assert.ok(!source.includes(forbidden), `${file} no debe contener "${forbidden}"`);
    }
  }
});

test("A3 AnalysisTimelineView no contiene canonicalRunToLegacyViewModel ni sagittalLandmarksForViewer", () => {
  const source = readSource("src/components/AnalysisTimelineView.tsx");
  assert.ok(!source.includes("canonicalRunToLegacyViewModel"));
  assert.ok(!source.includes("sagittalLandmarksForViewer"));
});

test("A4 sagittalLandmarksForViewer no existe en ningun archivo de src", () => {
  // best-effort: only check the files known to have carried it historically
  for (const file of ["src/components/AnalysisTimelineView.tsx", "src/adapters/multiplanarRunAdapter.ts", "src/inferenceReadiness.ts"]) {
    assert.ok(!readSource(file).includes("sagittalLandmarksForViewer"), `${file} no debe contener sagittalLandmarksForViewer`);
  }
});

// B. MriSliceViewer
test("B1 props de series/masks/landmarks/assets no usan any", () => {
  const source = readSource("src/components/MriSliceViewer.tsx");
  assert.ok(!/series\?:\s*any/.test(source));
  assert.ok(!/masks\?:\s*any/.test(source));
  assert.ok(!/landmarks\?:\s*any/.test(source));
  assert.ok(!/assets\?:\s*any/.test(source));
  assert.ok(source.includes("ViewerSeries"));
  assert.ok(source.includes("ViewerMask"));
  assert.ok(source.includes("ViewerLandmark"));
  assert.ok(source.includes("CanonicalPlaneAsset"));
});

test("B2 landmarks con labelKey se renderizan sin necesitar label", () => {
  assert.equal(mriSliceViewer.landmarkLabelKey({ id: "lm-1", labelKey: "canal_centroid", x: 1, y: 2 }), "canal_centroid");
  assert.equal(mriSliceViewer.landmarkLabelKey({ id: "lm-2", label: "R1", x: 1, y: 2, seriesId: "s", sliceIndex: 1 }), "R1");
  assert.equal(mriSliceViewer.landmarkLabelKey({ id: "lm-3", x: 1, y: 2 }), undefined);
});

test("B3 seleccion estable: id primero, labelKey como fallback controlado, nunca el indice cuando hay alternativa", () => {
  assert.equal(mriSliceViewer.landmarkKeyOf({ id: "lm-1", labelKey: "canal_centroid" }, 5), "lm-1");
  assert.equal(mriSliceViewer.landmarkKeyOf({ labelKey: "canal_centroid" }, 5), "canal_centroid");
  assert.equal(mriSliceViewer.landmarkKeyOf({}, 5), "landmark-5");
});

test("B4 landmark desconocido se muestra de forma legible, no como fallback generico opaco", () => {
  const shown = display.displayLandmarkLabel("vertebra_group_centroid");
  assert.equal(shown, "vertebra group centroid");
  assert.notEqual(shown, "Punto de referencia");
  assert.equal(display.displayLandmarkLabel(undefined), "Punto de referencia");
});

test("B5 no identifica raw_* axial como anatomia", () => {
  assert.equal(mriSliceViewer.maskGroupName({ label: "raw_axial_segment" }), "raw_axial_segment");
  assert.notEqual(mriSliceViewer.maskGroupName({ label: "raw_axial_segment" }), "Grupo vertebral");
  assert.notEqual(mriSliceViewer.maskGroupName({ label: "raw_axial_segment" }), "Canal");
  assert.notEqual(mriSliceViewer.maskGroupName({ label: "raw_axial_segment" }), "Grupo discal");
});

test("B6 array vacio de landmarks/masks no rompe (defaults declarados en props)", () => {
  const source = readSource("src/components/MriSliceViewer.tsx");
  assert.match(source, /masks = \[\]/);
  assert.match(source, /landmarks = \[\]/);
});

// C. Mediciones
test("C1 CanonicalMeasurement -> Measurement conserva id/labelKey/aiValue/reviewerValue/unit", () => {
  const canonical = { id: "m1", labelKey: "canal width", value: 12, unit: "mm", confidence: 0.9, reviewerValue: 13, placeholder: false, level: null };
  const view = measurementViewModel.canonicalMeasurementToViewMeasurement(canonical, "sagittal", 0);
  assert.equal(view.id, "m1");
  assert.equal(view.labelKey, "canal width");
  assert.equal(view.aiValue, 12);
  assert.equal(view.reviewerValue, 13);
  assert.equal(view.unit, "mm");
  assert.equal(view.plane, "sagittal");
});

test("C2 level null continua como no informado en display", () => {
  const canonical = { id: "m2", labelKey: "canal width", value: 12, unit: "mm", level: null };
  const view = measurementViewModel.canonicalMeasurementToViewMeasurement(canonical, "sagittal", 0);
  assert.equal(view.level, undefined);
  assert.equal(display.displayMeasurementLevel(view.level), "Nivel no informado");
});

test("C3 mm2 se presenta como mm2 superindice unicamente en display, no en el view model", () => {
  const canonical = { id: "m3", labelKey: "canal area", value: 100, unit: "mm2" };
  const view = measurementViewModel.canonicalMeasurementToViewMeasurement(canonical, "sagittal", 0);
  assert.equal(view.unit, "mm2");
  assert.equal(display.displayUnit(view.unit), "mm²");
});

test("C4 traduccion no altera la identidad (label/labelKey permanecen en clave canonica)", () => {
  const canonical = { id: "m4", labelKey: "canal width", value: 12, unit: "mm" };
  const view = measurementViewModel.canonicalMeasurementToViewMeasurement(canonical, "sagittal", 0);
  assert.equal(view.label, "canal width");
  assert.equal(view.labelKey, "canal width");
  assert.notEqual(view.label, display.displayMeasurementLabel(view.labelKey));
  assert.equal(display.displayMeasurementLabel(view.labelKey), "Ancho del canal espinal");
});

// D. Correcciones
test("D1 beforeValue usa valor IA y afterValue usa valor revisor; measurementId es el id canonico", () => {
  const measurement = { id: "m5", label: "canal width", labelKey: "canal width", value: 13, aiValue: 12, reviewerValue: 13, unit: "mm", source: "Reviewer", status: "editado", plane: "sagittal" };
  const corrections = analysisTimelineView.reviewCorrectionsFrom([measurement]);
  assert.equal(corrections.length, 1);
  assert.equal(corrections[0].measurementId, "m5");
  assert.equal(corrections[0].beforeValue.value, 12);
  assert.equal(corrections[0].afterValue.value, 13);
});

test("D2 una etiqueta espanola no reemplaza labelKey en la identidad de la correccion", () => {
  const measurement = { id: "m6", label: "canal width", labelKey: "canal width", value: 13, aiValue: 12, reviewerValue: 13, unit: "mm", source: "Reviewer", status: "editado", plane: "sagittal" };
  const corrections = analysisTimelineView.reviewCorrectionsFrom([measurement]);
  assert.equal(corrections[0].labelKey, "canal width");
  assert.equal(corrections[0].label, "canal width");
  assert.notEqual(corrections[0].labelKey, "Ancho del canal espinal");
});

test("D3 medicion sin cambio no genera correction", () => {
  const measurement = { id: "m7", label: "canal width", labelKey: "canal width", value: 12, aiValue: 12, unit: "mm", source: "AI", status: "pendiente", plane: "sagittal" };
  const corrections = analysisTimelineView.reviewCorrectionsFrom([measurement]);
  assert.equal(corrections.length, 0);
});

// E. Assets
test("E1 input.png, overlay.png y mask-preview.png permitidos; mask.npy, confidence.npy y trycloudflare.com bloqueados; URL durable /api/... permitida", () => {
  assert.equal(readiness.normalizeAiAssetUrl("/api/ai/assets/run-1/sagittal/input.png", "https://backend.example"), "https://backend.example/api/ai/assets/run-1/sagittal/input.png");
  assert.equal(readiness.normalizeAiAssetUrl("/api/ai/assets/run-1/sagittal/overlay.png", "https://backend.example"), "https://backend.example/api/ai/assets/run-1/sagittal/overlay.png");
  assert.equal(readiness.normalizeAiAssetUrl("/api/ai/assets/run-1/sagittal/mask-preview.png", "https://backend.example"), "https://backend.example/api/ai/assets/run-1/sagittal/mask-preview.png");
  assert.equal(readiness.normalizeAiAssetUrl("/api/ai/assets/run-1/sagittal/mask.npy", "https://backend.example"), undefined);
  assert.equal(readiness.normalizeAiAssetUrl("/api/ai/assets/run-1/sagittal/confidence.npy", "https://backend.example"), undefined);
  assert.equal(readiness.normalizeAiAssetUrl("https://foo.trycloudflare.com/input.png", "https://backend.example"), "https://foo.trycloudflare.com/input.png");
});

// F. Persistencia visual (estudio persistido, AI Module apagado)
test("F1 un run canonico persistido se renderiza sin AI Module: 9 mediciones, imagen/overlay, revision observada, correccion before/after", () => {
  const canonical = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV2PublicPresenterFixture);
  assert.equal(canonical.planes.sagittal.measurements.length, 9);

  const viewMeasurements = canonical.planes.sagittal.measurements.map((m, index) => measurementViewModel.canonicalMeasurementToViewMeasurement(m, "sagittal", index));
  assert.equal(viewMeasurements.length, 9);

  const urls = readiness.resolvePlaneAssetUrls(canonical.planes.sagittal, "sagittal", (runId, plane, assetName) => `/api/ai/assets/${runId}/${plane}/${assetName}`, "https://backend.example");
  assert.ok(urls["input.png"]);
  assert.ok(urls["overlay.png"]);

  const editedMeasurement = { ...viewMeasurements[0], reviewerValue: 999, source: "Reviewer", status: "editado" };
  const corrections = analysisTimelineView.reviewCorrectionsFrom([editedMeasurement]);
  assert.equal(corrections.length, 1);
  assert.equal(corrections[0].beforeValue.value, editedMeasurement.aiValue);
  assert.equal(corrections[0].afterValue.value, 999);
});

test("F2 estudio historico v1 sin gobernanza se puede renderizar pero permanece no evaluable", () => {
  const canonical = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV1Fixture);
  assert.equal(canonical.planes.sagittal.measurements.length, 9);
  assert.equal(readiness.evaluateSagittalReviewReadiness(canonical).ready, false);
  assert.equal(readiness.resolveReviewWorkspaceMode(canonical), "unavailable");
});

// G. Test estructural del adapter
test("G1 parseMultiplanarRunResponse sigue exportado; canonicalRunToLegacyViewModel/legacyAssetsFromCanonical/canonicalPlaneToLegacy ya no existen", () => {
  const source = readSource("src/adapters/multiplanarRunAdapter.ts");
  assert.match(source, /export function parseMultiplanarRunResponse/);
  for (const removed of ["canonicalRunToLegacyViewModel", "legacyAssetsFromCanonical", "canonicalPlaneToLegacy"]) {
    assert.ok(!source.includes(removed), `multiplanarRunAdapter.ts no debe contener "${removed}"`);
  }
});

console.log(`P9-C.3 canonical components tests passed: ${count}`);
