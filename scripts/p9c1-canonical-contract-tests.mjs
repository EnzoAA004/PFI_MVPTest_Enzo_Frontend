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

function transpile(relativePath, extraStrip = []) {
  let source = readFileSync(join(root, relativePath), "utf8")
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/export (default )?/g, "");
  for (const pattern of extraStrip) source = source.replace(pattern, "");
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}

function loadAdapter() {
  const js = transpile("src/adapters/multiplanarRunAdapter.ts");
  const sandbox = { exports: {}, console, ContractError, MULTIPLANAR_CONTRACT_V2 };
  vm.runInNewContext(`${js}
exports.parseMultiplanarRunResponse = parseMultiplanarRunResponse;
exports.canonicalRunToLegacyViewModel = canonicalRunToLegacyViewModel;`, sandbox);
  return sandbox.exports;
}

function loadFixtures() {
  const js = transpile("src/fixtures/multiplanarRunFixtures.ts");
  const sandbox = { exports: {}, console };
  vm.runInNewContext(`${js}
exports.rawMultiplanarRunV2Fixture = rawMultiplanarRunV2Fixture;
exports.rawMultiplanarRunV1Fixture = rawMultiplanarRunV1Fixture;
exports.rawMultiplanarRunV2PublicPresenterFixture = rawMultiplanarRunV2PublicPresenterFixture;
exports.rawMultiplanarRunV2MissingGovernanceFixture = rawMultiplanarRunV2MissingGovernanceFixture;
exports.rawMultiplanarRunV2FallbackPresenterFixture = rawMultiplanarRunV2FallbackPresenterFixture;
exports.SAGITTAL_FIXTURE_ARTIFACT_HASH = SAGITTAL_FIXTURE_ARTIFACT_HASH;
exports.SAGITTAL_FIXTURE_MEASUREMENT_LABEL_KEYS = SAGITTAL_FIXTURE_MEASUREMENT_LABEL_KEYS;`, sandbox);
  return sandbox.exports;
}

function loadClinicalDisplay() {
  const js = transpile("src/clinicalDisplay.ts");
  const sandbox = { exports: {}, console };
  vm.runInNewContext(`${js}
exports.displayMeasurementLabel = displayMeasurementLabel;`, sandbox);
  return sandbox.exports;
}

function loadInferenceReadiness() {
  const js = transpile("src/inferenceReadiness.ts");
  const sandbox = { exports: {}, console };
  vm.runInNewContext(`${js}
exports.evaluateSagittalReviewReadiness = evaluateSagittalReviewReadiness;
exports.resolveReviewWorkspaceMode = resolveReviewWorkspaceMode;`, sandbox);
  return sandbox.exports;
}

const adapter = loadAdapter();
const fixtures = loadFixtures();
const display = loadClinicalDisplay();
const readiness = loadInferenceReadiness();

let count = 0;
function test(name, fn) {
  fn();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertJsonEqual(actual, expected, message) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
}

test("A respuesta v2 real se convierte en modelo canonico", () => {
  const canonical = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV2Fixture);
  assert.equal(canonical.status, "completed");
  assert.equal(canonical.schemaVersion, "pfi.multiplanar-run.v2");
  assert.equal(canonical.runId, "run-fixture-v2-0001");
  assert.equal(canonical.planes.sagittal.plane, "sagittal");
  assert.equal(canonical.planes.axial, undefined);
});

test("B respuesta v1 historica produce el mismo modelo canonico (misma forma)", () => {
  const canonicalV1 = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV1Fixture);
  const canonicalV2 = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV2Fixture);
  assert.equal(canonicalV1.planes.sagittal.model.key, canonicalV2.planes.sagittal.model.key);
  assert.equal(canonicalV1.planes.sagittal.model.version, canonicalV2.planes.sagittal.model.version);
  assert.equal(canonicalV1.planes.sagittal.effectiveInferenceMode, canonicalV2.planes.sagittal.effectiveInferenceMode);
  assertJsonEqual(Object.keys(canonicalV1.planes.sagittal).sort(), Object.keys(canonicalV2.planes.sagittal).sort());
});

test("C modelo y artifactHash exactos", () => {
  const canonical = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV2Fixture);
  assert.equal(canonical.planes.sagittal.model.key, "sagittal_spider");
  assert.equal(canonical.planes.sagittal.model.version, "sagittal-spider-final-v1");
  assert.equal(canonical.planes.sagittal.model.artifactHash, fixtures.SAGITTAL_FIXTURE_ARTIFACT_HASH);

  const canonicalV1 = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV1Fixture);
  assert.equal(canonicalV1.planes.sagittal.model.artifactHash, fixtures.SAGITTAL_FIXTURE_ARTIFACT_HASH);
});

