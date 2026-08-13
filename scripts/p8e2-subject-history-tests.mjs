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

function loadSubjectHistory() {
  const source = readFileSync(join(root, "src/subjectHistoryApi.ts"), "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/export /g, "");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  class ApiError extends Error {
    constructor(message, options) {
      super(message);
      this.name = "ApiError";
      Object.assign(this, options);
    }
  }
  class ContractError extends Error {
    constructor(message, path, options = {}) {
      super(message);
      this.name = "ContractError";
      this.path = path;
      Object.assign(this, options);
    }
  }
  const sandbox = {
    exports: {},
    console,
    API_BASE_URL: "https://backend.example",
    authHeaders: () => ({ Authorization: "Bearer test-token" }),
    validateVisibleDataOrigin: () => undefined,
    applyCorrectionsToMeasurements: (measurements) => measurements,
    normalizePersistedCorrection: (entry) => entry && typeof entry === "object" && typeof entry.measurementId === "string" ? entry : null,
    ApiError,
    ContractError,
  };
  vm.runInNewContext(`${js}
exports.normalizeSubjectHistoryResponse = normalizeSubjectHistoryResponse;
exports.historyApiError = historyApiError;
exports.ApiError = ApiError;
exports.ContractError = ContractError;`, sandbox);
  return sandbox.exports;
}

const metadata = loadStudyMetadata();
const subjectHistory = loadSubjectHistory();

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

function validHistoryPayload(overrides = {}) {
  return {
    status: "ok",
    source: "postgres-domain",
    dataOrigin: "database",
    deidentified: true,
    subjectRef: "SPIDER-101",
    summary: { totalStudies: 1, pending: 1 },
    studies: [{
      caseId: "CASE-101",
      subjectRef: "SPIDER-101",
      studyDate: "2026-07-26",
      modality: "MRI",
      planes: ["sagittal"],
      modelKey: "sagittal_spider",
      modelVersion: "sagittal-spider-final-v1",
      reviewStatus: "pending",
      priority: "medium",
      measurementsByPlane: {
        sagittal: [{ measurementId: "m-1", label: "Canal", aiValue: 12.4, value: 12.4, unit: "mm" }],
      },
      corrections: [{ measurementId: "m-1", afterValue: { value: 12.1, unit: "mm", plane: "sagittal" } }],
    }],
    ...overrides,
  };
}

test("P8-E2.1 A subjectRef null queda editable en metadata", () => {
  const source = readFileSync(join(root, "src/components/StudyReviewView.tsx"), "utf8");
  const dialog = readFileSync(join(root, "src/components/StudyMetadataDialog.tsx"), "utf8");
  assert.match(source, /const subjectRefLocked = Boolean\(currentSubjectRef\)/);
  assert.match(dialog, /readOnly=\{subjectRefLocked\}/);
});

test("P8-E2.1 B subjectRef existente queda readOnly con aviso de inmutabilidad", () => {
  const dialog = readFileSync(join(root, "src/components/StudyMetadataDialog.tsx"), "utf8");
  assert.match(dialog, /La referencia de-identificada ya fue asignada y no puede reemplazarse/);
  assert.match(dialog, /Esto evita vincular estudios de personas distintas/);
});

test("P8-E2.1 C no se envia PUT para reemplazar solo subjectRef existente", () => {
  const source = readFileSync(join(root, "src/components/StudyReviewView.tsx"), "utf8");
  const saveFunction = source.slice(source.indexOf("async function saveStudyMetadata"), source.indexOf("function panelVisible"));
  assert.doesNotMatch(saveFunction, /window\.confirm/);
  assert.match(saveFunction, /payload\.subjectRef = currentSubjectRef/);
  assert.match(saveFunction, /La referencia de-identificada ya fue asignada y no puede reemplazarse/);
});

test("P8-E2.1 D la nueva lista de Patients no agrupa por subjectRef", () => {
  const source = readFileSync(join(root, "src/components/PatientsView.tsx"), "utf8");
  assert.match(source, /searchPatients\(query, 100\)/);
  assert.doesNotMatch(source, /subjectRef|buildPatients|StudyRow/);
});

