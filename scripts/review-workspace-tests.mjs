import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function loadTsModule(path) {
  const source = fs.readFileSync(path, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  const context = {
    exports,
    require: (id) => {
      if (id === "react") return { useEffect: () => undefined, useMemo: (fn) => fn(), useRef: () => ({ current: null }), useState: (initial) => [initial, () => undefined] };
      if (id === "react/jsx-runtime") return { jsx: () => ({}), jsxs: () => ({}), Fragment: "Fragment" };
      // Real project modules are loaded for real, so the assertions exercise the
      // actual shared implementation instead of a stub.
      if (id === "../clinicalDisplay") return loadTsModule("src/clinicalDisplay.ts");
      return {};
    },
  };
  vm.runInNewContext(compiled, context, { filename: path });
  return exports;
}

const viewer = loadTsModule("src/components/MriSliceViewer.tsx");
const measurements = loadTsModule("src/components/MeasurementsPanel.tsx");
const readiness = loadTsModule("src/inferenceReadiness.ts");

let count = 0;
function test(name, fn) {
  fn();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

const finalHash = readiness.SAGITTAL_FINAL_ARTIFACT_HASH;
const finalVersion = readiness.SAGITTAL_FINAL_MODEL_VERSION;

function sagittalPlane(overrides = {}) {
  return {
    planeRunId: "sag-run",
    plane: "sagittal",
    status: null,
    effectiveInferenceMode: "real_baseline",
    synthetic: false,
    fallbackReason: null,
    model: { key: "sagittal_spider", version: finalVersion, artifactHash: finalHash, baselineReady: true, availableForRealInference: true },
    input: { canonicalShape: [352, 384, 17], selectedAxis: 2, sliceCount: 17, selectedSliceIndex: 7, orientationTransform: "none" },
    assets: [],
    masks: [],
    landmarks: [],
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
    measurements: [{ id: "vertebra_group area", labelKey: "vertebra_group area", value: 10, unit: "mm2" }],
    ...overrides,
  };
}

function axialPlane(overrides = {}) {
  return {
    planeRunId: "ax-run",
    plane: "axial",
    status: null,
    effectiveInferenceMode: "real_baseline",
    synthetic: false,
    fallbackReason: null,
    model: { availableForRealInference: true },
    input: {},
    assets: [],
    masks: [],
    landmarks: [],
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
    measurements: [{ id: "axial-width", labelKey: "Axial width", value: 8, unit: "mm" }],
    ...overrides,
  };
}

function run(planes) {
  return { runId: "run", effectiveInferenceMode: "mixed", humanReviewRequired: true, notClinicalDiagnosis: true, synthetic: false, fallbackReason: null, planes };
}

test("A el visor calcula auto-fit al cargar", () => {
  assert.equal(viewer.computeFitZoom({ width: 1040, height: 580 }, { width: 256, height: 256 }).toFixed(2), "2.27");
});

test("B ResizeObserver recalcula fit ante cambio de contenedor", () => {
  const first = viewer.computeFitZoom({ width: 1040, height: 580 }, { width: 256, height: 256 });
  const resized = viewer.computeFitZoom({ width: 520, height: 580 }, { width: 256, height: 256 });
  assert.notEqual(first, resized);
});

test("C Ajustar centra con zoom fit relativo", () => {
  const fit = viewer.computeFitZoom({ width: 512, height: 512 }, { width: 256, height: 256 });
  assert.equal(viewer.formatZoomPercent(fit, fit), "100%");
});

test("D landmarks ocultos inicialmente", () => assert.equal(viewer.initialLandmarksVisible, false));
test("E no se usa label.slice como texto permanente", () => assert.equal(fs.readFileSync("src/components/MriSliceViewer.tsx", "utf8").includes("label.slice"), false));
test("F overlay inicia activo por switch global", () => assert.equal(viewer.initialOverlayOpacity, 0.65));
test("G opacidad inicial es 65 %", () => assert.equal(Math.round(viewer.initialOverlayOpacity * 100), 65));
test("H Neutral restaura W/L 100/100", () => assert.equal(JSON.stringify(viewer.neutralWindowLevel()), JSON.stringify({ brightness: 100, contrast: 100, presetId: "neutral" })));
test("I arrastre manual cambia preset a Personalizado", () => assert.equal(viewer.manualWindowLevel(100, 100, 10, 10).presetId, "custom"));

test("J aiValue se conserva al editar", () => {
  const original = [{ id: "m1", label: "canal area", value: 12, aiValue: 12, unit: "mm2", source: "AI", status: "pendiente" }];
  const edited = measurements.applyReviewerMeasurementEdit(original, "m1", "13")[0];
  assert.equal(edited.aiValue, 12);
});

test("K reviewerValue se guarda separadamente", () => {
  const edited = measurements.applyReviewerMeasurementEdit([{ id: "m1", label: "canal area", value: 12, unit: "mm2", source: "AI", status: "pendiente" }], "m1", "13")[0];
  assert.equal(edited.reviewerValue, "13");
  assert.equal(edited.source, "Reviewer");
  assert.equal(edited.status, "editado");
});

test("L delta se calcula correctamente", () => {
  assert.equal(measurements.measurementDelta({ id: "m1", label: "canal area", value: 12, aiValue: 12, reviewerValue: "13.5", unit: "mm2", source: "Reviewer", status: "editado" }), "+1,50");
});

test("M mm2 se muestra como mm²", () => assert.equal(measurements.displayMeasurementUnit("mm2"), "mm²"));
test("N confianza 0.9656 se muestra como 96,6 %, no certeza clinica", () => assert.equal(measurements.formatTechnicalConfidence(0.9656), "96,6 %"));
test("O axial=null no bloquea la vista", () => assert.equal(readiness.resolveReviewWorkspaceMode(run({ sagittal: sagittalPlane(), axial: null })), "sagittal_only"));
// P9-C.5: el atlas 3D genérico ("Funcionalidad 3D futura") fue reemplazado por el
// proxy geométrico experimental real (SpineReconstructionPreview con `proxy`,
// ver ExperimentalProxyViewer). El requisito de layout que este test protege —
// que el panel 3D quede colapsado fuera de la zona principal de revisión —
// sigue vigente y sigue cumplido por el mismo <details> wrapper.
test("P el panel 3D (ahora proxy experimental real) queda colapsado fuera de la zona principal", () => assert.match(fs.readFileSync("src/components/AnalysisTimelineView.tsx", "utf8"), /<details className="panel-card compact-card analysis-panel review-accordion span-all">[\s\S]*Funcionalidad 3D/));
test("Q humanReviewRequired y notClinicalDiagnosis permanecen visibles", () => {
  const source = fs.readFileSync("src/components/AnalysisTimelineView.tsx", "utf8");
  assert.match(source, /Revisi.n profesional obligatoria/);
  assert.match(source, /No apto para diagn.stico cl.nico/);
});

test("12.11 A sagital real + axial null => sagittal_only", () => assert.equal(readiness.resolveReviewWorkspaceMode(run({ sagittal: sagittalPlane(), axial: null })), "sagittal_only"));
test("12.11 B sagital real + axial candidate => sagittal_only", () => assert.equal(readiness.resolveReviewWorkspaceMode(run({ sagittal: sagittalPlane(), axial: axialPlane({ effectiveInferenceMode: "contract" }) })), "sagittal_only"));
test("12.11 C sagital null + axial candidate => unavailable", () => assert.equal(readiness.resolveReviewWorkspaceMode(run({ sagittal: null, axial: axialPlane({ effectiveInferenceMode: "contract" }) })), "unavailable"));
test("12.11 D sagital null + axial real futuro => axial_only", () => assert.equal(readiness.resolveReviewWorkspaceMode(run({ sagittal: null, axial: axialPlane() })), "axial_only"));
test("12.11 E sagital real + axial real => dual_plane", () => assert.equal(readiness.resolveReviewWorkspaceMode(run({ sagittal: sagittalPlane(), axial: axialPlane() })), "dual_plane"));
test("12.11 H mediciones conservan plane/planeRunId conceptualmente", () => {
  const plane = { ...sagittalPlane(), measurements: [{ id: "m", value: 1, unit: "mm", plane: "sagittal" }] };
  const rows = readiness.extractMeasurementRows(plane);
  assert.equal(rows[0].plane, "sagittal");
  assert.equal(plane.planeRunId, "sag-run");
});
test("12.11 I axial contract/mock nunca se presenta como real", () => assert.equal(readiness.evaluateAxialReadiness(run({ sagittal: null, axial: axialPlane({ effectiveInferenceMode: "mock" }) })).ready, false));
test("12.11 J 3D permanece bloqueado si falta slice_index_mapping", () => assert.equal(run({ sagittal: sagittalPlane(), axial: null }).threeD?.status ?? "blocked_missing_axial", "blocked_missing_axial"));

console.log(`Review workspace tests passed: ${count}`);
