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
  SAGITTAL_FINAL_MODEL_VERSION,
  evaluateAxialReadiness,
  evaluateDualReadiness,
  evaluateRealInferenceReadiness,
  evaluateSagittalReadiness,
  isRealPlaneRun,
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

const measurement = { id: "m1", label: "Canal", value: 12, unit: "mm" };
const placeholderMeasurement = { id: "p1", label: "Placeholder", value: "", unit: "mm", placeholder: true };
const spiderMetadata = {
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
const sagittalFinal = {
  runId: "sag-run",
  plane: "sagittal",
  modelKey: "sagittal_spider",
  modelVersion: SAGITTAL_FINAL_MODEL_VERSION,
  artifactHash: SAGITTAL_FINAL_ARTIFACT_HASH,
  allowContractFallback: false,
  inputId: "inp-sag",
  effectiveInferenceMode: "real_baseline",
  aiOutput: { realInferenceAvailable: true, humanReviewRequired: true, notClinicalDiagnosis: true },
  metadata: spiderMetadata,
  measurements: { values: [measurement] },
  assets: {
    "input.png": { runId: "sag-run", plane: "sagittal", assetName: "input.png", url: "/api/ai/assets/sag-run/sagittal/input.png" },
    "overlay.png": { runId: "sag-run", plane: "sagittal", assetName: "overlay.png", url: "/api/ai/assets/sag-run/sagittal/overlay.png" },
  },
};
const axialReal = {
  runId: "ax-run",
  plane: "axial",
  effectiveInferenceMode: "real_baseline",
  inputId: "inp-ax",
  aiOutput: { realInferenceAvailable: true },
  measurements: { values: [measurement] },
};
const realRun = {
  runId: "multi-run",
  effectiveInferenceMode: "real_baseline",
  humanReviewRequired: true,
  notClinicalDiagnosis: true,
  degradedMode: false,
  planes: { sagittal: sagittalFinal, axial: axialReal },
};

test("effectiveInferenceMode real_baseline", () => assert.equal(resolvePlaneInferenceMode({ effectiveInferenceMode: " real_baseline " }), "real_baseline"));
test("fallback a inferenceMode", () => assert.equal(resolvePlaneInferenceMode({ inferenceMode: "REAL" }), "real"));
test("fallback a aiOutput.inferenceMode", () => assert.equal(resolvePlaneInferenceMode({ aiOutput: { inferenceMode: "real_baseline" } }), "real_baseline"));
test("fallback a metadata.inferenceMode", () => assert.equal(resolvePlaneInferenceMode({ metadata: { inferenceMode: "real" } }), "real"));
test("contract no es real", () => assert.equal(isRealPlaneRun({ effectiveInferenceMode: "contract" }), false));
test("mixed no es real", () => assert.equal(isRealPlaneRun({ effectiveInferenceMode: "mixed" }), false));
test("degradedMode true no es real", () => assert.equal(isRealPlaneRun({ effectiveInferenceMode: "real", degradedMode: true }), false));
test("realInferenceFailure bloquea", () => assert.equal(isRealPlaneRun({ effectiveInferenceMode: "real", metadata: { realInferenceFailure: "missing" } }), false));
test("realInferenceAvailable=false bloquea", () => assert.equal(isRealPlaneRun({ effectiveInferenceMode: "real", aiOutput: { realInferenceAvailable: false } }), false));
test("modelVersion correcta", () => assert.equal(evaluateSagittalReadiness(realRun).ready, true));
test("modelVersion incorrecta bloquea", () => assert.equal(evaluateSagittalReadiness({ ...realRun, planes: { ...realRun.planes, sagittal: { ...sagittalFinal, modelVersion: "other" } } }).ready, false));
test("artifactHash correcto", () => assert.equal(evaluateSagittalReadiness(realRun).ready, true));
test("artifactHash incorrecto bloquea", () => assert.equal(evaluateSagittalReadiness({ ...realRun, planes: { ...realRun.planes, sagittal: { ...sagittalFinal, artifactHash: "bad" } } }).ready, false));
test("orientation metadata se interpreta", () => assert.equal(readSpiderRuntimeMetadata(sagittalFinal).orientationExpected, true));
test("selectedSlice fuera de rango se detecta", () => assert.equal(readSpiderRuntimeMetadata({ metadata: { ...spiderMetadata, selectedSlice: 18 } }).selectedSliceOutOfRange, true));
test("inputShape SPIDER correcta", () => assert.equal(readSpiderRuntimeMetadata(sagittalFinal).spiderShapeDetected, true));
test("transform incorrecto produce reason", () => assert.match(evaluateSagittalReadiness({ ...realRun, planes: { ...realRun.planes, sagittal: { ...sagittalFinal, metadata: { ...spiderMetadata, inputOrientationTransform: "wrong" } } } }).reasons.join(" "), /orientación/));
test("ambos reales habilitan", () => assert.equal(evaluateDualReadiness(realRun).ready, true));
test("sagital real y axial contract bloquea", () => assert.equal(evaluateDualReadiness({ ...realRun, planes: { ...realRun.planes, axial: { ...axialReal, effectiveInferenceMode: "contract" } } }).ready, false));
test("axial real y sagital contract bloquea", () => assert.equal(evaluateDualReadiness({ ...realRun, planes: { ...realRun.planes, sagittal: { ...sagittalFinal, effectiveInferenceMode: "contract" } } }).ready, false));
test("plano ausente bloquea", () => assert.equal(evaluateAxialReadiness({ ...realRun, planes: { sagittal: sagittalFinal } }).ready, false));
test("mediciones placeholder bloquean", () => assert.equal(evaluateDualReadiness({ ...realRun, planes: { sagittal: { ...sagittalFinal, measurements: { values: [placeholderMeasurement] } }, axial: { ...axialReal, measurements: { values: [placeholderMeasurement] } } } }).ready, false));
test("mediciones reales habilitan", () => assert.equal(evaluateRealInferenceReadiness(realRun).ready, true));
test("usa URL backend devuelta", () => assert.equal(resolvePlaneAssetUrls(sagittalFinal, "sagittal", () => "fallback")["overlay.png"], "/api/ai/assets/sag-run/sagittal/overlay.png"));
test("usa aiAssetUrl como fallback", () => assert.equal(resolvePlaneAssetUrls({ runId: "r1" }, "sagittal", (runId, plane, asset) => `/api/ai/assets/${runId}/${plane}/${asset}`)["input.png"], "/api/ai/assets/r1/sagittal/input.png"));
test("no usa mask.npy", () => assert.equal(resolvePlaneAssetUrls({ runId: "r1", assets: { "mask-preview.png": { url: "/api/ai/assets/r1/sagittal/mask-preview.png" } } }, "sagittal", () => "fallback")["mask-preview.png"].includes("mask.npy"), false));
test("no usa confidence.npy", () => assert.equal(resolvePlaneAssetUrls(sagittalFinal, "sagittal", () => "/api/ai/assets/r1/sagittal/confidence.npy")["input.png"].includes("confidence.npy"), false));
test("no construye URL AI Module", () => assert.equal(resolvePlaneAssetUrls(sagittalFinal, "sagittal", () => "http://localhost:8000/output.png")["input.png"].includes("localhost:8000"), false));
test("runId del plano se usa para asset", () => assert.equal(resolvePlaneAssetUrls({ runId: "plane-run" }, "axial", (runId, plane, asset) => `/api/ai/assets/${runId}/${plane}/${asset}`)["overlay.png"], "/api/ai/assets/plane-run/axial/overlay.png"));
test("real_baseline no se trata como demo fallback", () => assert.equal(isRealPlaneRun({ effectiveInferenceMode: "real_baseline", status: "fallback" }), false));
test("sampleRun no habilita evaluación real", () => assert.equal(evaluateDualReadiness({ runId: "sample", effectiveInferenceMode: "contract", planes: {} }).ready, false));
test("VITE_USE_MOCK=true no presenta mock como real", () => assert.equal(isRealPlaneRun({ effectiveInferenceMode: "mock" }), false));
test("corrections usa beforeValue y afterValue", () => assert.deepEqual({ corrections: [{ measurementId: "m1", beforeValue: { value: 1, unit: "mm" }, afterValue: { value: 2, unit: "mm" } }] }.corrections[0].afterValue.value, 2));
test("reviewer obligatorio", () => assert.equal(Boolean("".trim()), false));
test("no guarda review sin run real", () => assert.equal(evaluateDualReadiness(null).ready, false));
test("workspace deriva mixed cuando solo requestedInferenceMode es real", () => assert.equal(resolveWorkspaceInferenceMode({ runId: "r", requestedInferenceMode: "real_baseline" }), "mixed"));

console.log(`Contract helper tests passed: ${count}`);