test("D metadata de orientacion correctamente normalizada", () => {
  const canonical = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV2Fixture);
  const input = canonical.planes.sagittal.input;
  assertJsonEqual(input.nativeShape, [320, 320, 24]);
  assertJsonEqual(input.canonicalShape, [24, 320, 320]);
  assert.equal(input.orientationTransform, "move_axis_0_to_last");
  assert.equal(input.selectedSliceIndex, 12);
  assert.equal(input.sliceCount, 24);
  assert.equal(input.selectedAxis, 0);
  assertJsonEqual(input.inPlaneSpacingMm, [0.7, 0.7]);

  const canonicalV1 = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV1Fixture);
  const { inputId: _v1InputId, ...v1InputRest } = canonicalV1.planes.sagittal.input;
  const { inputId: _v2InputId, ...v2InputRest } = input;
  assertJsonEqual(v1InputRest, v2InputRest);
});

test("E assets mapa se convierte en lista", () => {
  const canonical = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV2Fixture);
  const assets = canonical.planes.sagittal.assets;
  assert.ok(Array.isArray(assets));
  assert.equal(assets.length, 2);
  assert.ok(assets.every((asset) => typeof asset.url === "string"));
});

test("F assets lista permanece como lista", () => {
  const raw = deepClone(fixtures.rawMultiplanarRunV2Fixture);
  raw.planes.sagittal.assets = [
    { assetName: "input.png", url: "/api/ai/assets/run-fixture-v2-0001/sagittal/input.png" },
    { assetName: "overlay.png", url: "/api/ai/assets/run-fixture-v2-0001/sagittal/overlay.png" },
  ];
  const canonical = adapter.parseMultiplanarRunResponse(raw);
  assert.equal(canonical.planes.sagittal.assets.length, 2);
  assertJsonEqual(canonical.planes.sagittal.assets.map((a) => a.assetName).sort(), ["input.png", "overlay.png"]);
});

test("G label y labelKey resuelven siempre a labelKey canonica", () => {
  const canonicalV2 = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV2Fixture);
  const canonicalV1 = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV1Fixture);
  for (const measurement of canonicalV2.planes.sagittal.measurements) {
    assert.ok(measurement.labelKey);
    assert.equal(measurement.label, undefined);
  }
  for (const measurement of canonicalV1.planes.sagittal.measurements) {
    assert.ok(measurement.labelKey);
    assert.equal(measurement.label, undefined);
  }
  assertJsonEqual(
    canonicalV1.planes.sagittal.measurements.map((m) => m.labelKey).sort(),
    canonicalV2.planes.sagittal.measurements.map((m) => m.labelKey).sort(),
  );
});

test("H sin datos inventados: campos ausentes quedan undefined/null, no valores por defecto positivos", () => {
  const raw = deepClone(fixtures.rawMultiplanarRunV1Fixture);
  delete raw.planes.sagittal.humanReviewRequired;
  delete raw.planes.sagittal.aiOutput.humanReviewRequired;
  delete raw.planes.sagittal.aiOutput.notClinicalDiagnosis;
  delete raw.planes.sagittal.notClinicalDiagnosis;
  const canonical = adapter.parseMultiplanarRunResponse(raw);
  assert.equal(canonical.planes.sagittal.humanReviewRequired, null);
  assert.equal(canonical.planes.sagittal.notClinicalDiagnosis, null);
  assert.notEqual(canonical.planes.sagittal.humanReviewRequired, true);
});

test("I schema v2 sin campo obligatorio lanza ContractError", () => {
  const raw = deepClone(fixtures.rawMultiplanarRunV2Fixture);
  delete raw.humanReviewRequired;
  assert.throws(() => adapter.parseMultiplanarRunResponse(raw), (error) => {
    assert.ok(error instanceof ContractError);
    assert.equal(error.path, "/api/ai/multiplanar/run");
    assert.ok(error.body.missingField.includes("humanReviewRequired"));
    return true;
  });
});

test("J synthetic=true no puede aparecer como real disponible", () => {
  const raw = deepClone(fixtures.rawMultiplanarRunV2Fixture);
  raw.planes.sagittal.synthetic = true;
  const canonical = adapter.parseMultiplanarRunResponse(raw);
  assert.equal(canonical.planes.sagittal.synthetic, true);
  const legacy = adapter.canonicalRunToLegacyViewModel(canonical);
  assert.equal(legacy.planes.sagittal.synthetic, true);
});

test("K fallbackReason no se pierde", () => {
  const raw = deepClone(fixtures.rawMultiplanarRunV2Fixture);
  raw.fallbackReason = "sagittal_model_unavailable";
  raw.planes.sagittal.fallbackReason = "sagittal_model_unavailable";
  const canonical = adapter.parseMultiplanarRunResponse(raw);
  assert.equal(canonical.fallbackReason, "sagittal_model_unavailable");
  assert.equal(canonical.planes.sagittal.fallbackReason, "sagittal_model_unavailable");
});

