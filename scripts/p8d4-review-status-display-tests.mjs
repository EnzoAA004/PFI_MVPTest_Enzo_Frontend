import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();

function normalizeAiAssetUrl(value, apiBaseUrl = "") {
  const rawUrl = typeof value === "string" ? value : value?.url ?? value?.proxyUrl;
  if (typeof rawUrl !== "string") return undefined;
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  if (rawUrl.startsWith("/api/")) return `${apiBaseUrl}${rawUrl}`;
  return undefined;
}

function loadGuards() {
  const source = readFileSync(join(root, "src/appDataGuards.ts"), "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/export /g, "");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = { exports: {}, console, API_BASE_URL: "https://backend.example", normalizeAiAssetUrl };
  vm.runInNewContext(`${js}
exports.selectReviewableRunFromDetail = selectReviewableRunFromDetail;
exports.isReviewQueueItem = isReviewQueueItem;
exports.deriveSummary = deriveSummary;`, sandbox);
  return sandbox.exports;
}

function loadClinicalDisplay() {
  const source = readFileSync(join(root, "src/clinicalDisplay.ts"), "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/export /g, "");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = { exports: {}, console };
  vm.runInNewContext(`${js}
exports.displayReviewStatus = displayReviewStatus;
exports.displayInferenceMode = displayInferenceMode;
exports.displayMeasurementLabel = displayMeasurementLabel;
exports.displayUnit = displayUnit;`, sandbox);
  return sandbox.exports;
}

function loadPatients() {
  const source = readFileSync(join(root, "src/components/PatientsView.tsx"), "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/export /g, "");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const sandbox = {
    exports: {},
    console,
    React: {},
    useMemo: (fn) => fn(),
    useState: (initial) => [initial, () => undefined],
    displayReviewStatus: (value) => value === "aceptado" ? "Finalizado" : value,
    displayStudyDate: (value) => value ?? "Fecha no informada",
    displaySubjectRef: (value) => value ?? "Referencia de paciente no informada",
    PriorityBadge: () => ({}),
    ReviewBadge: () => ({}),
    require: (id) => id === "react/jsx-runtime" ? { jsx: () => ({}), jsxs: () => ({}), Fragment: "Fragment" } : {},
  };
  vm.runInNewContext(`${js}
exports.buildPatients = buildPatients;`, sandbox);
  return sandbox.exports;
}

const guards = loadGuards();
const display = loadClinicalDisplay();
const patients = loadPatients();

let count = 0;
function test(name, fn) {
  fn();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

function study(overrides = {}) {
  return {
    caseId: "CASE-1",
    subjectRef: null,
    studyDate: "2026-07-26",
    status: "created",
    planes: ["sagittal"],
    primaryPlane: "sagittal",
    latestRunId: "multi-1",
    modelKey: "sagittal_spider",
    modelStatus: "completed",
    reviewStatus: "pendiente",
    priority: "media",
    dataOrigin: "database",
    runId: "multi-1",
    plane: "sagittal",
    ...overrides,
  };
}

function run(overrides = {}) {
  return {
    runId: "multi-1",
    caseId: "CASE-1",
    planes: ["sagittal"],
    primaryPlane: "sagittal",
    status: "completed",
    reviewStatus: "aceptado",
    reviewer: "Dra. Demo",
    reviewedAt: "2026-07-26T12:00:00Z",
    updatedAt: "2026-07-26T12:01:00Z",
    comments: "Aprobado por revisor",
    sagittalRunId: "sag-1",
    sagittalModelKey: "sagittal_spider",
    measurementsByPlane: { sagittal: [] },
    artifactsByPlane: { sagittal: [] },
    dataOrigin: "database",
    ...overrides,
  };
}

test("A selected run toma reviewStatus de firstRun aunque detail.review no exista", () => {
  const reviewable = guards.selectReviewableRunFromDetail({ study: study({ reviewStatus: "pendiente" }), runs: [run()], humanReviewRequired: true, notClinicalDiagnosis: true });
  assert.equal(reviewable.review.status, "aceptado");
  assert.equal(reviewable.review.notes, "Aprobado por revisor");
  assert.equal(reviewable.review.reviewer, "Dra. Demo");
});

test("B detail.review antiguo no pisa firstRun.reviewStatus", () => {
  const reviewable = guards.selectReviewableRunFromDetail({ study: study(), review: { status: "pendiente", notes: "viejo" }, runs: [run({ reviewStatus: "observado", comments: "observado persistido" })] });
  assert.equal(reviewable.review.status, "observado");
  assert.equal(reviewable.review.notes, "observado persistido");
});

test("C pending accepted refresh no queda en cola", () => {
  const before = [study({ reviewStatus: "pendiente" })];
  const after = [study({ reviewStatus: "aceptado" })];
  assert.equal(before.filter(guards.isReviewQueueItem).length, 1);
  assert.equal(after.filter(guards.isReviewQueueItem).length, 0);
  assert.equal(guards.deriveSummary(after).completed, 1);
});

test("D isReviewQueueItem solo admite pendiente y observado", () => {
  assert.equal(guards.isReviewQueueItem(study({ reviewStatus: "pendiente" })), true);
  assert.equal(guards.isReviewQueueItem(study({ reviewStatus: "observado" })), true);
  assert.equal(guards.isReviewQueueItem(study({ reviewStatus: "aceptado" })), false);
  assert.equal(guards.isReviewQueueItem(study({ reviewStatus: "descartado" })), false);
});

test("E diccionario muestra labels sin mutar claves tecnicas", () => {
  const key = "canal width";
  assert.equal(display.displayMeasurementLabel(key), "Ancho del canal espinal");
  assert.equal(key, "canal width");
  assert.equal(display.displayReviewStatus("aceptado"), "Finalizado");
  assert.equal(display.displayInferenceMode("real_baseline"), "Inferencia real de referencia");
  assert.equal(display.displayUnit("mm2"), "mm²");
  assert.equal(display.displayMeasurementLabel("unknown_metric_key"), "unknown metric key");
});

test("F dos subjectRef null generan dos filas de trazabilidad", () => {
  const rows = patients.buildPatients([study({ caseId: "CASE-A", subjectRef: null }), study({ caseId: "CASE-B", subjectRef: null })]);
  assert.equal(rows.length, 2);
  assert.equal(rows.every((row) => row.kind === "study"), true);
  assert.equal(JSON.stringify(rows.map((row) => row.target.caseId).sort()), JSON.stringify(["CASE-A", "CASE-B"]));
});

test("G subjectRef real agrupa estudios longitudinalmente", () => {
  const rows = patients.buildPatients([study({ caseId: "CASE-A", subjectRef: "SUBJ-1" }), study({ caseId: "CASE-B", subjectRef: "SUBJ-1" })]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "subject");
  assert.equal(rows[0].target.subjectRef, "SUBJ-1");
  assert.equal(rows[0].totalStudies, 2);
});

test("H estilos semanticos de botones existen", () => {
  const css = readFileSync(join(root, "src/design/components.css"), "utf8");
  for (const className of [".button-primary", ".button-secondary", ".button-neutral", ".button-danger", ".button-disabled"]) {
    assert.ok(css.includes(className), `${className} existe`);
  }
  assert.match(css, /focus-visible/);
  assert.match(css, /cursor: not-allowed/);
});

test("I confirmar estado queda disabled en Pendiente y habilitable en Finalizado", () => {
  const source = readFileSync(join(root, "src/components/StudyReviewView.tsx"), "utf8");
  assert.match(source, /const confirmDisabled = saving \|\| reviewStatus === "pendiente"/);
  assert.match(source, /<option value="aceptado">Finalizado<\/option>/);
});

console.log(`P8-D4 review status display tests passed: ${count}`);
