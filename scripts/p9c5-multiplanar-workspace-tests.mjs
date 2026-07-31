import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

function transpile(relativePath) {
  const source = readFileSync(join(root, relativePath), "utf8")
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/export (default )?/g, "");
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}

function loadAdapter() {
  const js = transpile("src/adapters/multiplanarRunAdapter.ts");
  const sandbox = { exports: {}, console, ContractError, MULTIPLANAR_CONTRACT_V2 };
  vm.runInNewContext(`${js}
exports.parseMultiplanarRunResponse = parseMultiplanarRunResponse;`, sandbox);
  return sandbox.exports;
}

function loadAssetParser() {
  const js = transpile("src/adapters/threeDProxyAssetParser.ts");
  const sandbox = { exports: {}, console };
  vm.runInNewContext(`${js}
exports.parseThreeDProxyMeshAsset = parseThreeDProxyMeshAsset;
exports.ThreeDProxyAssetError = ThreeDProxyAssetError;`, sandbox);
  return sandbox.exports;
}

function loadThreeDViewModel() {
  const js = transpile("src/viewModels/threeDProxyViewModel.ts");
  const sandbox = { exports: {}, console };
  vm.runInNewContext(`${js}
exports.canonicalThreeDToProxyViewModel = canonicalThreeDToProxyViewModel;`, sandbox);
  return sandbox.exports;
}