test("P8-E2.1 E los Studies legacy no fabrican Patients en Frontend", () => {
  const source = readFileSync(join(root, "src/App.tsx"), "utf8");
  assert.doesNotMatch(source, /buildPatients|fetchSubjectHistory|PatientHistoryView/);
  assert.match(source, /<PatientsView/);
});

test("P8-E2.1 F source distinto de postgres-domain lanza ContractError", () => {
  assert.throws(() => subjectHistory.normalizeSubjectHistoryResponse(validHistoryPayload({ source: "frontend" }), "SPIDER-101"), subjectHistory.ContractError);
});

test("P8-E2.1 G dataOrigin distinto de database lanza ContractError", () => {
  assert.throws(() => subjectHistory.normalizeSubjectHistoryResponse(validHistoryPayload({ dataOrigin: "demo" }), "SPIDER-101"), subjectHistory.ContractError);
});

test("P8-E2.1 H deidentified distinto de true lanza ContractError", () => {
  assert.throws(() => subjectHistory.normalizeSubjectHistoryResponse(validHistoryPayload({ deidentified: false }), "SPIDER-101"), subjectHistory.ContractError);
});

test("P8-E2.1 I subjectRef de respuesta no coincide lanza ContractError", () => {
  assert.throws(() => subjectHistory.normalizeSubjectHistoryResponse(validHistoryPayload({ subjectRef: "SPIDER-999" }), "SPIDER-101"), subjectHistory.ContractError);
});

test("P8-E2.1 J studies ausente lanza ContractError", () => {
  const payload = validHistoryPayload();
  delete payload.studies;
  assert.throws(() => subjectHistory.normalizeSubjectHistoryResponse(payload, "SPIDER-101"), subjectHistory.ContractError);
});

test("P8-E2.1 K medicion sin id no recibe id sintetico", () => {
  const payload = validHistoryPayload({ studies: [{ ...validHistoryPayload().studies[0], measurementsByPlane: { sagittal: [{ label: "Canal", aiValue: 11.2, unit: "mm" }] } }] });
  const normalized = subjectHistory.normalizeSubjectHistoryResponse(payload, "SPIDER-101");
  assert.equal(normalized.studies[0].measurementsByPlane.sagittal.length, 0);
  assert.equal(JSON.stringify(normalized).includes("measurement-1"), false);
});

test("P8-E2.1 L respuesta valida conserva mediciones y correcciones", () => {
  const normalized = subjectHistory.normalizeSubjectHistoryResponse(validHistoryPayload(), "SPIDER-101");
  assert.equal(normalized.source, "postgres-domain");
  assert.equal(normalized.dataOrigin, "database");
  assert.equal(normalized.deidentified, true);
  assert.equal(normalized.studies[0].measurementsByPlane.sagittal[0].id, "m-1");
  assert.equal(normalized.studies[0].corrections[0].measurementId, "m-1");
});

test("P8-E2.1 M error HTTP preserva code y traceId", () => {
  const response = { status: 503, headers: { get: () => "trace-header" } };
  const error = subjectHistory.historyApiError("/api/subjects/SPIDER-101/history", response, { code: "DATABASE_UNAVAILABLE", traceId: "trace-json" });
  assert.equal(error.name, "ApiError");
  assert.equal(error.status, 503);
  assert.equal(error.code, "DATABASE_UNAVAILABLE");
  assert.equal(error.traceId, "trace-json");
  assert.match(error.message, /base de datos no está disponible/);
});

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

test("B código con espacios bloquea ejecución", () => {
  assert.match(metadata.validateSubjectRef("SPIDER 101"), /sin espacios/);
});

test("C código con @ bloquea ejecución", () => {
  assert.match(metadata.validateSubjectRef("mail@example.com"), /sin espacios/);
});

test("D análisis sin referencia sigue permitido", () => {
  assert.equal(metadata.validateSubjectRef(""), null);
  assert.equal(metadata.normalizeStudyMetadataInput({ subjectRef: "", studyDate: "", modality: "", description: "", reviewPriority: "low" }).subjectRef, null);
});

