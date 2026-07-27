import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync("src/inferenceReadiness.ts", "utf8")
  .replace(/^import[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "")
  .replace(/export /g, "");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sandbox = { exports: {}, console, require: () => ({}) };
vm.runInNewContext(`${compiled}
exports.SAGITTAL_FINAL_ARTIFACT_HASH = SAGITTAL_FINAL_ARTIFACT_HASH;
exports.SAGITTAL_FINAL_MODEL_KEY = SAGITTAL_FINAL_MODEL_KEY;
exports.SAGITTAL_FINAL_MODEL_VERSION = SAGITTAL_FINAL_MODEL_VERSION;
exports.evaluateAxialReadiness = evaluateAxialReadiness;
exports.evaluateDualReadiness = evaluateDualReadiness;
exports.evaluateRealInferenceReadiness = evaluateRealInferenceReadiness;
exports.evaluateSagittalReadiness = evaluateSagittalReadiness;
exports.evaluateSagittalReviewReadiness = evaluateSagittalReviewReadiness;
exports.extractMeasurementRows = extractMeasurementRows;
exports.isRealPlaneRun = isRealPlaneRun;
exports.normalizeAiAssetUrl = normalizeAiAssetUrl;
exports.readSpiderRuntimeMetadata = readSpiderRuntimeMetadata;
exports.resolvePlaneAssetUrls = resolvePlaneAssetUrls;
exports.resolvePlaneInferenceMode = resolvePlaneInferenceMode;
exports.resolveWorkspaceInferenceMode = resolveWorkspaceInferenceMode;`, sandbox);
const exports = sandbox.exports;

const {
  SAGITTAL_FINAL_ARTIFACT_HASH,
  SAGITTAL_FINAL_MODEL_KEY,
  SAGITTAL_FINAL_MODEL_VERSION,
  evaluateAxialReadiness,
  evaluateDualReadiness,
  evaluateRealInferenceReadiness,
  evaluateSagittalReadiness,
  evaluateSagittalReviewReadiness,
  extractMeasurementRows,
  isRealPlaneRun,
  normalizeAiAssetUrl,
  readSpiderRuntimeMetadata,
  resolvePlaneAssetUrls,
  resolvePlaneInferenceMode,
  resolveWorkspaceInferenceMode,
} = exports;

let count = 0;
function test(name, fn) {
  fn();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

// P9-C.2: inferenceReadiness.ts now consumes CanonicalPlaneRun / CanonicalMultiplanarRun
// exclusively. Fixtures below are canonical-shaped (model/input/assets as lists, no
// aiOutput/modelArtifact/metadata aliases) — the raw-payload alias resolution now lives
// only in src/adapters/multiplanarRunAdapter.ts and is covered by its own test suite.

const realRuntimeInput = {
  inputId: "inp-sag",
  nativeShape: [352, 384, 17],
  canonicalShape: [352, 384, 17],
  orientationTransform: "none",
  selectedAxis: 2,
  sliceCount: 17,
  selectedSliceIndex: 7,
};

const legacySpiderInput = {
  inputId: "inp-sag",
  nativeShape: [17, 512, 512],
  canonicalShape: [512, 512, 17],
  orientationTransform: "move_axis_0_to_last",
  selectedAxis: 2,
  sliceCount: 17,
  selectedSliceIndex: 8,
  inPlaneSpacingMm: [0.8, 0.8],
};

const measurement = { id: "m1", labelKey: "canal width", value: 12, unit: "mm" };
const nineMeasurements = Array.from({ length: 9 }, (_, index) => ({ id: `m${index + 1}`, labelKey: `measurement${index + 1}`, value: 10 + index, unit: "mm" }));

function sagittalFinal(overrides = {}) {
  return {
    planeRunId: "sag-run",
    plane: "sagittal",
    status: null,
    effectiveInferenceMode: "real_baseline",
    synthetic: false,
    fallbackReason: null,
    model: {
      key: SAGITTAL_FINAL_MODEL_KEY,
      version: SAGITTAL_FINAL_MODEL_VERSION,
      artifactHash: SAGITTAL_FINAL_ARTIFACT_HASH,
      baselineReady: true,
      availableForRealInference: true,
    },
    input: realRuntimeInput,
    assets: [
      { assetName: "input.png", url: "/api/ai/assets/sag-run/sagittal/input.png" },
      { assetName: "overlay.png", url: "/api/ai/assets/sag-run/sagittal/overlay.png" },
    ],
    series: [{ plane: "sagittal", imageUrl: "/api/ai/assets/sag-run/sagittal/input.png", overlayUrl: "/api/ai/assets/sag-run/sagittal/overlay.png" }],
    masks: [],
    landmarks: [],
    measurements: [measurement],
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
    ...overrides,
  };
}

function axialReal(overrides = {}) {
  return {
    planeRunId: "ax-run",
    plane: "axial",
    status: null,
    effectiveInferenceMode: "real_baseline",
    synthetic: false,
    fallbackReason: null,
    model: { availableForRealInference: true },
    input: { inputId: "inp-ax" },
    assets: [],
    masks: [],
    landmarks: [],
    measurements: [measurement],
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
    ...overrides,
  };
}

function realRun({ sagittal = sagittalFinal(), axial = axialReal(), rootMode = "real_baseline" } = {}) {
  return {
    runId: "multi-run",
    effectiveInferenceMode: rootMode,
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
    synthetic: false,
    fallbackReason: null,
    degradedMode: false,
    planes: { sagittal, ...(axial === null ? { axial: undefined } : { axial }) },
  };
}

test("effectiveInferenceMode real_baseline", () => assert.equal(resolvePlaneInferenceMode({ effectiveInferenceMode: " real_baseline " }), "real_baseline"));
test("no busca alias inferenceMode", () => assert.equal(resolvePlaneInferenceMode({ inferenceMode: "REAL" }), undefined));
test("no busca alias aiOutput.inferenceMode", () => assert.equal(resolvePlaneInferenceMode({ aiOutput: { inferenceMode: "real_baseline" } }), undefined));
test("no busca alias aiOutput.status real_baseline_ready", () => assert.equal(resolvePlaneInferenceMode({ aiOutput: { status: "real_baseline_ready" } }), undefined));
test("no busca alias metadata.inferenceMode", () => assert.equal(resolvePlaneInferenceMode({ metadata: { inferenceMode: "real" } }), undefined));
test("contract no es real", () => assert.equal(isRealPlaneRun({ effectiveInferenceMode: "contract", model: {} }), false));
test("mixed no es real", () => assert.equal(isRealPlaneRun({ effectiveInferenceMode: "mixed", model: {} }), false));
test("synthetic distinto de false no es real", () => assert.equal(isRealPlaneRun({ effectiveInferenceMode: "real", synthetic: true, model: { availableForRealInference: true } }), false));
test("synthetic null no es real", () => assert.equal(isRealPlaneRun({ effectiveInferenceMode: "real", synthetic: null, model: { availableForRealInference: true } }), false));
test("fallbackReason informado bloquea", () => assert.equal(isRealPlaneRun({ effectiveInferenceMode: "real", synthetic: false, fallbackReason: "modelo no disponible", model: { availableForRealInference: true } }), false));
test("availableForRealInference=false bloquea", () => assert.equal(isRealPlaneRun({ effectiveInferenceMode: "real", synthetic: false, fallbackReason: null, model: { availableForRealInference: false } }), false));

test("A native [17,512,512] canonical [512,512,17] move_axis_0_to_last habilita", () => {
  const run = realRun({ sagittal: sagittalFinal({ input: legacySpiderInput }) });
  assert.equal(readSpiderRuntimeMetadata(run.planes.sagittal).orientationExpected, true);
  assert.equal(evaluateSagittalReadiness(run).ready, true);
});

test("B native/canonical [352,384,17] axis 2 transform none habilita", () => {
  const run = realRun();
  assert.equal(readSpiderRuntimeMetadata(run.planes.sagittal).orientationExpected, true);
  assert.equal(evaluateSagittalReadiness(run).ready, true);
});

test("C selectedSliceIndex fuera de rango bloquea", () => {
  const run = realRun({ sagittal: sagittalFinal({ input: { ...realRuntimeInput, selectedSliceIndex: 17 } }) });
  assert.equal(readSpiderRuntimeMetadata(run.planes.sagittal).selectedSliceOutOfRange, true);
  assert.equal(evaluateSagittalReadiness(run).ready, false);
});

test("D selectedAxis invalido bloquea", () => {
  const run = realRun({ sagittal: sagittalFinal({ input: { ...realRuntimeInput, selectedAxis: 3 } }) });
  assert.equal(evaluateSagittalReadiness(run).ready, false);
});

test("E canonicalShape[selectedAxis] distinto de sliceCount bloquea", () => {
  const run = realRun({ sagittal: sagittalFinal({ input: { ...realRuntimeInput, canonicalShape: [352, 384, 16] } }) });
  assert.equal(evaluateSagittalReadiness(run).ready, false);
});

test("F hash incorrecto bloquea", () => {
  assert.equal(evaluateSagittalReadiness(realRun({ sagittal: sagittalFinal({ model: { ...sagittalFinal().model, artifactHash: "bad" } }) })).ready, false);
});

test("G contract/mock/fallback bloquean", () => {
  assert.equal(evaluateSagittalReviewReadiness(realRun({ sagittal: sagittalFinal({ effectiveInferenceMode: "contract" }), rootMode: "mixed" })).ready, false);
  assert.equal(evaluateSagittalReviewReadiness(realRun({ sagittal: sagittalFinal({ effectiveInferenceMode: "mock" }), rootMode: "mixed" })).ready, false);
  assert.equal(evaluateSagittalReviewReadiness(realRun({ sagittal: sagittalFinal({ status: "fallback" }), rootMode: "mixed" })).ready, false);
});

test("H planes.axial ausente no bloquea evaluacion sagital", () => {
  const run = realRun({ axial: null, rootMode: "mixed" });
  assert.equal(evaluateDualReadiness(run).ready, false);
  assert.equal(evaluateRealInferenceReadiness(run).ready, true);
});

test("I 9 mediciones reales habilitan paso 3 sagital", () => {
  const run = realRun({ sagittal: sagittalFinal({ measurements: nineMeasurements }), axial: null, rootMode: "mixed" });
  assert.equal(extractMeasurementRows(run.planes.sagittal).length, 9);
  assert.equal(evaluateRealInferenceReadiness(run).ready, true);
});

test("J /api/ai/assets se normaliza con API_BASE_URL", () => {
  assert.equal(normalizeAiAssetUrl("/api/ai/assets/run/sagittal/input.png", "https://backend.example"), "https://backend.example/api/ai/assets/run/sagittal/input.png");
});

test("K visor usa input.png y overlay.png reales declarados", () => {
  const urls = resolvePlaneAssetUrls(sagittalFinal(), "sagittal", () => "fallback", "https://backend.example");
  assert.equal(urls["input.png"], "https://backend.example/api/ai/assets/sag-run/sagittal/input.png");
  assert.equal(urls["overlay.png"], "https://backend.example/api/ai/assets/sag-run/sagittal/overlay.png");
  assert.equal(urls["mask-preview.png"], undefined);
});

test("synthetic distinto de false bloquea modo estricto", () => assert.equal(evaluateSagittalReadiness(realRun({ sagittal: sagittalFinal({ synthetic: true }) })).ready, false));
test("fallbackReason informado bloquea modo estricto", () => assert.equal(evaluateSagittalReadiness(realRun({ sagittal: sagittalFinal({ fallbackReason: "motivo" }) })).ready, false));
test("modelVersion incorrecta bloquea", () => assert.equal(evaluateSagittalReadiness(realRun({ sagittal: sagittalFinal({ model: { ...sagittalFinal().model, version: "other" } }) })).ready, false));
test("modelKey incorrecto bloquea", () => assert.equal(evaluateSagittalReadiness(realRun({ sagittal: sagittalFinal({ model: { ...sagittalFinal().model, key: "other" } }) })).ready, false));
test("humanReviewRequired false bloquea", () => assert.equal(evaluateSagittalReadiness(realRun({ sagittal: sagittalFinal({ humanReviewRequired: false }) })).ready, false));
test("notClinicalDiagnosis false bloquea", () => assert.equal(evaluateSagittalReadiness(realRun({ sagittal: sagittalFinal({ notClinicalDiagnosis: false }) })).ready, false));
test("baselineReady false bloquea", () => assert.equal(evaluateSagittalReadiness(realRun({ sagittal: sagittalFinal({ model: { ...sagittalFinal().model, baselineReady: false } }) })).ready, false));
test("availableForRealInference false bloquea", () => assert.equal(evaluateSagittalReadiness(realRun({ sagittal: sagittalFinal({ model: { ...sagittalFinal().model, availableForRealInference: false } }) })).ready, false));
test("mask-preview no se sintetiza sin declaracion", () => assert.equal(resolvePlaneAssetUrls({ planeRunId: "r1", assets: [] }, "sagittal", (runId, plane, asset) => `/api/ai/assets/${runId}/${plane}/${asset}`)["mask-preview.png"], undefined));
test("input y overlay si usan fallback backend", () => {
  const urls = resolvePlaneAssetUrls({ planeRunId: "r1", assets: [] }, "sagittal", (runId, plane, asset) => `/api/ai/assets/${runId}/${plane}/${asset}`);
  assert.equal(urls["input.png"], "/api/ai/assets/r1/sagittal/input.png");
  assert.equal(urls["overlay.png"], "/api/ai/assets/r1/sagittal/overlay.png");
});
test("URL relativa no /api no se acepta", () => assert.equal(normalizeAiAssetUrl("assets/output.png", "https://backend.example"), undefined));
test("no usa mask.npy", () => assert.equal(normalizeAiAssetUrl("/api/ai/assets/r1/sagittal/mask.npy", "https://backend.example"), undefined));
test("no usa confidence.npy", () => assert.equal(normalizeAiAssetUrl("/api/ai/assets/r1/sagittal/confidence.npy", "https://backend.example"), undefined));
test("workspace deriva mixed cuando solo requestedInferenceMode es real", () => assert.equal(resolveWorkspaceInferenceMode({ runId: "r", requestedInferenceMode: "real_baseline", planes: {} }), "mixed"));

console.log(`Contract helper tests passed: ${count}`);
