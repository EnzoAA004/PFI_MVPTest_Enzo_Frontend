import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const MULTIPLANAR_CONTRACT_V2 = "pfi.multiplanar-run.v2";

class ContractError extends Error {
  constructor(message, path, options) {
    super(message);
    this.name = "ContractError";
    this.path = path;
    this.code = options?.code;
    this.traceId = options?.traceId;
    this.body = options?.body;
  }
}

function readSource(path) {
  return readFileSync(join(root, path), "utf8");
}

function transpile(relativePath) {
  const source = readSource(relativePath)
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/export (default )?/g, "");
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}

function loadComponentModule(path) {
  const compiled = ts.transpileModule(readSource(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  const context = {
    exports,
    console,
    require: (id) => {
      if (id === "react") return { useEffect: () => undefined, useMemo: (fn) => fn(), useRef: () => ({ current: null }), useState: (initial) => [initial, () => undefined] };
      if (id === "react/jsx-runtime") return { jsx: () => ({}), jsxs: () => ({}), Fragment: "Fragment" };
      return {};
    },
  };
  vm.runInNewContext(compiled, context, { filename: path });
  return exports;
}

function loadAdapter() {
  const js = transpile("src/adapters/multiplanarRunAdapter.ts");
  const sandbox = { exports: {}, console, ContractError, MULTIPLANAR_CONTRACT_V2 };
  vm.runInNewContext(`${js}
exports.parseMultiplanarRunResponse = parseMultiplanarRunResponse;`, sandbox);
  return sandbox.exports;
}

function loadFixtures() {
  const js = transpile("src/fixtures/multiplanarRunFixtures.ts");
  const sandbox = { exports: {}, console };
  vm.runInNewContext(`${js}
exports.rawMultiplanarRunV2PublicPresenterFixture = rawMultiplanarRunV2PublicPresenterFixture;
exports.rawMultiplanarRunV1Fixture = rawMultiplanarRunV1Fixture;`, sandbox);
  return sandbox.exports;
}

function loadMriViewerViewModel() {
  const js = transpile("src/viewModels/mriViewerViewModel.ts");
  const sandbox = {
    exports: {},
    console,
    API_BASE_URL: "https://backend.example",
    normalizeAiAssetUrl: (value, apiBaseUrl = "") => {
      const url = typeof value === "string" ? value.trim() : undefined;
      if (!url || url.includes("mask.npy") || url.includes("confidence.npy") || url.includes("trycloudflare.com") || url.includes("localhost") || url.startsWith("/tmp/") || url.startsWith("/app/") || /^[a-zA-Z]:\\/.test(url)) return undefined;
      if (/^https?:\/\//i.test(url)) return url;
      if (url.startsWith("/api/")) return `${apiBaseUrl}${url}`;
      return undefined;
    },
    aiAssetUrl: (planeRunId, plane, assetName) => `/api/ai/assets/${planeRunId}/${plane}/${assetName}`,
  };
  vm.runInNewContext(`${js}
exports.canonicalPlaneToMriViewerModel = canonicalPlaneToMriViewerModel;
exports.studyRunToMriViewerModel = studyRunToMriViewerModel;`, sandbox);
  return sandbox.exports;
}

function loadInferenceReadiness() {
  const js = transpile("src/inferenceReadiness.ts");
  const sandbox = { exports: {}, console };
  vm.runInNewContext(`${js}
exports.normalizeAiAssetUrl = normalizeAiAssetUrl;`, sandbox);
  return sandbox.exports;
}

const adapter = loadAdapter();
const fixtures = loadFixtures();
const viewerViewModel = loadMriViewerViewModel();
const readiness = loadInferenceReadiness();

let count = 0;
function test(name, fn) {
  fn();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

// --- Estructura ------------------------------------------------------------------

test("MriSliceViewer no importa CanonicalPlaneRun/StudySeries/StudyMask/StudyLandmark", () => {
  const source = readSource("src/components/MriSliceViewer.tsx");
  for (const forbidden of ["CanonicalPlaneRun", "StudySeries", "StudyMask", "StudyLandmark"]) {
    assert.ok(!source.includes(forbidden), `MriSliceViewer.tsx no debe importar/mencionar "${forbidden}"`);
  }
});

test("MriSliceViewer no contiene tipos union entre dominios", () => {
  const source = readSource("src/components/MriSliceViewer.tsx");
  assert.ok(!source.includes("CanonicalPlaneSeriesItem | StudySeries"));
  assert.ok(!source.includes("CanonicalPlaneMask | StudyMask"));
  assert.ok(!source.includes("CanonicalLandmark | StudyLandmark"));
  assert.ok(!/\bViewerSeries\b/.test(source));
  assert.ok(!/\bViewerMask\b/.test(source));
  assert.ok(!/\bViewerLandmark\b/.test(source));
});

test("MriSliceViewer no contiene any", () => {
  const source = readSource("src/components/MriSliceViewer.tsx");
  assert.ok(!/:\s*any\b/.test(source), "no debe declarar : any en ninguna posicion de tipo");
  assert.ok(!/<any>/.test(source));
  assert.ok(!source.includes("stringField"));
  assert.ok(!source.includes("hasField"));
});

test("MriSliceViewer recibe model: MriViewerModel", () => {
  const source = readSource("src/components/MriSliceViewer.tsx");
  assert.match(source, /model:\s*MriViewerModel/);
});

test("StudyReviewView usa studyRunToMriViewerModel", () => {
  const source = readSource("src/components/StudyReviewView.tsx");
  assert.match(source, /studyRunToMriViewerModel/);
});

test("multiplanarRunTypes.ts no existe; multiplanarHttpTypes.ts existe", () => {
  assert.equal(existsSync(join(root, "src/multiplanarRunTypes.ts")), false);
  assert.equal(existsSync(join(root, "src/contracts/multiplanarHttpTypes.ts")), true);
});

test("canonicalRunToLegacyViewModel no existe en ningun lugar de src", () => {
  const files = [
    "src/adapters/multiplanarRunAdapter.ts",
    "src/features/worklist/NewAnalysisDrawer.tsx",
    "src/components/MriSliceViewer.tsx",
    "src/components/StudyReviewView.tsx",
  ];
  for (const file of files) {
    assert.ok(!readSource(file).includes("canonicalRunToLegacyViewModel"), `${file} no debe contener canonicalRunToLegacyViewModel`);
  }
});

test("no hay schemaVersion condicional en componentes", () => {
  for (const file of ["src/features/worklist/NewAnalysisDrawer.tsx", "src/components/MriSliceViewer.tsx", "src/components/StudyReviewView.tsx", "src/inferenceReadiness.ts", "src/selectors/canonicalRunSelectors.ts", "src/viewModels/measurementViewModel.ts", "src/viewModels/mriViewerViewModel.ts"]) {
    assert.ok(!readSource(file).includes("schemaVersion"), `${file} no debe conocer schemaVersion`);
  }
});

test("no hay inputPath en la solicitud multiplanar activa", () => {
  const httpTypes = readSource("src/contracts/multiplanarHttpTypes.ts");
  assert.ok(!httpTypes.includes("sagittalInputPath"));
  assert.ok(!httpTypes.includes("axialInputPath"));
  assert.ok(!httpTypes.includes("LegacyMultiplanarRunRequest"));
  const timeline = readSource("src/features/worklist/NewAnalysisDrawer.tsx");
  assert.ok(!timeline.includes("InputPath"));
});

// --- A. Modelo canonico -> visor --------------------------------------------------

function canonicalSagittalFixture() {
  return {
    plane: "sagittal",
    planeRunId: "run-fixture-v2-presenter-0001-sagittal",
    model: { key: "sagittal_spider" },
    input: { selectedSliceIndex: 12, sliceCount: 24 },
    coordinateSpace: "canonical_voxel",
    assets: [
      { assetName: "input.png", role: "input", url: "/api/ai/assets/run-1/sagittal/input.png" },
      { assetName: "overlay.png", role: "overlay", url: "/api/ai/assets/run-1/sagittal/overlay.png" },
    ],
    masks: [
      { id: "mask-1", label: "vertebra_group" },
      { id: "mask-2", label: "canal" },
      { id: "mask-3", label: "disc_group" },
    ],
    landmarks: [
      { id: "lm-1", labelKey: "vertebra_group_centroid", x: 120.4, y: 88.1 },
      { id: "lm-2", labelKey: "canal_centroid", x: 130.2, y: 95.6 },
      { id: "lm-3", labelKey: "disc_group_centroid", x: 118.7, y: 101.3 },
    ],
    measurements: [],
  };
}

test("A modelo canonico -> visor: 1 serie, 3 mascaras, 3 landmarks, input.png, overlay.png, labelKey estable", () => {
  const plane = canonicalSagittalFixture();
  const model = viewerViewModel.canonicalPlaneToMriViewerModel(plane);
  assert.ok(model.series);
  assert.equal(model.masks.length, 3);
  assert.equal(model.landmarks.length, 3);
  assert.ok(model.assets.some((asset) => asset.assetName === "input.png"));
  assert.ok(model.assets.some((asset) => asset.assetName === "overlay.png"));
  assert.deepEqual(model.landmarks.map((l) => l.labelKey).sort(), ["canal_centroid", "disc_group_centroid", "vertebra_group_centroid"]);
  const modelAgain = viewerViewModel.canonicalPlaneToMriViewerModel(plane);
  assert.deepEqual(model.landmarks.map((l) => l.id), modelAgain.landmarks.map((l) => l.id));
});

// --- B. Pipeline anterior -> visor -------------------------------------------------

test("B pipeline anterior -> visor: serie/mascaras/landmarks visibles; landmark de revisor conserva identidad", () => {
  const series = { id: "series-1", name: "Sagital", plane: "sagittal", sliceCount: 10, selectedSlice: 5, imageUrl: "/api/ai/assets/plane-1/sagittal/input.png", overlayUrl: "/api/ai/assets/plane-1/sagittal/overlay.png" };
  const masks = [{ id: "mask-a", label: "Disco intervertebral", className: "disc", color: "var(--mask-disc)" }];
  const reviewerLandmarkId = "reviewer-landmark-fixed-id";
  const landmarks = [
    { id: "ai-lm-1", label: "L4", seriesId: "series-1", sliceIndex: 5, x: 40, y: 60 },
    { id: reviewerLandmarkId, label: "R1", seriesId: "series-1", sliceIndex: 5, x: 10, y: 20, editable: true },
  ];
  const model = viewerViewModel.studyRunToMriViewerModel({ plane: "sagittal", planeRunId: "plane-1", series, masks, landmarks });
  assert.ok(model.series);
  assert.equal(model.masks.length, 1);
  assert.equal(model.landmarks.length, 2);
  const reviewerLandmark = model.landmarks.find((landmark) => landmark.id === reviewerLandmarkId);
  assert.ok(reviewerLandmark, "el landmark agregado por el revisor debe conservar su id existente");
  assert.equal(reviewerLandmark.source, "reviewer");
  assert.ok(model.assets.some((asset) => asset.assetName === "input.png"));
  assert.ok(model.assets.some((asset) => asset.assetName === "overlay.png"));
});

test("B2 no pierde edicion: moviendo un landmark de revisor conserva su id en una segunda pasada", () => {
  const landmarks = [{ id: "reviewer-landmark-fixed-id", label: "R1", seriesId: "series-1", sliceIndex: 5, x: 10, y: 20, editable: true }];
  const before = viewerViewModel.studyRunToMriViewerModel({ plane: "sagittal", masks: [], landmarks });
  const moved = landmarks.map((landmark) => (landmark.id === "reviewer-landmark-fixed-id" ? { ...landmark, x: 55, y: 66 } : landmark));
  const after = viewerViewModel.studyRunToMriViewerModel({ plane: "sagittal", masks: [], landmarks: moved });
  assert.equal(before.landmarks[0].id, after.landmarks[0].id);
  assert.notEqual(before.landmarks[0].x, after.landmarks[0].x);
});

// --- C. Seguridad de assets ---------------------------------------------------------

test("C1 assets del visor: input/overlay/mask-preview permitidos; mask.npy/confidence.npy bloqueados; /api/... durable aceptada", () => {
  assert.equal(readiness.normalizeAiAssetUrl("/api/ai/assets/run-1/sagittal/input.png", "https://backend.example"), "https://backend.example/api/ai/assets/run-1/sagittal/input.png");
  assert.equal(readiness.normalizeAiAssetUrl("/api/ai/assets/run-1/sagittal/overlay.png", "https://backend.example"), "https://backend.example/api/ai/assets/run-1/sagittal/overlay.png");
  assert.equal(readiness.normalizeAiAssetUrl("/api/ai/assets/run-1/sagittal/mask-preview.png", "https://backend.example"), "https://backend.example/api/ai/assets/run-1/sagittal/mask-preview.png");
  assert.equal(readiness.normalizeAiAssetUrl("/api/ai/assets/run-1/sagittal/mask.npy", "https://backend.example"), undefined);
  assert.equal(readiness.normalizeAiAssetUrl("/api/ai/assets/run-1/sagittal/confidence.npy", "https://backend.example"), undefined);
});

test("C2 frontera del adapter HTTP: trycloudflare/localhost/tmp/app/rutas Windows nunca llegan al modelo canonico (y por lo tanto nunca al visor)", () => {
  const raw = JSON.parse(JSON.stringify(fixtures.rawMultiplanarRunV2PublicPresenterFixture));
  raw.planes.sagittal.assets = {
    "input.png": { url: "https://tunnel.trycloudflare.com/sagittal/input.png" },
    "overlay.png": { url: "http://localhost:8080/sagittal/overlay.png" },
    "mask-preview.png": { url: "/tmp/run-1/sagittal/mask-preview.png" },
  };
  const canonical = adapter.parseMultiplanarRunResponse(raw);
  assert.equal(canonical.planes.sagittal.assets.length, 0);
  const model = viewerViewModel.canonicalPlaneToMriViewerModel(canonical.planes.sagittal);
  assert.ok(!model.assets.some((asset) => asset.url.includes("trycloudflare.com")));
  assert.ok(!model.assets.some((asset) => asset.url.includes("localhost")));
  assert.ok(!model.assets.some((asset) => asset.url.startsWith("/tmp/")));
  assert.ok(!model.assets.some((asset) => asset.url.startsWith("/app/")));
  assert.ok(!model.assets.some((asset) => /^[a-zA-Z]:\\/.test(asset.url)));
});

// --- D. Post-guardado ---------------------------------------------------------------
//
// D2..D7 verificaban el final del asistente de cuatro pasos: reviewSaved, "Iniciar
// nuevo analisis", "Ver estudio guardado". Ese flujo se elimino junto con
// AnalysisTimelineView, que duplicaba la sala de lectura con otro contrato de
// revision, asi que las pruebas ya no describen ningun comportamiento del sistema.
// D7 (medicion sin cambio no genera correction) sobrevive en
// p9c3-canonical-components-tests, verificada contra buildReviewCorrections, que es
// la unica construccion de correcciones que queda.

test("D1 la carga no navega por window.location ni recarga la pagina", () => {
  const source = readSource("src/features/worklist/NewAnalysisDrawer.tsx");
  assert.ok(!source.includes("window.location"));
  assert.ok(!source.includes(".reload()"));
});


// --- E. Independencia del contrato --------------------------------------------------

test("E1 fixture v2 -> adapter -> canonico -> visor sin ramas por schemaVersion", () => {
  const canonical = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV2PublicPresenterFixture);
  const model = viewerViewModel.canonicalPlaneToMriViewerModel(canonical.planes.sagittal);
  assert.equal(model.masks.length, 3);
  assert.equal(model.landmarks.length, 3);
  assert.equal(model.plane, "sagittal");
});

test("E2 fixture v1 -> adapter -> canonico -> visor sin ramas por schemaVersion", () => {
  const canonical = adapter.parseMultiplanarRunResponse(fixtures.rawMultiplanarRunV1Fixture);
  const model = viewerViewModel.canonicalPlaneToMriViewerModel(canonical.planes.sagittal);
  assert.equal(model.plane, "sagittal");
  assert.ok(Array.isArray(model.landmarks));
  assert.ok(Array.isArray(model.masks));
});

console.log(`P9-C.4 canonical closure tests passed: ${count}`);