test("D2 subjectRef inválido cubre longitud y separadores prohibidos", () => {
  for (const value of ["ab", "SPIDER/101", "SPIDER\\101"]) {
    assert.match(metadata.validateSubjectRef(value), /referencia/i);
  }
});

test("D3 priority clínica local se mapea al contrato backend", () => {
  assert.equal(metadata.priorityToBackend("alta"), "high");
  assert.equal(metadata.priorityToBackend("media"), "medium");
  assert.equal(metadata.priorityToBackend("baja"), "low");
});

test("E NewAnalysisDrawer envía studyMetadata solo en run y no en upload", () => {
  const source = readFileSync(join(root, "src/features/worklist/NewAnalysisDrawer.tsx"), "utf8");
  assert.match(source, /studyMetadata:\s*normalizedStudyMetadata/);
  assert.match(source, /uploadAiInput\(file,\s*normalizedCaseId,\s*plane\)/);
  assert.doesNotMatch(source, /uploadAiInput\(file,\s*normalizedCaseId,\s*plane,\s*studyMetadata/);
  assert.match(source, /maxLength=\{200\}/);
});

test("F upload no incluye studyMetadata", () => {
  const uploadSource = readFileSync(join(root, "src/multiplanarApi.ts"), "utf8");
  assert.doesNotMatch(uploadSource, /studyMetadata/);
});

test("G metadata técnica de IA no incluye subjectRef", () => {
  const source = readFileSync(join(root, "src/features/worklist/NewAnalysisDrawer.tsx"), "utf8");
  const metadataBlock = source.slice(source.indexOf("metadata: {"), source.indexOf("...(axialReady"));
  assert.doesNotMatch(metadataBlock, /subjectRef|studyDate|modality|description|reviewPriority/);
});

test("H updateStudyMetadata usa PUT /api/studies/{caseId}/metadata con JWT", () => {
  const source = readFileSync(join(root, "src/studyApi.ts"), "utf8");
  assert.match(source, /export async function updateStudyMetadata/);
  assert.match(source, /\/api\/studies\/\$\{encodeURIComponent\(caseId\)\}\/metadata/);
  assert.match(source, /method:\s*"PUT"/);
  assert.match(source, /authHeaders\(\)/);
  assert.match(source, /SUBJECT_REFERENCE_CONFLICT/);
});

test("I PUT 409 no modifica UI local antes del 200", () => {
  const source = readFileSync(join(root, "src/components/StudyReviewView.tsx"), "utf8");
  const saveFunction = source.slice(source.indexOf("async function saveStudyMetadata"), source.indexOf("function panelVisible"));
  // El detalle ya no se guarda en la vista (lo posee App y viaja por props), asi que
  // la propiedad se verifica sobre lo que si le queda a la vista: nada de su UI
  // cambia hasta que el PUT resolvio.
  assert.match(saveFunction, /await updateStudyMetadata\(caseId, payload\)/);
  assert.match(saveFunction, /catch \(error\)/);
  assert.match(saveFunction, /setMetadataError/);
  const beforeAwait = saveFunction.slice(saveFunction.indexOf("try {"), saveFunction.indexOf("await updateStudyMetadata"));
  assert.doesNotMatch(beforeAwait, /setMetadataDialogOpen\(false\)|setSaveMessage/);
  assert.ok(
    saveFunction.indexOf("setMetadataDialogOpen(false)") > saveFunction.indexOf("await updateStudyMetadata"),
    "el dialogo solo se cierra despues del 200",
  );
});

test("J PUT 200 refresca estudio y worklist", () => {
  const appSource = readFileSync(join(root, "src/App.tsx"), "utf8");
  const reviewSource = readFileSync(join(root, "src/components/StudyReviewView.tsx"), "utf8");
  assert.match(reviewSource, /onStudyMetadataUpdated\?\.\(caseId\)/);
  assert.match(appSource, /await refreshStudiesFromPostgres\(\)/);
  assert.match(appSource, /await refreshSelectedStudyFromPostgres\(\)/);
});

test("K campos null se muestran correctamente", () => {
  const studyDisplay = readFileSync(join(root, "src/studyDisplay.ts"), "utf8");
  const clinicalDisplay = readFileSync(join(root, "src/clinicalDisplay.ts"), "utf8");
  assert.match(studyDisplay, /Referencia de paciente no informada/);
  assert.match(studyDisplay, /Fecha no informada/);
  assert.match(clinicalDisplay, /Resonancia magnética/);
  assert.match(clinicalDisplay, /No informada/);
});

test("L no se deriva referencia desde caseId, archivo o inputId", () => {
  const timeline = readFileSync(join(root, "src/features/worklist/NewAnalysisDrawer.tsx"), "utf8");
  const helper = readFileSync(join(root, "src/studyMetadata.ts"), "utf8");
  assert.doesNotMatch(helper, /caseId|fileName|inputId/);
  assert.doesNotMatch(timeline, /subjectRef:\s*normalizedCaseId|subjectRef:\s*file|subjectRef:\s*uploads/);
});

test("M Patient Detail no usa el endpoint legacy de subjectRef", () => {
  const source = readFileSync(join(root, "src/components/PatientDetailView.tsx"), "utf8");
  assert.match(source, /getPatientStudies\(patientId\)/);
  assert.doesNotMatch(source, /subjectRef|fetchSubjectHistory/);
});

test("N la identidad visible del Patient es patientReference", () => {
  const source = readFileSync(join(root, "src/components/PatientDetailView.tsx"), "utf8");
  assert.match(source, /state\.patient\.patientReference/);
  assert.doesNotMatch(source, />\{patientId\}</);
});

test("O el endpoint legacy de subjects se conserva aislado", () => {
  const source = readFileSync(join(root, "src/subjectHistoryApi.ts"), "utf8");
  assert.match(source, /\/api\/subjects\/\$\{encodeURIComponent\(subjectRef\)\}\/history/);
});

test("P historial subject consulta /api/subjects/{subjectRef}/history", () => {
  const source = readFileSync(join(root, "src/subjectHistoryApi.ts"), "utf8");
  assert.match(source, /\/api\/subjects\/\$\{encodeURIComponent\(subjectRef\)\}\/history/);
});

test("Q App navega Patient real por UUID y Study por caseId", () => {
  const source = readFileSync(join(root, "src/App.tsx"), "utf8");
  assert.match(source, /pathForPatient\(patientId\)/);
  assert.match(source, /pathForStudy\(caseId\)/);
  assert.doesNotMatch(source, /historyTarget|fetchSubjectHistory/);
});

test("R no se fabrican CASE-HISTORY ni métricas ficticias", () => {
  const historySource = readFileSync(join(root, "src/subjectHistoryApi.ts"), "utf8");
  const viewSource = readFileSync(join(root, "src/components/PatientHistoryView.tsx"), "utf8");
  assert.doesNotMatch(historySource, /CASE-HISTORY/);
  assert.doesNotMatch(viewSource, /lordosisAngle|canalDiameter|averageDiscHeight|l45DiscHeight/);
  assert.match(viewSource, /No disponible/);
  assert.match(viewSource, /measurementsByPlane/);
});

test("S StudyReviewView abre formulario real y refresca después del éxito", () => {
  const source = readFileSync(join(root, "src/components/StudyReviewView.tsx"), "utf8");
  assert.match(source, /setMetadataDialogOpen\(true\)/);
  assert.match(source, /updateStudyMetadata\(caseId,\s*payload\)/);
  assert.match(source, /onStudyMetadataUpdated\?\.\(caseId\)/);
});

test("T App no usa historial legacy como fallback longitudinal", () => {
  const source = readFileSync(join(root, "src/App.tsx"), "utf8");
  assert.doesNotMatch(source, /patientHistoryResponse|PatientHistoryView|historyTarget/);
  assert.match(source, /<PatientDetailView/);
});

console.log(`P8-E2 subject history tests passed: ${count}`);
