import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync("src/inferenceReadiness.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports, require: () => ({}) }, { filename: "inferenceReadiness.js" });

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

const legacySpiderMetadata = {
  inferenceMode: "real_baseline",
  selectedSlice: 8,
  selectedAxis: 2,
  sliceCount: 17,
  inputShapeNative: [17, 512, 512],
  inputShapeCanonical: [512, 512, 17],
  inputOrientationTransform: "move_axis_0_to_last",
  inPlaneSpacing: [0.8, 0.8],
  inPlaneSpacingUnit: "mm",
};

const realRuntimeMetadata = {
  inferenceMode: "real_baseline",
  inputShapeNative: [352, 384, 17],
  inputShapeCanonical: [352, 384, 17],
  selectedAxis: 2,
  sliceCount: 17,
  selectedSlice: 7,
  inputOrientationTransform: "none",
  processedShape: [256, 256],
};

const nineMeasurements = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`measurement${index + 1}Mm`, 10 + index]));
const measurement = { id: "m1", label: "Canal", value: 12, unit: "mm" };
const placeholderMeasurement = { id: "p1", label: "Placeholder", value: "", unit: "mm", placeholder: true };

function sagittalFinal(overrides = {}) {
  return {
    runId: "sag-run",
    plane: "sagittal",
    modelKey: SAGITTAL_FINAL_MODEL_KEY,
    modelVersion: SAGITTAL_FINAL_MODEL_VERSION,
    artifactHash: SAGITTAL_FINAL_ARTIFACT_HASH,
    allowContractFallback: false,
    inputId: "inp-sag",
    effectiveInferenceMode: "real_baseline",
    aiOutput: {
      status: "real_baseline_ready",
      inferenceMode: "real_baseline",
      realInferenceAvailable: true,
      humanReviewRequired: true,
      notClinicalDiagnosis: true,
    },
    modelArtifact: { baselineReady: true, availableForRealInference: true },
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
    degradedMode: false,
    status: null,
    metadata: realRuntimeMetadata,
    measurements: { values: [measurement] },
    assets: {
      "input.png": { runId: "sag-run", plane: "sagittal", assetName: "input.png", url: "/api/ai/assets/sag-run/sagittal/input.png" },
      "overlay.png": { runId: "sag-run", plane: "sagittal", assetName: "overlay.png", url: "/api/ai/assets/sag-run/sagittal/overlay.png" },
    },
    series: [{
      id: "sag-series",
      plane: "sagittal",
      name: "Sagital real",
      sliceCount: 17,
      selectedSlice: 7,
      assets: {
        "input.png": { runId: "sag-run", plane: "sagittal", assetName: "input.png", url: "/api/ai/assets/sag-run/sagittal/input.png" },
        "overlay.png": { runId: "sag-run", plane: "sagittal", assetName: "overlay.png", url: "/api/ai/assets/sag-run/sagittal/overlay.png" },
      },
    }],
    ...overrides,
  };
}

function axialReal(overrides = {}) {
  return {
    runId: "ax-run",
    plane: "axial",
    effectiveInferenceMode: "real_baseline",
    inputId: "inp-ax",
    aiOutput: { inferenceMode: "real_baseline", realInferenceAvailable: true },
    measurements: { values: [measurement] },
    ...overrides,
  };
}

function realRun({ sagittal = sagittalFinal(), axial = axialReal(), rootMode = "real_baseline" } = {}) {
  return {
    runId: "multi-run",
    effectiveInferenceMode: rootMode,
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
    degradedMode: false,
    planes: { sagittal, ...(axial === null ? { axial: null } : { axial }) },
    threeD: axial === null ? { status: "blocked_missing_axial" } : undefined,
  };
}

test("effectiveInferenceMode real_baseline", () => assert.equal(resolvePlaneInferenceMode({ effectiveInferenceMode: " real_baseline " }), "real_baseline"));
test("fallback a inferenceMode", () => assert.equal(resolvePlaneInferenceMode({ inferenceMode: "REAL" }), "real"));
test("fallback a aiOutput.inferenceMode", () => assert.equal(resolvePlaneInferenceMode({ aiOutput: { inferenceMode: "real_baseline" } }), "real_baseline"));
test("fallback a aiOutput.status real_baseline_ready", () => assert.equal(resolvePlaneInferenceMode({ aiOutput: { status: "real_baseline_ready" } }), "real_baseline"));
test("fallback a metadata.inferenceMode", () => assert.equal(resolvePlaneInferenceMode({ metadata: { inferenceMode: "real" } }), "real"));
test("contract no es real", () => assert.equal(isRealPlaneRun({ effectiveInferenceMode: "contract" }), false));
test("mixed no es real", () => assert.equal(isRealPlaneRun({ effectiveInferenceMode: "mixed" }), false));
test("degradedMode true no es real", () => assert.equal(isRealPlaneRun({ effectiveInferenceMode: "real", degradedMode: true }), false));
test("realInferenceFailure bloquea", () => assert.equal(isRealPlaneRun({ effectiveInferenceMode: "real", metadata: { realInferenceFailure: "missing" } }), false));
test("realInferenceAvailable=false bloquea", () => assert.equal(isRealPlaneRun({ effectiveInferenceMode: "real", aiOutput: { realInferenceAvailable: false } }), false));

