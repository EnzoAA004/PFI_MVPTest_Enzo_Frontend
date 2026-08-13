import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(path, exportNames, injected = {}) {
  const source = readFileSync(path, "utf8")
    .replace(/import\s+(?:type\s+)?[\s\S]*?\s+from\s+"[^"]+";\s*/g, "")
    .replace(/export /g, "");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const sandbox = { exports: {}, console, URLSearchParams, ...injected };
  vm.runInNewContext(`${js}\n${exportNames.map((name) => `exports.${name} = ${name};`).join("\n")}`, sandbox);
  return sandbox.exports;
}

class ContractError extends Error {
  constructor(message, path) {
    super(message);
    this.path = path;
  }
}

class BackendApiError extends Error {
  constructor(message, status, path, traceId, code) {
    super(message);
    this.status = status;
    this.path = path;
    this.traceId = traceId;
    this.code = code;
  }
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

const calls = [];
let requestHandler = async (path, init) => {
  calls.push({ path, init });
  if (path === "/api/patients" && init?.method === "POST") return patient("patient-created", "PAC-001");
  if (path.startsWith("/api/patients?")) return [patient("patient-a", "PAC-001")];
  if (path === "/api/patients/patient-a") return patient("patient-a", "PAC-001");
  if (path === "/api/studies/CASE-1/patient") return assignment();
  throw new Error(`Unexpected request ${path}`);
};

const api = load("src/patientApi.ts", [
  "parsePatient",
  "parsePatientSearch",
  "parseStudyPatientAssignment",
  "createPatient",
  "searchPatients",
  "getPatient",
  "associateStudyPatient",
], {
  ContractError,
  multiplanarRequest: (...args) => requestHandler(...args),
});

function patient(id = "patient-a", patientReference = "PAC-001") {
  return {
    id,
    patientReference,
    createdAt: "2026-08-12T12:00:00Z",
    updatedAt: "2026-08-12T12:00:00Z",
  };
}

function assignment(overrides = {}) {
  return {
    studyId: "study-1",
    caseId: "CASE-1",
    patientId: "patient-a",
    previousPatientId: null,
    reasonCode: "INITIAL_ASSIGNMENT",
    changed: true,
    ...overrides,
  };
}

await check("API POST crea Patient con el payload exacto", async () => {
  calls.length = 0;
  const result = await api.createPatient({ patientReference: "PAC-001" });
  assert.equal(calls[0].path, "/api/patients");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), { patientReference: "PAC-001" });
  assert.equal(result.id, "patient-created");
});

await check("API GET busca por query encoded y limit", async () => {
  calls.length = 0;
  const result = await api.searchPatients(" PAC 01 ", 12);
  assert.equal(calls[0].path, "/api/patients?query=PAC+01&limit=12");
  assert.equal(result[0].patientReference, "PAC-001");
});

await check("API GET obtiene Patient por id", async () => {
  calls.length = 0;
  const result = await api.getPatient("patient-a");
  assert.equal(calls[0].path, "/api/patients/patient-a");
  assert.equal(result.id, "patient-a");
});

await check("API PUT asocia Study con INITIAL_ASSIGNMENT", async () => {
  calls.length = 0;
  const result = await api.associateStudyPatient("CASE-1", {
    patientId: "patient-a",
    expectedPatientId: null,
    reason: "INITIAL_ASSIGNMENT",
  });
  assert.equal(calls[0].path, "/api/studies/CASE-1/patient");
  assert.equal(calls[0].init.method, "PUT");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    patientId: "patient-a",
    expectedPatientId: null,
    reason: "INITIAL_ASSIGNMENT",
  });
  assert.equal(result.changed, true);
});

await check("parser de Patient falla cerrado si falta un campo", () => {
  assert.throws(() => api.parsePatient({ id: "patient-a" }), /falta patientReference/);
});

for (const [name, status, code] of [
  ["400 invalido", 400, "INVALID_PATIENT_REFERENCE"],
  ["404 inexistente", 404, "PATIENT_NOT_FOUND"],
  ["409 duplicado", 409, "DUPLICATE_PATIENT_REFERENCE"],
]) {
  await check(`API propaga ${name} sin convertirlo en success`, async () => {
    requestHandler = async () => { throw new BackendApiError(name, status, "/api/patients", "trace", code); };
    await assert.rejects(
      () => api.createPatient({ patientReference: "PAC-001" }),
      (error) => error.status === status && error.code === code,
    );
  });
}

await check("API propaga network/server error", async () => {
  requestHandler = async () => { throw new BackendApiError("server", 500, "/api/patients"); };
  await assert.rejects(() => api.searchPatients("PAC"), (error) => error.status === 500);
});