test("L rutas internas y assets privados no llegan al modelo publico", () => {
  const canonical = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV1Fixture);
  const urls = canonical.planes.sagittal.assets.map((asset) => asset.url);
  const serialized = JSON.stringify(canonical);
  assert.ok(!serialized.includes("mask.npy"));
  assert.ok(!serialized.includes("C:\\\\ai-module"));
  assert.ok(!urls.some((url) => /^[a-zA-Z]:\\/.test(url)));
  assert.equal(canonical.planes.sagittal.assets.length, 2);
});

test("M conversion temporal al view model conserva las 9 mediciones", () => {
  const canonical = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV2Fixture);
  const legacy = adapter.canonicalRunToLegacyViewModel(canonical);
  assert.equal(legacy.planes.sagittal.measurements.length, 9);
});

test("N nombres espanoles siguen resolviendose mediante clinicalDisplay.ts", () => {
  const canonical = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV2Fixture);
  const legacy = adapter.canonicalRunToLegacyViewModel(canonical);
  const spanishLabels = legacy.planes.sagittal.measurements.map((m) => display.displayMeasurementLabel(m.label));
  assert.ok(spanishLabels.includes("Área del canal espinal"));
  assert.ok(spanishLabels.includes("Altura del grupo vertebral"));
  assert.equal(new Set(spanishLabels).size, 9);
});

test("O status de gobernanza no positivo por defecto para v1 sin synthetic informado", () => {
  const canonical = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV1Fixture);
  assert.equal(canonical.synthetic, null);
  assert.notEqual(canonical.synthetic, true);
  assert.notEqual(canonical.synthetic, false);
});

test("P9-C.1.1 A respuesta publica v2 sin synthetic directo pero con degradedMode=false no lanza ContractError", () => {
  const canonical = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV2PublicPresenterFixture);
  assert.equal(canonical.synthetic, false);
  assert.equal(canonical.degradedMode, false);
  assert.equal(canonical.planes.sagittal.synthetic, false);
});

test("P9-C.1.1 B respuesta v2 sin synthetic ni degradedMode en ninguna fuente lanza ContractError identificando synthetic", () => {
  assert.throws(() => adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV2MissingGovernanceFixture), (error) => {
    assert.ok(error instanceof ContractError);
    assert.ok(error.body.missingField.includes("synthetic"));
    return true;
  });
});

test("P9-C.1.1 C respuesta fallback conserva synthetic/fallbackReason y bloquea inferencia real en el legacy view model", () => {
  const canonical = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV2FallbackPresenterFixture);
  assert.equal(canonical.synthetic, true);
  assert.equal(canonical.planes.sagittal.synthetic, true);
  assert.equal(canonical.planes.sagittal.fallbackReason, "sagittal_model_unavailable_switched_to_synthetic");
  assert.equal(canonical.fallbackReason, "sagittal_model_unavailable_switched_to_synthetic");

  const legacy = adapter.canonicalRunToLegacyViewModel(canonical);
  assert.equal(legacy.planes.sagittal.allowContractFallback, true);
  assert.equal(legacy.planes.sagittal.aiOutput.realInferenceAvailable, false);
  assert.equal(legacy.degradedMode, true);
});

test("P9-C.1.1 D respuesta real_baseline limpia habilita allowContractFallback=false y realInferenceAvailable=true", () => {
  const canonical = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV2PublicPresenterFixture);
  const legacy = adapter.canonicalRunToLegacyViewModel(canonical);
  assert.equal(legacy.planes.sagittal.allowContractFallback, false);
  assert.equal(legacy.planes.sagittal.aiOutput.realInferenceAvailable, true);
  assert.equal(legacy.degradedMode, false);
  assert.equal(legacy.planes.sagittal.requestedInferenceMode, "real_baseline");
});

test("P9-C.1.1 E readiness integrado: presenter publico real habilita evaluateSagittalReviewReadiness (modelo canonico directo, P9-C.2)", () => {
  const canonical = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV2PublicPresenterFixture);
  const result = readiness.evaluateSagittalReviewReadiness(canonical);
  assert.equal(result.ready, true, `reasons: ${result.reasons.join(" | ")}`);
  assert.equal(result.reasons.length, 0);
  assert.equal(readiness.resolveReviewWorkspaceMode(canonical), "sagittal_only");
});

test("P9-C.1.1 F v1 sin synthetic ni degradedMode no lanza ContractError al parsear", () => {
  const canonical = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV1Fixture);
  assert.equal(canonical.synthetic, null);
  assert.equal(canonical.planes.sagittal.synthetic, null);
});

console.log(`P9-C.1 canonical contract tests passed: ${count}`);
