import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();

function loadApi() {
  const source = readFileSync(join(root, "src/api.ts"), "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/import\.meta\.env/g, "({})")
    .replace(/export /g, "");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = {
    exports: {},
    window: undefined,
    console,
    fetch: async () => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({}) }),
    authHeaders: () => ({ Authorization: "Bearer test-token" }),
    refreshDoctorSession: async () => undefined,
    markDataOrigin: (value, dataOrigin) => ({ ...value, dataOrigin }),
    isDemoDataMode: false,
    isRealDataMode: true,
    appDataMode: "real",
  };
  vm.runInNewContext(`${js}\nexports.updateReview = updateReview;\nexports.buildReviewCorrections = buildReviewCorrections;\nexports.normalizeStudiesResponse = normalizeStudiesResponse;`, sandbox);
  return { api: sandbox.exports, sandbox };
}

function loadGuards() {
  const source = readFileSync(join(root, "src/appDataGuards.ts"), "utf8")
    .replace(/^import type .*$/gm, "")
    .replace(/export /g, "");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = { exports: {}, console };
  vm.runInNewContext(`${js}\nexports.isReviewQueueItem = isReviewQueueItem;`, sandbox);
  return sandbox.exports;
}

function successResponse(body) {
  return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => body };
}

function errorResponse(body, status = 500) {
  return { ok: false, status, headers: { get: () => "application/json" }, json: async () => body };
}

const changedMeasurement = {
  id: "disc-height-l45",
  label: "Altura discal L4-L5",
  value: 14.1,
  aiValue: 13.8,
  reviewerValue: 14.1,
  unit: "mm",
  confidence: 0.82,
  plane: "sagittal",
  source: "Reviewer",
  status: "editado",
};

const unchangedMeasurement = {
  id: "canal-width",
  label: "Canal",
  value: 10,
  aiValue: 10,
  reviewerValue: 10,
  unit: "mm",
  confidence: 0.75,
  plane: "sagittal",
  source: "AI",
  status: "pendiente",
};

{
  const { api, sandbox } = loadApi();
  let request;
  sandbox.fetch = async (url, init) => {
    request = { url, init, body: JSON.parse(init.body) };
    return successResponse({ reviewStatus: "accepted", reviewer: "Dra. QA", comments: "aprobado", reviewedAt: "2026-07-26T10:00:00Z", multiplanarRunId: "multi-1" });
  };
  const review = await api.updateReview("multi-1", { status: "aceptado", reviewer: "Dra. QA", notes: "aprobado", measurements: [changedMeasurement, unchangedMeasurement] });
  assert.match(request.url, /\/api\/ai\/runs\/multi-1\/review$/, "A aceptar llama PUT al endpoint canonico");
  assert.equal(request.init.method, "PUT", "A metodo canonico PUT");
  assert.equal(request.body.reviewStatus, "accepted", "A aceptado -> accepted");
  assert.equal(request.body.reviewer, "Dra. QA", "A reviewer requerido");
  assert.equal(request.body.corrections.length, 1, "A no envia mediciones sin cambios");
  assert.equal(review.status, "aceptado", "E respuesta accepted se muestra aceptado");
  assert.equal(review.runId, "multi-1", "E multiplanarRunId -> runId");
  assert.equal(review.notes, "aprobado", "E comments -> notes");
  assert.equal(review.reviewedAt, "2026-07-26T10:00:00Z", "E reviewedAt se conserva");
}

{
  const { api, sandbox } = loadApi();
  let body;
  sandbox.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return successResponse({ reviewStatus: "observed", reviewer: "Dra. QA", comments: "revisar altura" });
  };
  await api.updateReview("multi-2", { status: "observado", reviewer: "Dra. QA", notes: "revisar altura", measurements: [changedMeasurement] });
  assert.equal(body.reviewStatus, "observed", "B observar envia observed");
  assert.equal(body.comments, "revisar altura", "B observar envia comments");
}

{
  const { api, sandbox } = loadApi();
  let body;
  sandbox.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return successResponse({ reviewStatus: "rejected", reviewer: "Dra. QA", comments: "artefacto marcado" });
  };
  await api.updateReview("multi-3", { status: "descartado", reviewer: "Dra. QA", notes: "artefacto marcado", measurements: [changedMeasurement] });
  assert.equal(body.reviewStatus, "rejected", "C descartar envia rejected");
}

{
  const { api, sandbox } = loadApi();
  let body;
  sandbox.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return successResponse({ reviewStatus: "pending", reviewer: "Dra. QA", comments: "borrador" });
  };
  await api.updateReview("multi-4", { status: "pendiente", reviewer: "Dra. QA", notes: "borrador", measurements: [changedMeasurement] });
  assert.equal(body.reviewStatus, "pending", "D guardar borrador envia pending");
}

{
  const { api } = loadApi();
  const [correction] = api.buildReviewCorrections([changedMeasurement], "ajuste del revisor");
  assert.equal(correction.beforeValue.value, 13.8, "I reviewerValue no destruye aiValue");
  assert.equal(correction.afterValue.value, 14.1, "I reviewerValue viaja como afterValue");
  assert.equal(correction.beforeValue.confidence, 0.82, "I confidence IA queda solo en beforeValue");
}

{
  const guards = loadGuards();
  assert.equal(guards.isReviewQueueItem({ caseId: "CASE-A", reviewStatus: "aceptado" }), false, "F accepted desaparece de Cola despues del refetch");
  assert.equal(guards.isReviewQueueItem({ caseId: "CASE-O", reviewStatus: "observado" }), true, "G observed permanece en Cola");
}

{
  const { api, sandbox } = loadApi();
  const rows = [{ caseId: "CASE-ERR", reviewStatus: "pendiente" }];
  sandbox.fetch = async () => errorResponse({ code: "REVIEW_SAVE_FAILED", message: "fallo postgres", traceId: "trace-77" }, 500);
  await assert.rejects(() => api.updateReview("multi-error", { status: "aceptado", reviewer: "Dra. QA", notes: "aprobado", measurements: [changedMeasurement] }), /fallo postgres/);
  assert.equal(rows[0].reviewStatus, "pendiente", "H error backend no actualiza estado local");
}

{
  const { api } = loadApi();
  const studies = api.normalizeStudiesResponse({ status: "ok", items: [{ caseId: "CASE-PG", subjectRef: null, studyDate: null, status: "created", planes: ["sagittal"], primaryPlane: "sagittal", latestRunId: "multi-pg", modelKey: "sagittal_spider", modelStatus: "completed", reviewStatus: "accepted", priority: "media", dataOrigin: "database" }] });
  assert.equal(studies.items[0].reviewStatus, "aceptado", "J despues de recargar se conserva estado PostgreSQL");
}

console.log("p8d2 canonical review tests: ok");