await check("parser de asociación rechaza Study/Patient distintos", () => {
  assert.throws(
    () => api.parseStudyPatientAssignment(assignment({ patientId: "other" }), { caseId: "CASE-1", patientId: "patient-a" }),
    /no corresponde/,
  );
});

const associationFlow = load("src/features/worklist/patientStudyAssociation.ts", [
  "associatePatientAfterAnalysis",
], {
  BackendApiError,
  associateStudyPatient: async () => assignment(),
});

await check("flow de asociación envía expected null e INITIAL_ASSIGNMENT", async () => {
  let received;
  const result = await associationFlow.associatePatientAfterAnalysis("CASE-1", "patient-a", async (caseId, payload) => {
    received = { caseId, payload };
    return assignment();
  });
  assert.equal(result.status, "associated");
  assert.deepEqual(JSON.parse(JSON.stringify(received)), {
    caseId: "CASE-1",
    payload: { patientId: "patient-a", expectedPatientId: null, reason: "INITIAL_ASSIGNMENT" },
  });
});

await check("respuesta idempotente changed false cuenta como success", async () => {
  const result = await associationFlow.associatePatientAfterAnalysis(
    "CASE-1",
    "patient-a",
    async () => assignment({ changed: false }),
  );
  assert.equal(result.status, "associated");
  assert.equal(result.response.changed, false);
});

await check("409 de asociación exige revisión manual", async () => {
  const result = await associationFlow.associatePatientAfterAnalysis("CASE-1", "patient-a", async () => {
    throw new BackendApiError("conflict", 409, "/api/studies/CASE-1/patient");
  });
  assert.equal(result.status, "conflict");
  assert.match(result.message, /otro paciente/);
});

await check("500 de asociación produce éxito parcial, no fallo de análisis", async () => {
  const result = await associationFlow.associatePatientAfterAnalysis("CASE-1", "patient-a", async () => {
    throw new BackendApiError("server", 500, "/api/studies/CASE-1/patient");
  });
  assert.equal(result.status, "error");
  assert.match(result.message, /Análisis completado/);
});

await check("network error de asociación produce estado reintentable", async () => {
  const result = await associationFlow.associatePatientAfterAnalysis("CASE-1", "patient-a", async () => {
    throw new TypeError("network");
  });
  assert.equal(result.status, "error");
});

await check("retry invoca únicamente PUT de asociación con mismo Patient", async () => {
  const received = [];
  const associate = async (caseId, payload) => {
    received.push({ caseId, payload });
    if (received.length === 1) throw new BackendApiError("server", 500, "path");
    return assignment();
  };
  const first = await associationFlow.associatePatientAfterAnalysis("CASE-1", "patient-a", associate);
  const retry = await associationFlow.associatePatientAfterAnalysis("CASE-1", "patient-a", associate);
  assert.equal(first.status, "error");
  assert.equal(retry.status, "associated");
  assert.equal(received.length, 2);
  assert.ok(received.every((call) => call.payload.patientId === "patient-a"));
});

const selector = readFileSync("src/features/worklist/PatientSelector.tsx", "utf8");
const drawer = readFileSync("src/features/worklist/NewAnalysisDrawer.tsx", "utf8");
const associationSource = readFileSync("src/features/worklist/patientStudyAssociation.ts", "utf8");
const patientApiSource = readFileSync("src/patientApi.ts", "utf8");

