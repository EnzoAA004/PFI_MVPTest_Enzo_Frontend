import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const patientApiSource = readFileSync("src/patientApi.ts", "utf8");
const patientsViewSource = readFileSync("src/components/PatientsView.tsx", "utf8");
const patientDetailSource = readFileSync("src/components/PatientDetailView.tsx", "utf8");
const appSource = readFileSync("src/App.tsx", "utf8");
const routesSource = readFileSync("src/routes.ts", "utf8");

class ContractError extends Error {
  constructor(message, path) {
    super(message);
    this.path = path;
  }
}

function loadPatientApi() {
  const source = patientApiSource.replace(/^import .*$/gm, "").replace(/export /g, "");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const sandbox = { exports: {}, console, ContractError, URLSearchParams, multiplanarRequest: async () => ({}) };
  vm.runInNewContext(`${js}
exports.parsePatient = parsePatient;
exports.parsePatientSearch = parsePatientSearch;
exports.parsePatientStudies = parsePatientStudies;
exports.isValidPatientId = isValidPatientId;`, sandbox);
  return sandbox.exports;
}

function loadPatientDetailHelpers() {
  const source = patientDetailSource
    .replace(/import[\s\S]*?from "[^\"]+";\r?\n/g, "")
    .replace(/export /g, "");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const sandbox = {
    exports: {},
    console,
    Intl,
    Date,
    require: (id) => id === "react/jsx-runtime" ? { jsx: () => ({}), jsxs: () => ({}), Fragment: "Fragment" } : {},
  };
  vm.runInNewContext(`${js}
exports.sortPatientStudies = sortPatientStudies;
exports.displayPatientStudyDate = displayPatientStudyDate;
exports.displayPatientStudyStatus = displayPatientStudyStatus;`, sandbox);
  return sandbox.exports;
}

const api = loadPatientApi();
const detail = loadPatientDetailHelpers();
const patientId = "11111111-1111-4111-8111-111111111111";

function patient(overrides = {}) {
  return {
    id: patientId,
    patientReference: "PAC-001",
    createdAt: "2026-08-12T10:00:00Z",
    updatedAt: "2026-08-12T10:00:00Z",
    ...overrides,
  };
}

function study(overrides = {}) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    caseId: "CASE-001",
    studyDate: "2026-08-12",
    modality: "MRI",
    description: "Lumbar",
    reviewPriority: "medium",
    status: "completed",
    ...overrides,
  };
}

let count = 0;
function test(name, fn) {
  fn();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

test("1 PatientSummaryDto real contiene solo identidad pseudonima y timestamps", () => {
  assert.deepEqual(Object.keys(api.parsePatient(patient())), ["id", "patientReference", "createdAt", "updatedAt"]);
});

test("2 la lista real parsea Patients persistidos sin agregados inventados", () => {
  assert.equal(api.parsePatientSearch([patient()])[0].patientReference, "PAC-001");
  assert.doesNotMatch(patientApiSource, /studyCount|latestStudyDate|latestStatus/);
});

test("3 Studies del Patient usan el contrato summary", () => {
  assert.equal(api.parsePatientStudies([study()], patientId)[0].caseId, "CASE-001");
});

test("4 Study summary acepta metadata nullable", () => {
  const parsed = api.parsePatientStudies([study({ studyDate: null, modality: null, description: null, reviewPriority: null, status: null })], patientId)[0];
  assert.equal(parsed.studyDate, null);
  assert.equal(parsed.status, null);
});

test("5 parser fail-closed rechaza payload Patient incompleto", () => {
  assert.throws(() => api.parsePatient({ id: patientId }), ContractError);
});

test("6 la lista busca con el cliente Patient compartido", () => {
  assert.match(patientsViewSource, /searchPatients\(query, 100\)/);
});

test("7 la busqueda tiene debounce y no dispara por render", () => {
  assert.match(patientsViewSource, /window\.setTimeout/);
  assert.match(patientsViewSource, /}, 300\)/);
});

test("8 la lista muestra loading accesible", () => {
  assert.match(patientsViewSource, /aria-busy=\{state\.status === "loading"\}/);
  assert.match(patientsViewSource, /Consultando pacientes/);
});

test("9 la lista tiene empty state inicial", () => {
  assert.match(patientsViewSource, /No hay pacientes registrados todav/);
});

