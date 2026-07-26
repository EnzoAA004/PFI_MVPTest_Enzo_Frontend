import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();

function loadStudyApiHelpers() {
  const source = readFileSync(join(root, "src/studyApi.ts"), "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/import\.meta\.env/g, "({ DEV: false })")
    .replace(/export /g, "");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = {
    exports: {},
    console,
    API_BASE_URL: "https://backend.example",
    ApiError: class ApiError extends Error {},
    ContractError: class ContractError extends Error {},
    authHeaders: () => ({ Authorization: "Bearer test-token" }),
  };
  vm.runInNewContext(`${js}
exports.normalizePersistedCorrection = normalizePersistedCorrection;
exports.applyCorrectionsToMeasurements = applyCorrectionsToMeasurements;`, sandbox);
  return sandbox.exports;
}

const { normalizePersistedCorrection, applyCorrectionsToMeasurements } = loadStudyApiHelpers();

let count = 0;
function test(name, fn) {
  fn();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

const baseMeasurements = {
  sagittal: [
    {
      id: "canal-width",
      label: "Ancho del canal",
      value: 33.85,
      aiValue: 33.85,
      unit: "mm",
      confidence: 0.91,
      plane: "sagittal",
      source: "AI",
      status: "pendiente",
      outlier: false,
      linkedLandmarks: ["canal-left", "canal-right"],
    },
  ],
};

test("A normalizePersistedCorrection acepta afterValue string/number/null y plane opcional", () => {
  const correction = normalizePersistedCorrection({
    id: "c1",
    studyRunId: "multi-1",
    measurementId: "canal-width",
    beforeValue: { value: 33.85, unit: "mm", confidence: 0.91, plane: "sagittal" },
    afterValue: { value: "34.10", unit: "mm", plane: "sagittal" },
    comment: "ajuste",
    createdAt: "2026-07-26T10:00:00Z",
  }, 0);
  assert.equal(correction.measurementId, "canal-width");
  assert.equal(correction.afterValue.value, "34.10");
});

test("B reviewerValue persistido se rehidrata sin destruir aiValue", () => {
  const corrected = applyCorrectionsToMeasurements(baseMeasurements, [{
    measurementId: "canal-width",
    beforeValue: { value: 33.85, unit: "mm", confidence: 0.91, plane: "sagittal" },
    afterValue: { value: 34.10, unit: "mm", plane: "sagittal" },
    createdAt: "2026-07-26T10:00:00Z",
  }]);
  const [row] = corrected.sagittal;
  assert.equal(row.aiValue, 33.85);
  assert.equal(row.value, 34.10);
  assert.equal(row.reviewerValue, 34.10);
  assert.equal(row.confidence, 0.91);
  assert.deepEqual(row.linkedLandmarks, ["canal-left", "canal-right"]);
  assert.equal(row.source, "Reviewer");
  assert.equal(row.status, "editado");
});

test("C segunda correccion mas reciente gana", () => {
  const corrected = applyCorrectionsToMeasurements(baseMeasurements, [
    { measurementId: "canal-width", beforeValue: { value: 33.85 }, afterValue: { value: 34.10 }, createdAt: "2026-07-26T10:00:00Z" },
    { measurementId: "canal-width", beforeValue: { value: 33.85 }, afterValue: { value: 34.25 }, createdAt: "2026-07-26T11:00:00Z" },
  ]);
  assert.equal(corrected.sagittal[0].reviewerValue, 34.25);
});

test("D sin fecha gana la ultima del array", () => {
  const corrected = applyCorrectionsToMeasurements(baseMeasurements, [
    { measurementId: "canal-width", beforeValue: { value: 33.85 }, afterValue: { value: 34.10 } },
    { measurementId: "canal-width", beforeValue: { value: 33.85 }, afterValue: { value: 34.40 } },
  ]);
  assert.equal(corrected.sagittal[0].reviewerValue, 34.40);
});

test("E correction sin measurementId valido no fabrica medicion", () => {
  assert.equal(normalizePersistedCorrection({ beforeValue: { value: 1 }, afterValue: { value: 2 } }, 0), null);
  const corrected = applyCorrectionsToMeasurements(baseMeasurements, [{
    measurementId: "missing-measurement",
    beforeValue: { value: 1 },
    afterValue: { value: 2 },
  }]);
  assert.equal(corrected.sagittal.length, 1);
  assert.equal(corrected.sagittal[0].id, "canal-width");
});

test("F restaurar a IA puede persistirse como correccion explicita", () => {
  const corrected = applyCorrectionsToMeasurements(baseMeasurements, [{
    measurementId: "canal-width",
    beforeValue: { value: 33.85, unit: "mm" },
    afterValue: { value: 33.85, unit: "mm" },
  }]);
  assert.equal(corrected.sagittal[0].reviewerValue, 33.85);
  assert.equal(corrected.sagittal[0].aiValue, 33.85);
});

test("G StudyReviewView no conserva opacidad duplicada ni aprobacion en toolbar", () => {
  const source = readFileSync(join(root, "src/components/StudyReviewView.tsx"), "utf8");
  assert.equal(source.includes("overlayOpacidad"), false);
  assert.equal(source.includes("Superposición IA"), false);
  assert.equal(source.includes(">Aprobar</button>"), false);
});

test("H panel de decision usa Guardar borrador y Confirmar estado", () => {
  const source = readFileSync(join(root, "src/components/StudyReviewView.tsx"), "utf8");
  assert.match(source, /Guardar borrador/);
  assert.match(source, /Confirmar estado/);
  assert.equal(source.includes("Aprobar y completar"), false);
});

test("I tabla de mediciones queda en panel ancho", () => {
  const source = readFileSync(join(root, "src/components/StudyReviewView.tsx"), "utf8");
  assert.match(source, /measurements-wide-panel/);
  assert.match(source, /Valor IA original/);
  assert.match(source, /Valor del revisor/);
});

console.log(`P8-D3 corrections rehydration tests passed: ${count}`);
