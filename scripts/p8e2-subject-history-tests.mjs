import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();

function loadStudyMetadata() {
  const source = readFileSync(join(root, "src/studyMetadata.ts"), "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/export /g, "");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = { exports: {}, console };
  vm.runInNewContext(`${js}
exports.validateSubjectRef = validateSubjectRef;
exports.normalizeStudyMetadataInput = normalizeStudyMetadataInput;
exports.priorityToBackend = priorityToBackend;`, sandbox);
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
    useMemo: (fn) => fn(),
    useState: (initial) => [initial, () => undefined],
    displayReviewStatus: (value) => value === "aceptado" ? "Finalizado" : value,
    displayStudyDate: (value) => value ?? "Fecha no informada",
    PriorityBadge: () => ({}),
    ReviewBadge: () => ({}),
    require: (id) => id === "react/jsx-runtime" ? { jsx: () => ({}), jsxs: () => ({}), Fragment: "Fragment" } : {},
  };
  vm.runInNewContext(`${js}
exports.buildPatients = buildPatients;`, sandbox);
  return sandbox.exports;
}

const metadata = loadStudyMetadata();
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
    ...overrides,
  };
}

test("A subjectRef SPIDER-101 es válido y se normaliza en studyMetadata", () => {
  assert.equal(metadata.validateSubjectRef(" SPIDER-101 "), null);
  assert.equal(JSON.stringify(metadata.normalizeStudyMetadataInput({
    subjectRef: " SPIDER-101 ",
    studyDate: "2026-07-26",
    modality: "MRI",
    description: " RM lumbar sagital T2 ",
    reviewPriority: "medium",
  })), JSON.stringify({
    subjectRef: "SPIDER-101",
    studyDate: "2026-07-26",
    modality: "MRI",
    description: "RM lumbar sagital T2",
    reviewPriority: "medium",
  }));
});

test("B análisis sin subjectRef sigue permitido", () => {
  assert.equal(metadata.validateSubjectRef(""), null);
  assert.equal(metadata.normalizeStudyMetadataInput({ subjectRef: "", studyDate: "", modality: "", description: "", reviewPriority: "low" }).subjectRef, null);
});

test("C subjectRef inválido se bloquea en cliente", () => {
  for (const value of ["ab", "SPIDER 101", "mail@example.com", "SPIDER/101", "SPIDER\\101"]) {
    assert.match(metadata.validateSubjectRef(value), /referencia/i);
  }
});

test("D priority clínica local se mapea al contrato backend", () => {
  assert.equal(metadata.priorityToBackend("alta"), "high");
  assert.equal(metadata.priorityToBackend("media"), "medium");
  assert.equal(metadata.priorityToBackend("baja"), "low");
});

test("E AnalysisTimelineView envía studyMetadata solo en run y no en upload", () => {
  const source = readFileSync(join(root, "src/components/AnalysisTimelineView.tsx"), "utf8");
  assert.match(source, /studyMetadata:\s*normalizedStudyMetadata/);
  assert.match(source, /uploadAiInput\(file,\s*normalizedCaseId,\s*plane\)/);
  assert.doesNotMatch(source, /uploadAiInput\(file,\s*normalizedCaseId,\s*plane,\s*studyMetadata/);
});

test("F updateStudyMetadata usa PUT /api/studies/{caseId}/metadata con JWT", () => {
  const source = readFileSync(join(root, "src/studyApi.ts"), "utf8");
  assert.match(source, /export async function updateStudyMetadata/);
  assert.match(source, /\/api\/studies\/\$\{encodeURIComponent\(caseId\)\}\/metadata/);
  assert.match(source, /method:\s*"PUT"/);
  assert.match(source, /authHeaders\(\)/);
  assert.match(source, /SUBJECT_REFERENCE_CONFLICT/);
});

test("G dos estudios con SPIDER-101 aparecen agrupados", () => {
  const rows = patients.buildPatients([study({ caseId: "CASE-A", subjectRef: "SPIDER-101" }), study({ caseId: "CASE-B", subjectRef: "SPIDER-101" })]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "subject");
  assert.equal(rows[0].target.subjectRef, "SPIDER-101");
  assert.equal(rows[0].totalStudies, 2);
});

test("H SPIDER-202 no aparece en SPIDER-101", () => {
  const rows = patients.buildPatients([study({ caseId: "CASE-A", subjectRef: "SPIDER-101" }), study({ caseId: "CASE-C", subjectRef: "SPIDER-202" })]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.target.subjectRef === "SPIDER-101").totalStudies, 1);
});

test("I dos estudios null generan dos trazabilidades individuales", () => {
  const rows = patients.buildPatients([study({ caseId: "CASE-A", subjectRef: null }), study({ caseId: "CASE-B", subjectRef: null })]);
  assert.equal(rows.length, 2);
  assert.equal(rows.every((row) => row.kind === "study"), true);
  assert.equal(JSON.stringify(rows.map((row) => row.target.caseId).sort()), JSON.stringify(["CASE-A", "CASE-B"]));
});

test("J historial subject consulta /api/subjects/{subjectRef}/history", () => {
  const source = readFileSync(join(root, "src/subjectHistoryApi.ts"), "utf8");
  assert.match(source, /\/api\/subjects\/\$\{encodeURIComponent\(subjectRef\)\}\/history/);
});

test("K trazabilidad de estudio no llama endpoint de sujetos", () => {
  const source = readFileSync(join(root, "src/App.tsx"), "utf8");
  assert.match(source, /historyTarget\.kind === "study"/);
  assert.match(source, /fetchStudyDetail\(\{ caseId: historyTarget\.caseId \}\)/);
});

test("L no se fabrican CASE-HISTORY ni métricas ficticias", () => {
  const historySource = readFileSync(join(root, "src/subjectHistoryApi.ts"), "utf8");
  const viewSource = readFileSync(join(root, "src/components/PatientHistoryView.tsx"), "utf8");
  assert.doesNotMatch(historySource, /CASE-HISTORY/);
  assert.doesNotMatch(viewSource, /lordosisAngle|canalDiameter|averageDiscHeight|l45DiscHeight/);
  assert.match(viewSource, /No disponible/);
  assert.match(viewSource, /measurementsByPlane/);
});

test("M StudyReviewView abre formulario real y refresca después del éxito", () => {
  const source = readFileSync(join(root, "src/components/StudyReviewView.tsx"), "utf8");
  assert.match(source, /setMetadataDialogOpen\(true\)/);
  assert.match(source, /updateStudyMetadata\(caseId,\s*payload\)/);
  assert.match(source, /onStudyMetadataUpdated\?\.\(caseId\)/);
});

test("N App no usa historial local como fallback longitudinal subject", () => {
  const source = readFileSync(join(root, "src/App.tsx"), "utf8");
  assert.match(source, /historyTarget\?\.kind === "subject"\s*\?\s*patientHistoryResponse\?\.studies \?\? \[\]/);
});

console.log(`P8-E2 subject history tests passed: ${count}`);