await check("selector ofrece Paciente existente", () => assert.match(selector, /Paciente existente/));
await check("selector ofrece Nuevo paciente", () => assert.match(selector, /Nuevo paciente/));
await check("búsqueda usa debounce de 300ms", () => assert.match(selector, /setTimeout\(\(\) =>[\s\S]*?, 300\)/));
await check("búsqueda muestra loading", () => assert.match(selector, /Buscando pacientes…/));
await check("búsqueda muestra empty", () => assert.match(selector, /No se encontraron pacientes/));
await check("búsqueda muestra error próximo al control", () => assert.match(selector, /No se pudieron buscar pacientes/));
await check("resultados se presentan como lista accesible", () => assert.match(selector, /aria-label="Resultados de pacientes"/));
await check("selección es explícita mediante button", () => assert.match(selector, /<button disabled=\{disabled\} onClick=\{\(\) => onSelected\(patient\)\}/));
await check("no auto-selecciona el primer resultado", () => assert.doesNotMatch(selector, /onSelected\([^)]*results\[0\]/));
await check("selección puede cambiarse", () => assert.match(selector, />\s*Cambiar\s*</));
await check("nuevo Patient valida referencia vacía", () => assert.match(selector, /Ingresá una referencia de paciente/));
await check("nuevo Patient usa createPatient con referencia trim", () => assert.match(selector, /createPatient\(\{ patientReference: newReference\.trim\(\) \}\)/));
await check("duplicado 409 tiene copy útil", () => assert.match(selector, /Ya existe un paciente con esa referencia/));
await check("Patient recién creado queda seleccionado", () => assert.match(selector, /const patient = await createPatient[\s\S]*onSelected\(patient\)/));
await check("cancelar no intenta DELETE ni rollback", () => {
  assert.doesNotMatch(`${selector}\n${patientApiSource}`, /method:\s*"DELETE"|deletePatient|rollbackPatient/);
});
await check("nuevo análisis exige Patient antes de run", () => assert.match(drawer, /if \(!selectedPatient\)[\s\S]*antes de iniciar el análisis/));
await check("Patient vive en estado del drawer durante preparación y análisis", () => {
  assert.match(drawer, /useState<PatientSummary \| null>/);
  assert.doesNotMatch(drawer, /localStorage|sessionStorage/);
});
await check("asociación ocurre después de corrida y extensiones persistidas", () => {
  const runIndex = drawer.indexOf("await runProductExtensions(context)");
  const associationIndex = drawer.indexOf("await attemptPatientAssociation(context, selectedPatient.id)");
  assert.ok(runIndex > 0 && associationIndex > runIndex);
});
await check("fallo previo a persistedRun no dispara asociación", () => {
  const readinessBlock = drawer.slice(drawer.indexOf("if (readiness.ready)"), drawer.indexOf("// La corrida existe"));
  assert.match(readinessBlock, /attemptPatientAssociation/);
  assert.doesNotMatch(drawer.slice(drawer.indexOf("catch (error)"), drawer.indexOf("finally", drawer.indexOf("catch (error)"))), /attemptPatientAssociation/);
});
await check("retry de análisis conserva patientId y no recrea Patient", () => {
  assert.doesNotMatch(drawer, /createPatient/);
  assert.doesNotMatch(drawer, /setSelectedPatient\(null\)/);
});
await check("retry de asociación llama sólo attemptPatientAssociation", () => {
  const retryBody = drawer.slice(drawer.indexOf("async function retryPatientAssociation"), drawer.indexOf("async function run()"));
  assert.match(retryBody, /attemptPatientAssociation\(persistedRun, selectedPatient\.id\)/);
  assert.doesNotMatch(retryBody, /runMultiplanarAnalysis|runProductExtensions|createPatient/);
});
await check("409 nunca usa CORRECTION ni auto-reassign", () => {
  assert.doesNotMatch(associationSource, /CORRECTION/);
  assert.match(drawer, /Requiere revisión manual; no se reasignó automáticamente/);
});
await check("subjectRef conserva contrato con copy operativo separado", () => {
  assert.match(drawer, /Referencia interna del estudio \(opcional\)/);
  assert.match(drawer, /referencia breve para reconocer este estudio/);
  assert.doesNotMatch(drawer, /Referencia técnica legacy del estudio|SPIDER-101/);
});
await check("caseId sigue independiente de Patient", () => {
  assert.match(drawer, /caseId: normalizedCaseId/);
  assert.doesNotMatch(drawer, /caseId:\s*selectedPatient|patientReference.*caseId/);
});
await check("sala de lectura sólo se habilita con asociación confirmada", () => {
  assert.match(drawer, /associationState\.status === "associated"[\s\S]*Abrir sala de lectura/);
});
await check("cerrar y abrir crea estado Patient nuevo sin persistencia browser", () => {
  assert.match(drawer, /const \[selectedPatient, setSelectedPatient\] = useState<PatientSummary \| null>\(null\)/);
  assert.doesNotMatch(`${drawer}\n${selector}`, /localStorage|sessionStorage|indexedDB/);
});
await check("resultados soportan teclado mediante controles button nativos", () => {
  assert.match(selector, /wl-patient-results[\s\S]*<button/);
  assert.match(selector, /role="radiogroup"/);
});

requestHandler = async (path, init) => {
  calls.push({ path, init });
  if (path === "/api/patients" && init?.method === "POST") return patient("patient-created", "PAC-001");
  if (path.startsWith("/api/patients?")) return [patient("patient-a", "PAC-001")];
  if (path === "/api/patients/patient-a") return patient("patient-a", "PAC-001");
  if (path === "/api/studies/CASE-1/patient") return assignment();
  throw new Error(`Unexpected request ${path}`);
};

console.log(`patient-pr3: ${passed} passed`);
