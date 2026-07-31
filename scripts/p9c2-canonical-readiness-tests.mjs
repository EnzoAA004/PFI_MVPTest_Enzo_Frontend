import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
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

function loadReadiness() {
  const js = transpile("src/inferenceReadiness.ts");
  const sandbox = { exports: {}, console };
  vm.runInNewContext(`${js}
exports.SAGITTAL_FINAL_MODEL_KEY = SAGITTAL_FINAL_MODEL_KEY;
exports.SAGITTAL_FINAL_MODEL_VERSION = SAGITTAL_FINAL_MODEL_VERSION;
exports.SAGITTAL_FINAL_ARTIFACT_HASH = SAGITTAL_FINAL_ARTIFACT_HASH;
exports.evaluateSagittalReadiness = evaluateSagittalReadiness;
exports.evaluateAxialReadiness = evaluateAxialReadiness;
exports.evaluateSagittalReviewReadiness = evaluateSagittalReviewReadiness;
exports.evaluateDualReadiness = evaluateDualReadiness;
exports.evaluateRealInferenceReadiness = evaluateRealInferenceReadiness;
exports.resolveReviewWorkspaceMode = resolveReviewWorkspaceMode;
exports.hasRealPlaneMeasurements = hasRealPlaneMeasurements;
exports.hasRealMeasurements = hasRealMeasurements;
exports.readSpiderRuntimeMetadata = readSpiderRuntimeMetadata;
exports.isRealPlaneRun = isRealPlaneRun;`, sandbox);
  return sandbox.exports;
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
exports.rawMultiplanarRunV1Fixture = rawMultiplanarRunV1Fixture;
exports.rawMultiplanarRunV2PublicPresenterFixture = rawMultiplanarRunV2PublicPresenterFixture;`, sandbox);
  return sandbox.exports;
}

const readiness = loadReadiness();
const adapter = loadAdapter();
const fixtures = loadFixtures();

let count = 0;
function test(name, fn) {
  fn();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanSagittal(overrides = {}) {
  return {
    planeRunId: "sag-run",
    plane: "sagittal",
    status: "completed",
    effectiveInferenceMode: "real_baseline",
    synthetic: false,
    fallbackReason: null,
    model: {
      key: readiness.SAGITTAL_FINAL_MODEL_KEY,
      version: readiness.SAGITTAL_FINAL_MODEL_VERSION,
      artifactHash: readiness.SAGITTAL_FINAL_ARTIFACT_HASH,
      baselineReady: true,
      availableForRealInference: true,
      manifestValid: true,
    },
    input: {
      inputId: "inp-sag",
      nativeShape: [17, 512, 512],
      canonicalShape: [512, 512, 17],
      orientationTransform: "move_axis_0_to_last",
      selectedSliceIndex: 8,
      sliceCount: 17,
      selectedAxis: 2,
    },
    assets: [],
    masks: [],
    landmarks: [],
    measurements: Array.from({ length: 9 }, (_, index) => ({ id: `m${index + 1}`, labelKey: `measurement${index + 1}`, value: 10 + index, unit: "mm", placeholder: false })),
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
    ...overrides,
  };
}

function cleanRun(overrides = {}) {
  return {
    runId: "run-1",
    schemaVersion: MULTIPLANAR_CONTRACT_V2,
    effectiveInferenceMode: "real_baseline",
    requestedInferenceMode: "real_baseline",
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
    synthetic: false,
    fallbackReason: null,
    degradedMode: false,
    planes: { sagittal: cleanSagittal() },
    ...overrides,
  };
}

// A. Fixture publico v2 real limpio
test("A fixture publico v2 limpio: sagital ready, review ready, real inference ready, sagittal_only, 9 mediciones", () => {
  const canonical = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV2PublicPresenterFixture);
  assert.equal(readiness.evaluateSagittalReadiness(canonical).ready, true);
  assert.equal(readiness.evaluateSagittalReviewReadiness(canonical).ready, true);
  assert.equal(readiness.evaluateRealInferenceReadiness(canonical).ready, true);
  assert.equal(readiness.resolveReviewWorkspaceMode(canonical), "sagittal_only");
  assert.equal(readiness.hasRealPlaneMeasurements(canonical, "sagittal"), true);
  assert.equal(canonical.planes.sagittal.measurements.length, 9);
  const metadata = readiness.readSpiderRuntimeMetadata(canonical.planes.sagittal);
  assert.equal(metadata.canonicalShapeValid, true);
  assert.equal(metadata.selectedAxisValid, true);
  assert.equal(metadata.sliceCountValid, true);
  assert.equal(metadata.sliceCountMatchesAxis, true);
  assert.equal(metadata.selectedSliceInRange, true);
  assert.equal(metadata.supportedTransform, true);
});

// B. Modelo incorrecto
test("B1 key incorrecta bloquea", () => {
  const run = cleanRun({ planes: { sagittal: cleanSagittal({ model: { ...cleanSagittal().model, key: "other_model" } }) } });
  assert.equal(readiness.evaluateSagittalReadiness(run).ready, false);
});
test("B2 version incorrecta bloquea", () => {
  const run = cleanRun({ planes: { sagittal: cleanSagittal({ model: { ...cleanSagittal().model, version: "0.0.1" } }) } });
  assert.equal(readiness.evaluateSagittalReadiness(run).ready, false);
});
test("B3 artifactHash incorrecto bloquea", () => {
  const run = cleanRun({ planes: { sagittal: cleanSagittal({ model: { ...cleanSagittal().model, artifactHash: "deadbeef" } }) } });
  assert.equal(readiness.evaluateSagittalReadiness(run).ready, false);
});

// C. Gobernanza
test("C1 humanReviewRequired=null bloquea", () => {
  const run = cleanRun({ planes: { sagittal: cleanSagittal({ humanReviewRequired: null }) } });
  assert.equal(readiness.evaluateSagittalReadiness(run).ready, false);
});
test("C2 humanReviewRequired=false bloquea", () => {
  const run = cleanRun({ planes: { sagittal: cleanSagittal({ humanReviewRequired: false }) } });
  assert.equal(readiness.evaluateSagittalReadiness(run).ready, false);
});
test("C3 notClinicalDiagnosis=null bloquea", () => {
  const run = cleanRun({ planes: { sagittal: cleanSagittal({ notClinicalDiagnosis: null }) } });
  assert.equal(readiness.evaluateSagittalReadiness(run).ready, false);
});
test("C4 notClinicalDiagnosis=false bloquea", () => {
  const run = cleanRun({ planes: { sagittal: cleanSagittal({ notClinicalDiagnosis: false }) } });
  assert.equal(readiness.evaluateSagittalReadiness(run).ready, false);
});
test("C5 gobernanza raiz null bloquea evaluateSagittalReviewReadiness", () => {
  const run = cleanRun({ humanReviewRequired: null, notClinicalDiagnosis: null });
  assert.equal(readiness.evaluateSagittalReviewReadiness(run).ready, false);
});

// D. Synthetic / fallback
test("D1 synthetic=true bloquea", () => {
  const run = cleanRun({ planes: { sagittal: cleanSagittal({ synthetic: true }) } });
  assert.equal(readiness.evaluateSagittalReadiness(run).ready, false);
});
test("D2 synthetic=null bloquea", () => {
  const run = cleanRun({ planes: { sagittal: cleanSagittal({ synthetic: null }) } });
  assert.equal(readiness.evaluateSagittalReadiness(run).ready, false);
});
test("D3 fallbackReason informado bloquea", () => {
  const run = cleanRun({ planes: { sagittal: cleanSagittal({ fallbackReason: "sagittal_model_unavailable" }) } });
  assert.equal(readiness.evaluateSagittalReadiness(run).ready, false);
});
test("D4 degradedMode=true bloquea revision", () => {
  const run = cleanRun({ degradedMode: true });
  assert.equal(readiness.evaluateSagittalReviewReadiness(run).ready, false);
});
test("D5 availableForRealInference=false bloquea", () => {
  const run = cleanRun({ planes: { sagittal: cleanSagittal({ model: { ...cleanSagittal().model, availableForRealInference: false } }) } });
  assert.equal(readiness.evaluateSagittalReadiness(run).ready, false);
});

// E. Orientacion
test("E1 canonicalShape con menos de 3 dimensiones bloquea", () => {
  const run = cleanRun({ planes: { sagittal: cleanSagittal({ input: { ...cleanSagittal().input, canonicalShape: [512, 512] } }) } });
  assert.equal(readiness.evaluateSagittalReadiness(run).ready, false);
});
test("E2 selectedAxis fuera de rango bloquea", () => {
  const run = cleanRun({ planes: { sagittal: cleanSagittal({ input: { ...cleanSagittal().input, selectedAxis: 9 } }) } });
  assert.equal(readiness.evaluateSagittalReadiness(run).ready, false);
});
test("E3 sliceCount distinto de canonicalShape[selectedAxis] bloquea", () => {
  const run = cleanRun({ planes: { sagittal: cleanSagittal({ input: { ...cleanSagittal().input, sliceCount: 5 } }) } });
  assert.equal(readiness.evaluateSagittalReadiness(run).ready, false);
});
test("E4 selectedSliceIndex fuera de rango bloquea", () => {
  const run = cleanRun({ planes: { sagittal: cleanSagittal({ input: { ...cleanSagittal().input, selectedSliceIndex: 99 } }) } });
  assert.equal(readiness.evaluateSagittalReadiness(run).ready, false);
});
test("E5 orientationTransform desconocida bloquea", () => {
  const run = cleanRun({ planes: { sagittal: cleanSagittal({ input: { ...cleanSagittal().input, orientationTransform: "flip_z" } }) } });
  assert.equal(readiness.evaluateSagittalReadiness(run).ready, false);
});

// F. Mediciones
test("F1 9 mediciones reales aprueba", () => {
  const run = cleanRun();
  assert.equal(readiness.hasRealPlaneMeasurements(run, "sagittal"), true);
  assert.equal(readiness.evaluateSagittalReviewReadiness(run).ready, true);
});
test("F2 todas placeholder bloquea", () => {
  const run = cleanRun({ planes: { sagittal: cleanSagittal({ measurements: cleanSagittal().measurements.map((m) => ({ ...m, placeholder: true })) }) } });
  assert.equal(readiness.hasRealPlaneMeasurements(run, "sagittal"), false);
  assert.equal(readiness.evaluateSagittalReviewReadiness(run).ready, false);
});
test("F3 values null bloquea", () => {
  const run = cleanRun({ planes: { sagittal: cleanSagittal({ measurements: cleanSagittal().measurements.map((m) => ({ ...m, value: null })) }) } });
  assert.equal(readiness.hasRealPlaneMeasurements(run, "sagittal"), false);
});
test("F4 array vacio bloquea", () => {
  const run = cleanRun({ planes: { sagittal: cleanSagittal({ measurements: [] }) } });
  assert.equal(readiness.hasRealPlaneMeasurements(run, "sagittal"), false);
  assert.equal(readiness.evaluateSagittalReviewReadiness(run).ready, false);
});

// G. Axial
test("G1 axial ausente + sagital listo => sagittal_only", () => {
  const run = cleanRun();
  assert.equal(readiness.resolveReviewWorkspaceMode(run), "sagittal_only");
});
test("G2 axial candidate_below_quality_gate => sagittal_only", () => {
  const run = cleanRun({ planes: { sagittal: cleanSagittal(), axial: { planeRunId: "ax-run", plane: "axial", status: "completed", effectiveInferenceMode: "contract", synthetic: null, fallbackReason: null, model: {}, input: {}, assets: [], masks: [], landmarks: [], measurements: [], humanReviewRequired: null, notClinicalDiagnosis: null } } });
  assert.equal(readiness.resolveReviewWorkspaceMode(run), "sagittal_only");
});
test("G3 dual solamente cuando ambos planos son reales y revisables", () => {
  const realAxial = {
    planeRunId: "ax-run",
    plane: "axial",
    status: "completed",
    effectiveInferenceMode: "real_baseline",
    synthetic: false,
    fallbackReason: null,
    model: { availableForRealInference: true },
    input: {},
    assets: [],
    masks: [],
    landmarks: [],
    measurements: [{ id: "a1", labelKey: "axial_width", value: 8, unit: "mm", placeholder: false }],
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
  };
  const run = cleanRun({ planes: { sagittal: cleanSagittal(), axial: realAxial } });
  assert.equal(readiness.resolveReviewWorkspaceMode(run), "dual_plane");
  assert.equal(readiness.evaluateDualReadiness(run).ready, true);
});

// H. Compatibilidad v1
test("H1 v1 con gobernanza completa (synthetic explicito) queda sagital ready", () => {
  const raw = deepClone(fixtures.rawMultiplanarRunV1Fixture);
  raw.synthetic = false;
  raw.fallbackReason = null;
  raw.planes.sagittal.synthetic = false;
  raw.planes.sagittal.fallbackReason = null;
  raw.planes.sagittal.modelArtifact.manifestValid = true;
  const canonical = adapter.parseMultiplanarRunResponse(raw);
  assert.equal(readiness.evaluateSagittalReadiness(canonical).ready, true, readiness.evaluateSagittalReadiness(canonical).reasons.join(" | "));
});
test("H2 v1 sin gobernanza informada no es evaluable", () => {
  const canonical = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV1Fixture);
  assert.equal(canonical.synthetic, null);
  assert.equal(readiness.evaluateSagittalReadiness(canonical).ready, false);
  assert.equal(readiness.evaluateSagittalReviewReadiness(canonical).ready, false);
});

// I. Test estructural
test("I1 inferenceReadiness.ts no contiene tipos ni aliases legacy", () => {
  const source = readFileSync(join(root, "src/inferenceReadiness.ts"), "utf8");
  for (const forbidden of ["MultiplanarRunResponse", "MultiplanarPlaneRun", "aiOutput", "modelArtifact", "allowContractFallback", ".metadata?.", "planeRun.metadata", "record.metadata"]) {
    assert.ok(!source.includes(forbidden), `inferenceReadiness.ts no debe contener "${forbidden}"`);
  }
});
// AnalysisTimelineView, que era quien sostenia el estado canonico de la corrida,
// se elimino: duplicaba la sala de lectura con otro contrato de revision. La
// propiedad que la prueba custodiaba —que el adaptador legacy no vuelva a
// colarse— ya no depende de un componente y se verifica sobre todo el codigo.
test("I2 ningun componente usa canonicalRunToLegacyViewModel ni estado MultiplanarRunResponse", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const source = readFileSync(full, "utf8");
      if (source.includes("canonicalRunToLegacyViewModel") || source.includes("useState<MultiplanarRunResponse")) {
        offenders.push(full);
      }
    }
  };
  walk(join(root, "src"));
  assert.deepEqual(offenders, [], "el adaptador legacy no debe reaparecer");
});
test("I3 la corrida evalua readiness sobre el resultado canonico directo de runMultiplanarAnalysis", () => {
  const source = readFileSync(join(root, "src/features/worklist/NewAnalysisDrawer.tsx"), "utf8");
  assert.match(source, /const result = await runMultiplanarAnalysis\(payload\);\s*\n\s*const readiness = evaluateRealInferenceReadiness\(result\);/);
});

console.log(`P9-C.2 canonical readiness tests passed: ${count}`);