/** Same loader pattern as p9c3-canonical-components-tests.mjs: stubs react/react-jsx-runtime, returns {} for other imports, reaches only pure exported helpers. */
function loadComponentModule(path) {
  const source = readFileSync(join(root, path), "utf8");
  const compiled = ts.transpileModule(source, {
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

function loadMeasurementsPanel() {
  return loadComponentModule("src/components/MeasurementsPanel.tsx");
}

const measurementsPanel = loadMeasurementsPanel();

function readSource(path) {
  return readFileSync(join(root, path), "utf8");
}

const adapter = loadAdapter();
const assetParser = loadAssetParser();
const threeDViewModel = loadThreeDViewModel();

/*
 * reviewCorrectionsFrom vivia en AnalysisTimelineView, ya eliminado. La construccion
 * de correcciones sobrevive en api.ts como buildReviewCorrections y es contra esa que
 * se verifica que un axial se persista por el mismo mecanismo que un sagital.
 */
function loadReviewCorrections() {
  const source = readSource("src/api.ts")
    .replace(/^import .*$/gm, "")
    .replace(/import\.meta\.env/g, "({})")
    .replace(/export /g, "");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const sandbox = {
    exports: {}, console,
    fetch: async () => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({}) }),
    authHeaders: () => ({}), ensureAuthSession: async () => null,
    resolveMeasurementLabel: (item) => item.label ?? item.labelKey ?? "",
    isDemoDataMode: false, isRealDataMode: true, appDataMode: "real",
    markDataOrigin: (value) => value,
    frontendLogger: { error: () => undefined, warn: () => undefined, info: () => undefined },
    toSafeFrontendError: (error) => error, generateTraceId: () => "trace",
    priorityFromBackend: (value) => value ?? "media",
    refreshDoctorSession: async () => undefined, window: undefined,
  };
  vm.runInNewContext(`${compiled}
exports.buildReviewCorrections = buildReviewCorrections;`, sandbox);
  return sandbox.exports.buildReviewCorrections;
}

const buildReviewCorrections = loadReviewCorrections();

let count = 0;
function test(name, fn) {
  fn();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

function baseRawRun(threeD) {
  return {
    schemaVersion: MULTIPLANAR_CONTRACT_V2,
    runId: "run-p9c5-0001",
    traceId: "trace-p9c5-0001",
    caseId: "CASE-P9C5-0001",
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
    synthetic: false,
    fallbackReason: null,
    planes: {
      sagittal: {
        runId: "plane-run-p9c5-sagittal",
        plane: "sagittal",
        effectiveInferenceMode: "real_baseline",
        synthetic: false,
        humanReviewRequired: true,
        notClinicalDiagnosis: true,
        modelKey: "sagittal_spider",
        assets: [],
        landmarks: [],
        measurements: [],
      },
    },
    threeD,
  };
}

function validMeshAsset(overrides = {}) {
  return {
    schemaVersion: "pfi.lumbar-geometric-proxy.v1",
    kind: "experimental_geometric_proxy",
    method: "dual_plane_bbox_proxy",
    anatomicalReconstruction: false,
    volumetricReconstruction: false,
    coordinateSystem: "local_proxy_space",
    units: "normalized",
    vertices: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
    faces: [[0, 1, 2], [0, 2, 3]],
    structures: [{ label: "raw_50", vertexStart: 0, vertexCount: 4, faceStart: 0, faceCount: 2 }],
    limitations: ["Proxy geometrico experimental: no es reconstruccion anatomica 3D final."],
    traceability: {
      models: { sagittal: { runId: "plane-run-p9c5-sagittal" }, axial: { runId: "plane-run-p9c5-axial" } },
      parameters: { mappingSource: "config", mappingValidated: false },
    },
    ...overrides,
  };
}

// 1. parseo de experimental_ready
test("1 parseo de experimental_ready: threeD.enabled=true, status y assets preservados", () => {
  const raw = baseRawRun({
    enabled: true,
    status: "experimental_ready",
    sourcePlaneRunIds: { sagittal: "plane-run-p9c5-sagittal", axial: "plane-run-p9c5-axial" },
    requiredInputs: [],
    assets: [{ assetName: "lumbar-3d-mesh.json", url: "/api/ai/assets/run-p9c5-0001/workspace/lumbar-3d-mesh.json" }],
    reconstruction: { kind: "experimental_geometric_proxy", method: "dual_plane_bbox_proxy", anatomicalReconstruction: false, volumetricReconstruction: false, coordinateSystem: "local_proxy_space", mappingSource: "config", mappingValidated: false },
    warnings: ["Proxy geometrico experimental: no es reconstruccion anatomica 3D final."],
  });
  const run = adapter.parseMultiplanarRunResponse(raw);
  assert.equal(run.threeD.enabled, true);
  assert.equal(run.threeD.status, "experimental_ready");
  assert.equal(run.threeD.assets.length, 1);
  assert.equal(run.threeD.assets[0].url, "/api/ai/assets/run-p9c5-0001/workspace/lumbar-3d-mesh.json");
  assert.equal(run.threeD.reconstruction.mappingSource, "config");
  assert.equal(run.threeD.reconstruction.mappingValidated, false);
});

// 2. parseo de todos los estados bloqueados
test("2 parseo de todos los estados bloqueados definidos por el AI Module", () => {
  const blockedStatuses = [
    "blocked_missing_axial",
    "blocked_missing_sagittal",
    "experimental_blocked_insufficient_geometry",
    "experimental_blocked_missing_anatomical_mapping",
  ];
  for (const status of blockedStatuses) {
    const raw = baseRawRun({ enabled: false, status, sourcePlaneRunIds: {}, requiredInputs: [], assets: [], warnings: [] });
    const run = adapter.parseMultiplanarRunResponse(raw);
    assert.equal(run.threeD.enabled, false);
    assert.equal(run.threeD.status, status);
    assert.equal(run.threeD.assets.length, 0);
  }
  // pending_registered_reconstruction must never be treated as a recognized/ready status.
  const legacyRaw = baseRawRun({ enabled: false, status: "pending_registered_reconstruction", assets: [] });
  const legacyRun = adapter.parseMultiplanarRunResponse(legacyRaw);
  const viewModel = threeDViewModel.canonicalThreeDToProxyViewModel(legacyRun.threeD, { status: "idle" });
  assert.notEqual(viewModel.state, "available");
  assert.equal(viewModel.state, "unavailable");
});

// 3. rechazo de schema de mesh desconocido
test("3 rechazo de schema de mesh desconocido", () => {
  assert.throws(() => assetParser.parseThreeDProxyMeshAsset(validMeshAsset({ schemaVersion: "pfi.lumbar-sparse-mesh.v1" })), assetParser.ThreeDProxyAssetError);
  assert.throws(() => assetParser.parseThreeDProxyMeshAsset({ status: "ok" }), assetParser.ThreeDProxyAssetError);
});

// 4. rechazo de vertices no finitos
test("4 rechazo de vertices no finitos", () => {
  assert.throws(() => assetParser.parseThreeDProxyMeshAsset(validMeshAsset({ vertices: [[0, 0, 0], [Infinity, 0, 0], [1, 1, 0], [0, 1, 0]] })), (error) => error.code === "NON_FINITE_VERTEX");
  assert.throws(() => assetParser.parseThreeDProxyMeshAsset(validMeshAsset({ vertices: [[0, 0, 0], [NaN, 0, 0], [1, 1, 0], [0, 1, 0]] })), (error) => error.code === "NON_FINITE_VERTEX");
});

// 5. rechazo de caras fuera de rango
test("5 rechazo de caras fuera de rango y de indices no enteros", () => {
  assert.throws(() => assetParser.parseThreeDProxyMeshAsset(validMeshAsset({ faces: [[0, 1, 99]] })), (error) => error.code === "FACE_OUT_OF_RANGE");
  assert.throws(() => assetParser.parseThreeDProxyMeshAsset(validMeshAsset({ faces: [[0, 1, 1.5]] })), (error) => error.code === "INVALID_FACE");
  assert.throws(() => assetParser.parseThreeDProxyMeshAsset(validMeshAsset({ faces: [[-1, 0, 1]] })), (error) => error.code === "FACE_OUT_OF_RANGE");
});

// 6. rechazo de asset excesivo
test("6 rechazo de asset con arrays excesivamente grandes", () => {
  const hugeVertices = Array.from({ length: 20001 }, () => [0, 0, 0]);
  assert.throws(() => assetParser.parseThreeDProxyMeshAsset(validMeshAsset({ vertices: hugeVertices })), (error) => error.code === "VERTICES_TOO_LARGE");
  const hugeLimitations = Array.from({ length: 51 }, (_unused, index) => `limitation-${index}`);
  assert.throws(() => assetParser.parseThreeDProxyMeshAsset(validMeshAsset({ limitations: hugeLimitations })), (error) => error.code === "LIMITATIONS_TOO_LARGE");
});

// 7. generación del view model
test("7 generacion del view model a partir de threeD + asset ya parseado", () => {
  const raw = baseRawRun({ enabled: true, status: "experimental_ready", assets: [{ assetName: "lumbar-3d-mesh.json", url: "/api/ai/assets/x/workspace/lumbar-3d-mesh.json" }], warnings: [] });
  const run = adapter.parseMultiplanarRunResponse(raw);
  const asset = assetParser.parseThreeDProxyMeshAsset(validMeshAsset());
  const viewModel = threeDViewModel.canonicalThreeDToProxyViewModel(run.threeD, { status: "loaded", asset }, true);
  assert.equal(viewModel.state, "available");
  assert.equal(viewModel.controlsEnabled, true);
  assert.equal(viewModel.geometry.vertices.length, 4);
  assert.equal(viewModel.geometry.faces.length, 2);
  assert.equal(viewModel.flags.anatomicalReconstruction, false);
  assert.equal(viewModel.flags.volumetricReconstruction, false);
  assert.equal(viewModel.flags.humanReviewRequired, true);
});

// 8. ausencia de etiquetas anatomicas inventadas
test("8 estructuras del proxy conservan el label crudo (raw_*), sin traducir a anatomia", () => {
  const asset = assetParser.parseThreeDProxyMeshAsset(validMeshAsset());
  const viewModel = threeDViewModel.canonicalThreeDToProxyViewModel(
    { enabled: true, status: "experimental_ready", sourcePlaneRunIds: { sagittal: null, axial: null }, requiredInputs: [], assets: [{ assetName: "lumbar-3d-mesh.json", url: "/api/ai/assets/x/workspace/lumbar-3d-mesh.json" }], warnings: [] },
    { status: "loaded", asset },
  );
  assert.equal(viewModel.geometry.structures[0].label, "raw_50");
  assert.notEqual(viewModel.geometry.structures[0].label, "L1");
  assert.notEqual(viewModel.geometry.structures[0].label, "Grupo vertebral");
});

// 9. axial candidato — cubierto por inferenceReadiness
//
// El panel que listaba baselineReady/availableForRealInference/qualityGatePassed del
// axial vivia en AnalysisTimelineView, eliminado por duplicar la sala de lectura. La
// regla que importaba —que un axial candidato nunca se presente como baseline
// aprobado— la sostienen las pruebas de resolveReviewWorkspaceMode mas abajo, que
// devuelven sagittal_only ante un axial en modo contract.

// 10. no uso de la columna generica como resultado del paciente
test("10 SpineReconstructionPreview nunca combina el proxy con la columna generica; la sala de lectura siempre pasa proxy", () => {
  const router = readSource("src/components/SpineReconstructionPreview.tsx");
  assert.match(router, /if \(proxy\) return <ExperimentalProxyViewer viewModel=\{proxy\}/);
  assert.match(router, /return <GenericAtlasPreview threeD=\{threeD\} \/>;/);
  const reading = readSource("src/components/StudyReviewView.tsx");
  assert.match(reading, /<SpineReconstructionPreview[\s\S]{0,80}proxy=\{threeDProxyViewModel\}/);
  assert.ok(!reading.includes("<SpineReconstructionPreview />"), "la sala de lectura no debe renderizar el atlas generico sin proxy");
});

// 11. estado controlado ante asset invalido
test("11 asset invalido produce estado visual controlado, nunca una excepcion sin manejar", () => {
  const threeD = { enabled: true, status: "experimental_ready", sourcePlaneRunIds: { sagittal: null, axial: null }, requiredInputs: [], assets: [{ assetName: "lumbar-3d-mesh.json", url: "/api/ai/assets/x/workspace/lumbar-3d-mesh.json" }], warnings: [] };
  const viewModel = threeDViewModel.canonicalThreeDToProxyViewModel(threeD, { status: "invalid" });
  assert.equal(viewModel.state, "asset_invalid");
  assert.equal(viewModel.controlsEnabled, false);
  assert.ok(viewModel.title && viewModel.description);

  const errorViewModel = threeDViewModel.canonicalThreeDToProxyViewModel(threeD, { status: "error", traceId: "trace-err-1" });
  assert.equal(errorViewModel.state, "asset_error");
  assert.equal(errorViewModel.retryable, true);
  assert.equal(errorViewModel.traceId, "trace-err-1");
});

// 12. mantenimiento de estudios sagitales legacy
test("12 estudios sagitales legacy sin threeD no rompen el parseo ni exigen axial", () => {
  const legacyRaw = { ...baseRawRun(undefined) };
  delete legacyRaw.threeD;
  const run = adapter.parseMultiplanarRunResponse(legacyRaw);
  assert.equal(run.threeD, undefined);
  assert.equal(run.planes.axial, undefined);
  const viewModel = threeDViewModel.canonicalThreeDToProxyViewModel(run.threeD, { status: "idle" });
  assert.equal(viewModel.state, "unavailable");
  assert.equal(viewModel.controlsEnabled, false);
});

// 13. textos obligatorios de proxy experimental
test("13 textos obligatorios de proxy experimental presentes, y frases prohibidas ausentes", () => {
  const viewer = readSource("src/components/ExperimentalProxyViewer.tsx");
  const viewModelSource = readSource("src/viewModels/threeDProxyViewModel.ts");
  const reading = readSource("src/components/StudyReviewView.tsx");
  assert.match(viewer, /No representa una reconstrucci.n an.t.mica ni volum.trica\./);
  assert.match(viewModelSource, /No representa una reconstrucci.n an.t.mica ni volum.trica/);
  const forbidden = [
    "Reconstrucción 3D del paciente",
    "Columna reconstruida",
    "Modelo anatómico real",
    "Resultado clínico 3D",
  ];
  for (const phrase of forbidden) {
    assert.ok(!viewer.includes(phrase), `ExperimentalProxyViewer no debe contener "${phrase}"`);
    assert.ok(!viewModelSource.includes(phrase), `threeDProxyViewModel no debe contener "${phrase}"`);
    assert.ok(!reading.includes(phrase), `StudyReviewView no debe contener "${phrase}"`);
  }
});

// 14. ausencia de any y de interpretacion de schemaVersion en el componente
test("14 ExperimentalProxyViewer no usa any ni interpreta schemaVersion directamente", () => {
  const viewer = readSource("src/components/ExperimentalProxyViewer.tsx");
  assert.ok(!/:\s*any\b/.test(viewer), "ExperimentalProxyViewer no debe declarar tipos any");
  assert.ok(!viewer.includes("schemaVersion"), "ExperimentalProxyViewer no debe conocer schemaVersion (responsabilidad exclusiva del adapter/parser)");
  assert.match(viewer, /import type \{ ThreeDProxyViewModel \}/, "ExperimentalProxyViewer debe recibir el view model ya construido, no el dominio canonico ni la respuesta HTTP");
});

// 15. limpieza de recursos Three.js
test("15 ExperimentalProxyViewer libera renderer/geometria/materiales en el cleanup del efecto", () => {
  const viewer = readSource("src/components/ExperimentalProxyViewer.tsx");
  assert.match(viewer, /renderer\.dispose\(\)/);
  assert.match(viewer, /bufferGeometry\.dispose\(\)/);
  assert.match(viewer, /materials\.forEach\(\(material\) => material\.dispose\(\)\)/);
  assert.match(viewer, /window\.cancelAnimationFrame\(animation\)/);
  assert.match(viewer, /resizeObserver\.disconnect\(\)/);
});

// 16 y 16b verificaban la seleccion coordinada 2D/3D del asistente:
// structureKeyForLandmarkLabelKey y el cableado selectedStructure/onSelectStructure.
// Ambos vivian solo en AnalysisTimelineView, eliminado por duplicar la sala de
// lectura, y no quedo ninguna implementacion en src. ExperimentalProxyViewer conserva
// la API controlada (prueba 15b/16 de su propio archivo); afirmar que algun componente
// la cablea seria describir codigo que ya no existe.

// 17. correcciones persistentes plane-agnosticas (axial ya viaja por el mismo mecanismo que sagital)
test("17 buildReviewCorrections incluye correcciones axiales exactamente igual que sagitales (mismo mecanismo de persistencia)", () => {
  const measurements = [
    { id: "m-sag-1", label: "canal width", labelKey: "canal width", value: 10, aiValue: 10, reviewerValue: 11, unit: "mm", plane: "sagittal", source: "Reviewer", status: "editado" },
    { id: "m-ax-1", label: "raw_50 area", labelKey: "raw_50 area", value: 20, aiValue: 20, reviewerValue: 25, unit: "mm2", plane: "axial", source: "Reviewer", status: "editado" },
    { id: "m-ax-2", label: "raw_100 area", labelKey: "raw_100 area", value: 5, aiValue: 5, reviewerValue: 5, unit: "mm2", plane: "axial", source: "AI", status: "pendiente" },
  ];
  const corrections = buildReviewCorrections(measurements);
  assert.equal(corrections.length, 2);
  assert.ok(corrections.some((correction) => correction.measurementId === "m-sag-1"));
  assert.ok(corrections.some((correction) => correction.measurementId === "m-ax-1"));
  assert.ok(!corrections.some((correction) => correction.measurementId === "m-ax-2"), "medicion axial sin editar no debe generar correction");
  const axialCorrection = corrections.find((correction) => correction.measurementId === "m-ax-1");
  assert.equal(axialCorrection.beforeValue.value, 20);
  assert.equal(axialCorrection.afterValue.value, 25);
});

// 18. mediciones separadas visualmente por plano
test("18 MeasurementsPanel muestra columna Plano cuando hay mas de un plano presente", () => {
  assert.equal(measurementsPanel.displayMeasurementPlane("sagittal"), "Sagital");
  assert.equal(measurementsPanel.displayMeasurementPlane("axial"), "Axial");
  assert.equal(measurementsPanel.displayMeasurementPlane(undefined), "no informado");
  const source = readSource("src/components/MeasurementsPanel.tsx");
  assert.match(source, /hasMultiplePlanes/);
  assert.match(source, /data-plane=\{measurement\.plane/);
});

console.log(`P9-C.5 multiplanar workspace tests passed: ${count}`);