test("A native [17,512,512] canonical [512,512,17] move_axis_0_to_last habilita", () => {
  const run = realRun({ sagittal: sagittalFinal({ metadata: legacySpiderMetadata }) });
  assert.equal(readSpiderRuntimeMetadata(run.planes.sagittal).orientationExpected, true);
  assert.equal(evaluateSagittalReadiness(run).ready, true);
});

test("B native/canonical [352,384,17] axis 2 transform none habilita", () => {
  const run = realRun();
  assert.equal(readSpiderRuntimeMetadata(run.planes.sagittal).orientationExpected, true);
  assert.equal(evaluateSagittalReadiness(run).ready, true);
});

test("C selectedSlice fuera de rango bloquea", () => {
  const run = realRun({ sagittal: sagittalFinal({ metadata: { ...realRuntimeMetadata, selectedSlice: 17 } }) });
  assert.equal(readSpiderRuntimeMetadata(run.planes.sagittal).selectedSliceOutOfRange, true);
  assert.equal(evaluateSagittalReadiness(run).ready, false);
});

test("D selectedAxis invalido bloquea", () => {
  const run = realRun({ sagittal: sagittalFinal({ metadata: { ...realRuntimeMetadata, selectedAxis: 3 } }) });
  assert.equal(evaluateSagittalReadiness(run).ready, false);
});

test("E canonical[selectedAxis] distinto de sliceCount bloquea", () => {
  const run = realRun({ sagittal: sagittalFinal({ metadata: { ...realRuntimeMetadata, inputShapeCanonical: [352, 384, 16] } }) });
  assert.equal(evaluateSagittalReadiness(run).ready, false);
});

test("F hash incorrecto bloquea", () => {
  assert.equal(evaluateSagittalReadiness(realRun({ sagittal: sagittalFinal({ artifactHash: "bad" }) })).ready, false);
});

test("G contract/mock/fallback bloquean", () => {
  assert.equal(evaluateSagittalReviewReadiness(realRun({ sagittal: sagittalFinal({ effectiveInferenceMode: "contract", aiOutput: { ...sagittalFinal().aiOutput, inferenceMode: "contract" } }), rootMode: "mixed" })).ready, false);
  assert.equal(evaluateSagittalReviewReadiness(realRun({ sagittal: sagittalFinal({ effectiveInferenceMode: "mock" }), rootMode: "mixed" })).ready, false);
  assert.equal(evaluateSagittalReviewReadiness(realRun({ sagittal: sagittalFinal({ status: "fallback" }), rootMode: "mixed" })).ready, false);
});

test("H planes.axial=null no bloquea evaluacion sagital", () => {
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

test("allowContractFallback ausente bloquea modo estricto", () => assert.equal(evaluateSagittalReadiness(realRun({ sagittal: sagittalFinal({ allowContractFallback: undefined }) })).ready, false));
test("modelVersion incorrecta bloquea", () => assert.equal(evaluateSagittalReadiness(realRun({ sagittal: sagittalFinal({ modelVersion: "other" }) })).ready, false));
test("modelKey incorrecto bloquea", () => assert.equal(evaluateSagittalReadiness(realRun({ sagittal: sagittalFinal({ modelKey: "other" }) })).ready, false));
test("humanReviewRequired false bloquea", () => assert.equal(evaluateSagittalReadiness(realRun({ sagittal: sagittalFinal({ humanReviewRequired: false }) })).ready, false));
test("notClinicalDiagnosis false bloquea", () => assert.equal(evaluateSagittalReadiness(realRun({ sagittal: sagittalFinal({ notClinicalDiagnosis: false }) })).ready, false));
test("baselineReady false bloquea", () => assert.equal(evaluateSagittalReadiness(realRun({ sagittal: sagittalFinal({ modelArtifact: { baselineReady: false, availableForRealInference: true } }) })).ready, false));
test("availableForRealInference false bloquea", () => assert.equal(evaluateSagittalReadiness(realRun({ sagittal: sagittalFinal({ modelArtifact: { baselineReady: true, availableForRealInference: false } }) })).ready, false));
test("mask-preview no se sintetiza sin declaracion", () => assert.equal(resolvePlaneAssetUrls({ runId: "r1" }, "sagittal", (runId, plane, asset) => `/api/ai/assets/${runId}/${plane}/${asset}`)["mask-preview.png"], undefined));
test("input y overlay si usan fallback backend", () => {
  const urls = resolvePlaneAssetUrls({ runId: "r1" }, "sagittal", (runId, plane, asset) => `/api/ai/assets/${runId}/${plane}/${asset}`);
  assert.equal(urls["input.png"], "/api/ai/assets/r1/sagittal/input.png");
  assert.equal(urls["overlay.png"], "/api/ai/assets/r1/sagittal/overlay.png");
});
test("URL relativa no /api no se acepta", () => assert.equal(normalizeAiAssetUrl("assets/output.png", "https://backend.example"), undefined));
test("no usa mask.npy", () => assert.equal(normalizeAiAssetUrl("/api/ai/assets/r1/sagittal/mask.npy", "https://backend.example"), undefined));
test("no usa confidence.npy", () => assert.equal(normalizeAiAssetUrl("/api/ai/assets/r1/sagittal/confidence.npy", "https://backend.example"), undefined));
test("workspace deriva mixed cuando solo requestedInferenceMode es real", () => assert.equal(resolveWorkspaceInferenceMode({ runId: "r", requestedInferenceMode: "real_baseline" }), "mixed"));

console.log(`Contract helper tests passed: ${count}`);