test("10 la lista tiene error y retry", () => {
  assert.match(patientsViewSource, /No se pudo cargar la lista de pacientes/);
  assert.match(patientsViewSource, /setRetryNonce/);
});

test("11 la busqueda se puede limpiar", () => {
  assert.match(patientsViewSource, /setQuery\(""\)/);
  assert.match(patientsViewSource, /Limpiar b/);
});

test("12 la lista no hace N+1 de Studies", () => {
  assert.doesNotMatch(patientsViewSource, /getPatientStudies|getPatient\(/);
});

test("13 la seleccion es explicita y navega por patientId", () => {
  assert.match(patientsViewSource, /onOpenPatient\(patient\.id\)/);
});

test("14 UUID no se muestra como nombre principal", () => {
  assert.match(patientsViewSource, /<strong>\{patient\.patientReference\}<\/strong>/);
  assert.doesNotMatch(patientsViewSource, />\{patient\.id\}</);
  assert.doesNotMatch(patientDetailSource, />\{patientId\}</);
});

test("15 Patient Detail carga identidad real", () => {
  assert.match(patientDetailSource, /getPatient\(patientId\)/);
});

test("16 Patient Detail carga Studies por patientId", () => {
  assert.match(patientDetailSource, /getPatientStudies\(patientId\)/);
});

test("17 UUID invalido se resuelve sin request", () => {
  assert.equal(api.isValidPatientId("no-es-uuid"), false);
  assert.match(patientDetailSource, /if \(!isValidPatientId\(patientId\)\)/);
});

test("18 400 y 404 producen Patient no encontrado", () => {
  assert.match(patientDetailSource, /error\.status === 400 \|\| error\.status === 404/);
  assert.match(patientDetailSource, /Paciente no encontrado/);
});

test("19 Patient con cero Studies tiene estado valido", () => {
  assert.match(patientDetailSource, /state\.studies\.length === 0/);
  assert.match(patientDetailSource, /todav/);
});

test("20 Patient con multiples Studies renderiza toda la respuesta", () => {
  assert.match(patientDetailSource, /state\.studies\.map\(\(study\)/);
});

test("21 timeline ordena fechas descendentes y deja null al final", () => {
  const sorted = detail.sortPatientStudies([
    study({ id: "null", caseId: "CASE-NULL", studyDate: null }),
    study({ id: "old", caseId: "CASE-OLD", studyDate: "2025-03-03" }),
    study({ id: "new", caseId: "CASE-NEW", studyDate: "2026-08-12" }),
  ]);
  assert.deepEqual(Array.from(sorted, (entry) => entry.caseId), ["CASE-NEW", "CASE-OLD", "CASE-NULL"]);
});

test("22 Study sin fecha clinica no usa createdAt como fecha", () => {
  assert.equal(detail.displayPatientStudyDate(null), "Fecha no informada");
  assert.doesNotMatch(patientDetailSource, /study\.createdAt/);
});

test("23 abrir Study usa caseId", () => {
  assert.match(patientDetailSource, /onOpenStudy\(study\.caseId\)/);
  assert.match(appSource, /pathForStudy\(caseId\)/);
});

test("24 Patient nunca se deriva de subjectRef", () => {
  assert.doesNotMatch(patientsViewSource, /subjectRef|buildPatients|StudyRow/);
  assert.doesNotMatch(patientDetailSource, /subjectRef|fetchSubjectHistory/);
});

test("25 Study legacy null no fabrica Patient", () => {
  assert.doesNotMatch(appSource, /buildPatients|PatientHistoryView|fetchSubjectHistory/);
  assert.match(appSource, /<PatientsView/);
});

test("26 dos Studies del endpoint Patient aparecen juntos aunque no tengan subjectRef", () => {
  const parsed = api.parsePatientStudies([
    study({ id: "one", caseId: "CASE-ONE" }),
    study({ id: "two", caseId: "CASE-TWO" }),
  ], patientId);
  assert.deepEqual(Array.from(parsed, (entry) => entry.caseId), ["CASE-ONE", "CASE-TWO"]);
});

test("27 rutas Patient y Study conservan identidades separadas", () => {
  assert.match(routesSource, /\/pacientes/);
  assert.match(routesSource, /\/estudio/);
  assert.match(appSource, /pathForPatient\(patientId\)/);
  assert.match(appSource, /pathForStudy\(caseId\)/);
});

console.log(`PATIENT-PR4 tests passed: ${count}`);
