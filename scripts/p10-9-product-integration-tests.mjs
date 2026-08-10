import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(path, exportNames, injected = {}) {
  const source = readFileSync(path, "utf8")
    .replace(/import\s+(?:type\s+)?[\s\S]*?\s+from\s+"[^"]+";\s*/g, "")
    .replace(/export /g, "");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const sandbox = { exports: {}, console, ...injected };
  vm.runInNewContext(`${js}\n${exportNames.map((name) => `exports.${name} = ${name};`).join("\n")}`, sandbox);
  return sandbox.exports;
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

const requests = [];
const api = load("src/productAnalysisApi.ts", [
  "ProductAnalysisContractError",
  "parseSeriesSegmentationResponse",
  "runProductSeriesSegmentation",
  "runProductDiscDegenerativeFindings",
], {
  parseDiscDegenerativeFindingsResponse: (value, runId) => {
    assert.equal(value.multiplanarRunId, runId);
    return [{ findingId: "finding-1" }];
  },
  multiplanarRequest: async (path, init) => {
    requests.push({ path, init });
    const body = JSON.parse(init.body);
    if (path.endsWith("series-segmentation")) return seriesResponse(body);
    return { multiplanarRunId: body.multiplanarRunId };
  },
});

function seriesResponse(request, overrides = {}) {
  return {
    schemaVersion: "pfi.full-series-segmentation.v1",
    status: "completed",
    runId: `seg-${request.inputId}`,
    caseId: request.caseId,
    inputId: request.inputId,
    plane: request.plane,
    modelKey: request.modelKey,
    sliceCount: 2,
    segmentedSliceCount: 2,
    coverageComplete: true,
    discLocalizations: [{ level: "L4-L5", positions: [7, 8, 9] }],
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
    slices: [{ sliceIndex: 0 }, { sliceIndex: 1 }],
    ...overrides,
  };
}

const t1Request = { caseId: "CASE-1", inputId: "input-t1", plane: "sagittal", modelKey: "sagittal_spider" };

await check("parsea full-series completo y conserva solo ids/localizaciones", () => {
  const parsed = api.parseSeriesSegmentationResponse(seriesResponse(t1Request), t1Request);
  assert.equal(parsed.runId, "seg-input-t1");
  assert.equal(parsed.discLocalizations.length, 1);
  assert.equal(Object.hasOwn(parsed, "slices"), false);
  assert.equal(Object.hasOwn(parsed, "assets"), false);
});

await check("full-series rechaza cobertura o flags inseguros", () => {
  assert.throws(() => api.parseSeriesSegmentationResponse(seriesResponse(t1Request, { coverageComplete: false }), t1Request), /cobertura/);
  assert.throws(() => api.parseSeriesSegmentationResponse(seriesResponse(t1Request, { humanReviewRequired: false }), t1Request), /flags/);
});

await check("full-series no permite sustituir el input solicitado", () => {
  assert.throws(() => api.parseSeriesSegmentationResponse(seriesResponse(t1Request, { inputId: "other" }), t1Request), /fuente solicitada/);
});

await check("cliente llama exclusivamente al endpoint Backend full-series", async () => {
  requests.length = 0;
  await api.runProductSeriesSegmentation(t1Request);
  assert.equal(requests[0].path, "/api/ai/v2/product/series-segmentation");
  assert.deepEqual(JSON.parse(requests[0].init.body), t1Request);
});

await check("request P10.7 usa multiplanarRunId, caseId y sources exactos", async () => {
  requests.length = 0;
  const payload = {
    multiplanarRunId: "multi-1",
    caseId: "CASE-1",
    sources: [
      { role: "sagittal_t1", inputId: "input-t1", segmentationRunId: "seg-t1" },
      { role: "sagittal_t2", inputId: "input-t2", segmentationRunId: "seg-t2" },
    ],
  };
  const result = await api.runProductDiscDegenerativeFindings(payload);
  assert.equal(requests[0].path, "/api/ai/v2/product/disc-degenerative-findings");
  assert.deepEqual(JSON.parse(requests[0].init.body), payload);
  assert.equal(result.humanReviewRequired, true);
  assert.equal(result.notClinicalDiagnosis, true);
  assert.equal(result.autonomousDiagnosis, false);
});

class BackendApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const flow = load("src/features/worklist/productAnalysisFlow.ts", [
  "initialProductAnalysisState",
  "runP109ProductFlow",
], {
  BackendApiError,
  runProductSeriesSegmentation: async () => { throw new Error("not injected"); },
  runProductDiscDegenerativeFindings: async () => { throw new Error("not injected"); },
});

function planeInput(inputId, weighting) {
  return {
    inputId,
    caseId: "CASE-1",
    plane: "sagittal",
    format: "dicom_series",
    size: 100,
    description: weighting.toUpperCase(),
    weighting,
    sliceCount: 17,
    multiplanar: false,
    derived: false,
    analyzable: true,
  };
}

function successfulSegmentation(payload) {
  return Promise.resolve({
    runId: `seg-${payload.inputId}`,
    caseId: payload.caseId,
    inputId: payload.inputId,
    plane: "sagittal",
    modelKey: "sagittal_spider",
    status: "completed",
    coverageComplete: true,
    sliceCount: 17,
    segmentedSliceCount: 17,
    discLocalizations: [{ level: "L4-L5" }],
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
  });
}

await check("orquesta T1 y T2 como fuentes independientes", async () => {
  const segmentationCalls = [];
  let discPayload;
  const result = await flow.runP109ProductFlow({
    caseId: "CASE-1",
    multiplanarRunId: "multi-1",
    study: { sagittalT1: planeInput("input-t1", "t1"), sagittalT2: planeInput("input-t2", "t2") },
  }, {
    runSeriesSegmentation: async (payload) => { segmentationCalls.push(payload); return successfulSegmentation(payload); },
    runDiscFindings: async (payload) => { discPayload = payload; return { findings: Array(40).fill({}), humanReviewRequired: true, notClinicalDiagnosis: true, autonomousDiagnosis: false }; },
  });
  assert.equal(result.phase, "completed");
  assert.deepEqual(segmentationCalls.map((call) => call.inputId), ["input-t1", "input-t2"]);
  assert.deepEqual(JSON.parse(JSON.stringify(discPayload.sources)), [
    { role: "sagittal_t1", inputId: "input-t1", segmentationRunId: "seg-input-t1" },
    { role: "sagittal_t2", inputId: "input-t2", segmentationRunId: "seg-input-t2" },
  ]);
  assert.equal(result.series.sagittal_t1.discLocalizations.length, 1);
  assert.equal(Object.hasOwn(result.series.sagittal_t1, "assets"), false);
});

await check("con una sola modalidad ejecuta P10.7 degradado sin inventar la otra", async () => {
  let sources;
  const result = await flow.runP109ProductFlow({
    caseId: "CASE-1",
    multiplanarRunId: "multi-1",
    study: { sagittalT2: planeInput("input-t2", "t2") },
  }, {
    runSeriesSegmentation: successfulSegmentation,
    runDiscFindings: async (payload) => { sources = payload.sources; return { findings: [{}], humanReviewRequired: true, notClinicalDiagnosis: true, autonomousDiagnosis: false }; },
  });
  assert.equal(result.phase, "degraded");
  assert.equal(result.series.sagittal_t1.status, "unavailable");
  assert.deepEqual([...sources].map((source) => source.role), ["sagittal_t2"]);
});

await check("sin T1/T2 explícitos degrada sin reutilizar sagittal", async () => {
  let called = false;
  const result = await flow.runP109ProductFlow({ caseId: "CASE-1", multiplanarRunId: "multi-1", study: {} }, {
    runSeriesSegmentation: async () => { called = true; return successfulSegmentation(t1Request); },
    runDiscFindings: async () => { called = true; return { findings: [], humanReviewRequired: true, notClinicalDiagnosis: true, autonomousDiagnosis: false }; },
  });
  assert.equal(result.phase, "degraded");
  assert.equal(called, false);
});

await check("502 de segmentación queda como error técnico recuperable", async () => {
  const result = await flow.runP109ProductFlow({
    caseId: "CASE-1",
    multiplanarRunId: "multi-1",
    study: { sagittalT1: planeInput("input-t1", "t1") },
  }, {
    runSeriesSegmentation: async () => { throw new BackendApiError("upstream", 502); },
    runDiscFindings: async () => { throw new Error("no debe ejecutarse"); },
  });
  assert.equal(result.phase, "error");
  assert.equal(result.retryable, true);
  assert.match(result.series.sagittal_t1.error, /servicio de IA/);
});

await check("504 de P10.7 permite reintento sin perder la corrida multiplanar", async () => {
  const result = await flow.runP109ProductFlow({
    caseId: "CASE-1",
    multiplanarRunId: "multi-1",
    study: { sagittalT2: planeInput("input-t2", "t2") },
  }, {
    runSeriesSegmentation: successfulSegmentation,
    runDiscFindings: async () => { throw new BackendApiError("timeout", 504); },
  });
  assert.equal(result.phase, "error");
  assert.equal(result.retryable, true);
  assert.match(result.message, /corrida principal quedó guardada/);
  assert.equal(result.series.sagittal_t2.segmentationRunId, "seg-input-t2");
});

await check("la sala lee P10.7 desde metricsSnapshot y no desde estado React transitorio", () => {
  const source = readFileSync("src/components/StudyReviewView.tsx", "utf8");
  assert.match(source, /parsePersistedDiscDegenerativeFindings\(run\.metricsSnapshot\)/);
  assert.match(source, /DiscDegenerativeFindingsPanel/);
});

await check("el frontend nunca contiene una base URL del AI Module", () => {
  const apiSource = readFileSync("src/productAnalysisApi.ts", "utf8");
  assert.doesNotMatch(apiSource, /AI_MODULE|localhost:8000|\/v2\/series-segmentation\/run/);
  assert.match(apiSource, /\/api\/ai\/v2\/product\/series-segmentation/);
});

console.log(`p10-9-product-integration: ${passed} passed`);
