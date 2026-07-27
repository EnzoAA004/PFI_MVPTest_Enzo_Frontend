import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();

function normalizeAiAssetUrl(value, apiBaseUrl = "") {
  const rawUrl = typeof value === "string" ? value : value?.url ?? value?.proxyUrl;
  if (typeof rawUrl !== "string") return undefined;
  const url = rawUrl.trim();
  if (!url || url.includes("mask.npy") || url.includes("confidence.npy")) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/api/")) return `${apiBaseUrl}${url}`;
  return undefined;
}

function loadGuards() {
  const source = readFileSync(join(root, "src/appDataGuards.ts"), "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/export /g, "");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = { exports: {}, console, API_BASE_URL: "https://backend.example", normalizeAiAssetUrl };
  vm.runInNewContext(`${js}
exports.resolvePersistedPlaneWorkspace = resolvePersistedPlaneWorkspace;
exports.selectReviewableRunFromDetail = selectReviewableRunFromDetail;`, sandbox);
  return sandbox.exports;
}

const guards = loadGuards();

let count = 0;
function test(name, fn) {
  fn();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

const realRun = {
  runId: "multi-real-1",
  caseId: "case101",
  requestedInferenceMode: "real_baseline",
  effectiveInferenceMode: "real_baseline",
  sagittalRunId: "sag-plane-1",
  axialRunId: null,
  sagittalModelKey: "sagittal_spider",
  sagittalArtifactHash: "hash-real",
  planes: {
    sagittal: {
      runId: "sag-plane-1",
      plane: "sagittal",
      modelKey: "sagittal_spider",
      artifactHash: "hash-real",
      effectiveInferenceMode: "real_baseline",
      metadata: { sliceCount: 17, selectedSlice: 7 },
      measurements: { values: Array.from({ length: 9 }, (_, index) => ({ id: `m${index}`, label: `M${index}`, value: index + 1, unit: "mm", source: "AI", status: "pendiente" })) },
      assets: {
        "input.png": "/api/ai/assets/sag-plane-1/sagittal/input.png",
        "overlay.png": "/api/ai/assets/sag-plane-1/sagittal/overlay.png",
      },
    },
    axial: null,
  },
  artifactsByPlane: {
    sagittal: [
      { plane: "sagittal", runId: "sag-plane-1", assetName: "input.png", proxyUrl: "/api/ai/assets/sag-plane-1/sagittal/input.png", storageStatus: "stored", available: true },
      { plane: "sagittal", runId: "sag-plane-1", assetName: "overlay.png", proxyUrl: "/api/ai/assets/sag-plane-1/sagittal/overlay.png", storageStatus: "stored", available: true },
    ],
  },
  measurementsByPlane: {
    sagittal: Array.from({ length: 9 }, (_, index) => ({ id: `pm${index}`, label: `PM${index}`, value: index + 1, unit: "mm", source: "AI", status: "pendiente" })),
  },
};

test("A separa multiplanarRunId de planeRunId para assets", () => {
  const workspace = guards.resolvePersistedPlaneWorkspace(realRun, "sagittal");
  assert.equal(realRun.runId, "multi-real-1");
  assert.equal(workspace.planeRunId, "sag-plane-1");
  assert.ok(!workspace.inputUrl.includes("multi-real-1"));
});

test("B usa proxyUrl exacto normalizado con API_BASE_URL", () => {
  const workspace = guards.resolvePersistedPlaneWorkspace(realRun, "sagittal");
  assert.equal(workspace.inputUrl, "https://backend.example/api/ai/assets/sag-plane-1/sagittal/input.png");
  assert.equal(workspace.overlayUrl, "https://backend.example/api/ai/assets/sag-plane-1/sagittal/overlay.png");
});

test("C no sintetiza mask-preview.png si no fue declarado", () => {
  assert.equal(guards.resolvePersistedPlaneWorkspace(realRun, "sagittal").maskPreviewUrl, undefined);
});

test("D axial null queda opcional y no disponible", () => {
  const workspace = guards.resolvePersistedPlaneWorkspace(realRun, "axial");
  assert.equal(workspace.planeRunId, null);
  assert.equal(workspace.available, false);
});

test("E 9 mediciones persistidas quedan en workspace sagital", () => {
  assert.equal(guards.resolvePersistedPlaneWorkspace(realRun, "sagittal").measurements.length, 9);
});

test("F asset missing no devuelve URL renderizable", () => {
  const run = { ...realRun, planes: { sagittal: { ...realRun.planes.sagittal, assets: {} } }, artifactsByPlane: { sagittal: [{ plane: "sagittal", runId: "sag-plane-1", assetName: "input.png", proxyUrl: "/api/ai/assets/sag-plane-1/sagittal/input.png", storageStatus: "missing", available: false }] } };
  const workspace = guards.resolvePersistedPlaneWorkspace(run, "sagittal");
  assert.equal(workspace.inputUrl, undefined);
  assert.equal(workspace.available, false);
});

test("G asset upstream_only conserva estado pero no inventa mask-preview", () => {
  const run = { ...realRun, artifactsByPlane: { sagittal: [{ plane: "sagittal", runId: "sag-plane-1", assetName: "input.png", proxyUrl: "/api/ai/assets/sag-plane-1/sagittal/input.png", storageStatus: "upstream_only", available: true }] } };
  const workspace = guards.resolvePersistedPlaneWorkspace(run, "sagittal");
  assert.equal(workspace.storageStatus, "stored");
  assert.equal(workspace.maskPreviewUrl, undefined);
});

test("H StudyReviewView no selecciona selectedDetail.runs[0]", () => {
  assert.equal(readFileSync(join(root, "src/components/StudyReviewView.tsx"), "utf8").includes("selectedDetail?.runs?.[0]"), false);
});

test("I StudyReviewView pasa planeRunId al visor", () => {
  const source = readFileSync(join(root, "src/components/StudyReviewView.tsx"), "utf8");
  // P9-C.4: planeRunId ya no se pasa como prop JSX directa a MriSliceViewer;
  // fluye a traves de studyRunToMriViewerModel({ planeRunId, ... }) hacia
  // MriViewerModel.planeRunId.
  assert.match(source, /planeRunId:\s*activeWorkspace\.planeRunId/);
});

test("J MriSliceViewer no expone prop runId para assets", () => {
  // P9-C.4: MriSliceViewer es un componente de presentacion puro; ya no
  // recibe planeRunId como prop propia (llega dentro de model: MriViewerModel).
  const viewerSource = readFileSync(join(root, "src/components/MriSliceViewer.tsx"), "utf8");
  assert.equal(/runId\?: string/.test(viewerSource), false);
  assert.equal(/planeRunId\?: string/.test(viewerSource), false);
  const modelSource = readFileSync(join(root, "src/viewModels/mriViewerViewModel.ts"), "utf8");
  assert.match(modelSource, /planeRunId\?: string/);
});

test("K el adapter del visor construye fallback solo con planeRunId", () => {
  // P9-C.4: la resolucion de URLs de assets (incluido el fallback via
  // aiAssetUrl) se concentra en src/viewModels/mriViewerViewModel.ts, no en
  // el componente de presentacion.
  const source = readFileSync(join(root, "src/viewModels/mriViewerViewModel.ts"), "utf8");
  assert.match(source, /aiAssetUrl\(planeRunId, plane, assetName\)/);
  assert.doesNotMatch(source, /aiAssetUrl\(runId/);
});

test("L StudyReviewView no usa L4-L5 como default de nivel", () => {
  assert.doesNotMatch(readFileSync(join(root, "src/components/StudyReviewView.tsx"), "utf8"), /item\.level \?\?.*L4-L5/);
});

test("M no quedan series axiales falsas en modo real", () => {
  const source = readFileSync(join(root, "src/components/StudyReviewView.tsx"), "utf8");
  assert.match(source, /demoMode \?/);
  assert.match(source, /persistedSeries\.length/);
});

test("N selected latest run preserva artifacts persistidos del segundo run", () => {
  const detail = {
    study: { caseId: "case101", latestRunId: "multi-real-1", subjectRef: null, studyDate: null, status: "created", planes: ["sagittal"], primaryPlane: "sagittal", modelKey: "sagittal_spider", modelStatus: "completed", reviewStatus: "pendiente", priority: "media", dataOrigin: "database" },
    runs: [{ runId: "multi-old", caseId: "case101", planes: ["sagittal"], primaryPlane: "sagittal", status: "completed", reviewStatus: "pendiente", modelStatus: "completed" }, realRun],
    dataOrigin: "database",
  };
  const reviewable = guards.selectReviewableRunFromDetail(detail);
  assert.equal(reviewable.runId, "multi-real-1");
  assert.equal(guards.resolvePersistedPlaneWorkspace(reviewable, "sagittal").planeRunId, "sag-plane-1");
});

console.log(`P8-C2 plane asset tests passed: ${count}`);
