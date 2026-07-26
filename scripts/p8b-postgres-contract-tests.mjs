import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();

function loadApiNormalizers() {
  const source = readFileSync(join(root, "src/api.ts"), "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/import\.meta\.env/g, "({})")
    .replace(/export /g, "");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = {
    exports: {},
    window: undefined,
    console,
    markDataOrigin: (value, dataOrigin) => ({ ...value, dataOrigin }),
    isDemoDataMode: false,
    isRealDataMode: true,
    appDataMode: "real",
  };
  vm.runInNewContext(`${js}\nexports.normalizeStudiesResponse = normalizeStudiesResponse;`, sandbox);
  return sandbox.exports;
}

function loadGuards() {
  const source = readFileSync(join(root, "src/appDataGuards.ts"), "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/export /g, "");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = {
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
  vm.runInNewContext(`${js}\nexports.selectReviewableRunFromDetail = selectReviewableRunFromDetail;\nexports.shouldFetchSubjectHistory = shouldFetchSubjectHistory;\nexports.deriveSummary = deriveSummary;`, sandbox);
  return sandbox.exports;
}

const { normalizeStudiesResponse } = loadApiNormalizers();
const guards = loadGuards();

const postgresResponse = {
  status: "ok",
  source: "postgres-domain",
  dataOrigin: "database",
  items: [
    {
      caseId: "case101",
      subjectRef: null,
      studyDate: null,
      status: "created",
      planes: ["sagittal"],
      primaryPlane: "sagittal",
      latestRunId: "multi-89ec8f030fd855ff",
      modelKey: "sagittal_spider",
      modelStatus: "completed",
      reviewStatus: "pendiente",
      priority: "media",
      createdAt: "2026-07-26T01:48:28.971721Z",
      updatedAt: "2026-07-26T01:48:28.971721Z",
      dataOrigin: "database",
      runId: "multi-89ec8f030fd855ff",
      plane: "sagittal",
    },
    {
      caseId: "case-no-run",
      subjectRef: null,
      studyDate: null,
      status: "created",
      planes: [],
      primaryPlane: null,
      latestRunId: null,
      modelKey: null,
      modelStatus: "created",
      reviewStatus: "pendiente",
      priority: "media",
      dataOrigin: "database",
    },
  ],
  summary: { total: 2, pending: 2, completed: 0, flagged: 0 },
  humanReviewRequired: true,
  notClinicalDiagnosis: true,
};

const studies = normalizeStudiesResponse(postgresResponse);
assert.equal(studies.dataOrigin, "database", "F dataOrigin=database se conserva");
assert.equal(studies.items.length, 2, "G dos estudios reales aparecen");
assert.equal(studies.summary.total, 2, "G summary total es 2");
assert.equal(studies.items[0].subjectRef, null, "A subjectRef=null es valido");
assert.equal(studies.items[0].patientId, null, "A patientId alias temporal no se inventa");
assert.equal(studies.items[0].studyDate, null, "B studyDate=null se conserva");
assert.equal(studies.items[1].modelKey, null, "C modelKey=null se conserva");
assert.equal(studies.items[1].latestRunId, null, "D latestRunId=null se conserva");
assert.deepEqual(studies.items[1].planes, [], "E planes=[] no fabrica sagittal");
assert.equal(studies.items[1].primaryPlane, null, "E primaryPlane=null visible");
assert.equal(guards.shouldFetchSubjectHistory(studies.items[0].subjectRef), false, "H subjectRef=null no fetch history");
assert.equal(guards.shouldFetchSubjectHistory("PAT-123"), true, "I subjectRef existente habilita history");

const detail = {
  status: "ok",
  study: studies.items[0],
  runs: [
    {
      runId: "multi-old",
      caseId: "case101",
      planes: ["sagittal"],
      primaryPlane: "sagittal",
      status: "completed",
      reviewStatus: "observado",
      sagittalRunId: "run-sag-old",
      sagittalModelKey: "sagittal_spider",
      measurementsByPlane: { sagittal: [] },
      artifactsByPlane: { sagittal: [] },
      dataOrigin: "database",
    },
    {
      runId: "multi-89ec8f030fd855ff",
      caseId: "case101",
      planes: ["sagittal"],
      primaryPlane: "sagittal",
      requestedInferenceMode: "real_baseline",
      effectiveInferenceMode: "real_baseline",
      status: "completed",
      reviewStatus: "pendiente",
      sagittalRunId: "run-sag-real",
      axialRunId: null,
      sagittalModelKey: "sagittal_spider",
      sagittalArtifactHash: "sha256:sag",
      measurementsByPlane: {
        sagittal: [{ id: "disc-height-l45", label: "Disc Height", value: 13.8, aiValue: 13.8, reviewerValue: 14.1, unit: "mm", confidence: 0.82, plane: "sagittal", source: "AI", status: "pendiente", linkedLandmarks: ["lm-l4", "lm-l5"] }],
        axial: [],
      },
      artifactsByPlane: {
        sagittal: [{ plane: "sagittal", runId: "run-sag-real", assetName: "overlay.png", contentType: "image/png", proxyUrl: "/api/ai/assets/run-sag-real/sagittal/overlay.png" }],
        axial: [],
      },
      dataOrigin: "database",
    },
  ],
  humanReviewRequired: true,
  notClinicalDiagnosis: true,
  dataOrigin: "database",
};

const reviewable = guards.selectReviewableRunFromDetail(detail);
assert.equal(reviewable.runId, "multi-89ec8f030fd855ff", "J selecciona run que coincide con latestRunId");
assert.equal(reviewable.measurementValues[0].aiValue, 13.8, "K conserva aiValue persistido");
assert.equal(reviewable.measurementValues[0].reviewerValue, 14.1, "K conserva reviewerValue separado");
assert.equal(reviewable.planes.sagittal.assets["overlay.png"], "/api/ai/assets/run-sag-real/sagittal/overlay.png", "L usa proxyUrl persistido");
assert.equal(reviewable.planes.axial, null, "M axial null no bloquea sagital");
assert.equal(JSON.stringify(studies).includes("PAT-0087"), false, "N no inventa PAT-0087");
assert.equal(JSON.stringify(studies).includes("sagittal_spider"), true, "N conserva modelKey real cuando vino del backend");
assert.doesNotThrow(() => normalizeStudiesResponse(postgresResponse), "O backend 200 valido no lanza ContractError");

console.log("p8b postgres contract tests: ok");
