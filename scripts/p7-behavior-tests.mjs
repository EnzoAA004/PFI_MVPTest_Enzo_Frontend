import assert from "node:assert/strict";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const root = process.cwd();

function loadGuards() {
  const source = readFileSync(join(root, "src/appDataGuards.ts"), "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/export /g, "");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = {
  // api.ts espera la hidratacion de la sesion (IndexedDB) antes de cada request
  // autenticado; el harness borra los imports, asi que se stubea aqui.
  ensureAuthSession: async () => null,
    exports: {},
    console,
    API_BASE_URL: "https://backend.example",
    normalizeAiAssetUrl: (value, apiBaseUrl = "") => {
      const rawUrl = typeof value === "string" ? value : value?.url ?? value?.proxyUrl;
      if (typeof rawUrl !== "string") return undefined;
      if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
      if (rawUrl.startsWith("/api/")) return `${apiBaseUrl}${rawUrl}`;
      return undefined;
    },
  };
  vm.runInNewContext(`${js}\nexports.normalizeSelectedRunForReview = normalizeSelectedRunForReview;\nexports.mergeStudyRowsWithSelectedRun = mergeStudyRowsWithSelectedRun;\nexports.selectReviewableRunFromDetail = selectReviewableRunFromDetail;\nexports.shouldFetchSubjectHistory = shouldFetchSubjectHistory;\nexports.deriveSummary = deriveSummary;`, sandbox);
  return sandbox.exports;
}

class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.path = options.path;
    this.traceId = options.traceId;
  }
}

class ContractError extends Error {
  constructor(message, path) {
    super(message);
    this.name = "ContractError";
    this.path = path;
  }
}

async function requestReal(fetchImpl, path, fallback) {
  const response = await fetchImpl(path);
  if (!response.ok) throw new ApiError(`Backend respondio ${response.status}`, { status: response.status, path, traceId: "test-trace" });
  return response.json();
}

function normalizeRealRunLike(run) {
  if (!run?.runId) throw new ContractError("Contrato de corrida invalido: falta runId.", "/api/ai/pipeline/run");
  if (!run?.caseId) throw new ContractError("Contrato de corrida invalido: falta caseId.", "/api/ai/pipeline/run");
  if (run.plane !== "sagittal" && run.plane !== "axial") throw new ContractError("Contrato de corrida invalido: plano.", "/api/ai/pipeline/run");
  if (!run?.modelKey) throw new ContractError("Contrato de corrida invalido: falta modelKey.", "/api/ai/pipeline/run");
  return run;
}

const guards = loadGuards();

let fixtureCalled = false;
await assert.rejects(() => requestReal(async () => ({ ok: false, status: 500, json: async () => ({}) }), "/api/studies", () => { fixtureCalled = true; }), ApiError);
assert.equal(fixtureCalled, false, "B request real no ejecuta fixture demo");

const emptyStudies = { status: "ok", items: [] };
assert.deepEqual(emptyStudies.items, [], "C getStudies con items=[] conserva lista vacia");

assert.throws(() => normalizeRealRunLike({ caseId: "CASE-1", plane: "sagittal", modelKey: "sagittal_spider" }), ContractError, "D runId faltante lanza ContractError");

const invalidState = guards.normalizeSelectedRunForReview({ caseId: "CASE-1", plane: "sagittal", modelKey: "sagittal_spider" }, false, normalizeRealRunLike);
assert.equal(invalidState.safeRun, null, "E App no debe renderizar corrida que fallo validacion");
assert.match(invalidState.contractIssue.message, /runId/, "E conserva error de contrato sanitizado");

const rows = [
  { caseId: "CASE-1", patientId: "PAT-1", plane: "sagittal", studyDate: "2026-01-01", modelKey: "m1", modelStatus: "ok", reviewStatus: "pendiente", priority: "media", runId: "run-1" },
  { caseId: "CASE-2", patientId: "PAT-2", plane: "sagittal", studyDate: "2026-01-02", modelKey: "m2", modelStatus: "ok", reviewStatus: "pendiente", priority: "media", runId: "run-2" },
];
const merged = guards.mergeStudyRowsWithSelectedRun(rows, { runId: "run-2", caseId: "CASE-2B", plane: "axial", modelKey: "m2b", review: { status: "aceptado" }, agentDecision: { priority: "alta" } });
assert.equal(merged[0].caseId, "CASE-1", "F seleccionar segundo estudio no modifica primera fila");
assert.equal(merged[1].caseId, "CASE-2B", "F solo modifica fila con runId coincidente");

const noRuns = guards.selectReviewableRunFromDetail({ status: "ok", study: rows[0], runs: [], measurements: [] });
assert.equal(noRuns, null, "G StudyRow sin corrida no se convierte en AiRunResponse");

assert.equal(guards.shouldFetchSubjectHistory(null), false, "H subjectRef=null no ejecuta fetchSubjectHistory");
assert.equal(guards.shouldFetchSubjectHistory(""), false, "H subjectRef vacio no ejecuta fetchSubjectHistory");

const studiesVisibleWhenAiFails = guards.mergeStudyRowsWithSelectedRun(rows, null);
assert.equal(studiesVisibleWhenAiFails.length, 2, "I AI Module caido no oculta estudios persistidos");

await assert.rejects(() => requestReal(async () => ({ ok: false, status: 503, json: async () => ({}) }), "/api/studies"), ApiError);
assert.equal(rows.some((row) => row.caseId.includes("DEMO")), false, "J worklist caida no inserta estudios demo");

const appSource = readFileSync(join(root, "src/App.tsx"), "utf8");
const apiSource = readFileSync(join(root, "src/api.ts"), "utf8");
assert.match(apiSource, /isDemoDataMode[\s\S]*await import\("\.\/mock\/sampleRun"\)/, "K modo demo carga fixtures por import dinamico");
assert.doesNotMatch(appSource, /sampleRun|worklistStudies|getDemoStudyReview/, "L bootstrap real no importa ni solicita fixtures demo");

console.log("p7 behavior tests: ok");
