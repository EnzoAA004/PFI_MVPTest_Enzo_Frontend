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
  const sandbox = { exports: {}, console, URL, ContractError, MULTIPLANAR_CONTRACT_V2, API_BASE_URL: "https://backend.example" };
  vm.runInNewContext(`${js}
exports.parseThreeD = parseThreeD;
exports.isDurableMeshAssetUrl = isDurableMeshAssetUrl;`, sandbox);
  return sandbox.exports;
}

function readSource(path) {
  return readFileSync(join(root, path), "utf8");
}

const adapter = loadAdapter();

let count = 0;
function test(name, fn) {
  fn();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

/**
 * P9-C.5 Parte B — Backend snapshot's threeD is written verbatim from the same
 * shape the live AI Module response has (see MultiplanarRunPersistenceService
 * on the Backend), so the frontend reuses parseThreeD from
 * multiplanarRunAdapter.ts for both sources instead of duplicating a parser.
 */

test("1 parseThreeD reconstruye threeD desde un snapshot persistido (canonicalRun.threeD) igual que desde la respuesta en vivo", () => {
  const persistedSnapshot = {
    enabled: true,
    status: "experimental_ready",
    sourcePlaneRunIds: { sagittal: "run-sag-1", axial: "run-ax-1" },
    requiredInputs: [],
    assets: [{ assetName: "lumbar-3d-mesh.json", role: "mesh_3d", contentType: "application/json", generated: true, url: "/api/ai/assets/multi-1/workspace/lumbar-3d-mesh.json" }],
    reconstruction: { kind: "experimental_geometric_proxy", method: "dual_plane_bbox_proxy", anatomicalReconstruction: false, volumetricReconstruction: false, coordinateSystem: "local_proxy_space", mappingSource: "config", mappingValidated: false },
    warnings: ["Proxy geometrico experimental: no es reconstruccion anatomica 3D final."],
  };
  const threeD = adapter.parseThreeD(persistedSnapshot);
  assert.equal(threeD.enabled, true);
  assert.equal(threeD.status, "experimental_ready");
  assert.equal(threeD.assets[0].url, "/api/ai/assets/multi-1/workspace/lumbar-3d-mesh.json");
  assert.equal(threeD.reconstruction.mappingSource, "config");
});

test("2 threeD ausente en el snapshot persistido no rompe el parseo (estudio legacy solo sagital)", () => {
  const threeD = adapter.parseThreeD(undefined);
  assert.equal(threeD, undefined);
});

test("3 StudyReviewView reconstruye el proxy 3D desde canonicalRun/metricsSnapshot del backend, nunca desde una respuesta en vivo del AI Module", () => {
  const source = readSource("src/components/StudyReviewView.tsx");
  assert.match(source, /parseThreeD\(run\.canonicalRun\?\.threeD \?\? run\.metricsSnapshot\?\.threeD\)/);
  assert.match(source, /fetchThreeDProxyAsset\(threeDMeshAssetUrl\)/);
  assert.match(source, /canonicalThreeDToProxyViewModel\(persistedThreeD, threeDAssetState/);
  assert.match(source, /<SpineReconstructionPreview proxy=\{threeDProxyViewModel\} \/>/);
  assert.ok(!source.includes("SpineReconstructionPreview threeD={displayRun.threeD}"), "StudyReviewView no debe seguir usando el campo threeD legacy nunca poblado");
});

test("4 ninguna llamada al AI Module durante la reapertura: StudyReviewView solo importa fetchThreeDProxyAsset de multiplanarApi.ts", () => {
  const source = readSource("src/components/StudyReviewView.tsx");
  const importLine = source.split("\n").find((line) => line.includes('from "../multiplanarApi"'));
  assert.ok(importLine, "StudyReviewView debe importar desde multiplanarApi.ts");
  assert.ok(!importLine.includes("runMultiplanarAnalysis"), "StudyReviewView no debe poder ejecutar una corrida nueva del AI Module durante la reapertura");
  assert.ok(!importLine.includes("uploadAiInput"), "StudyReviewView no debe poder subir inputs al AI Module durante la reapertura");
});

test("5 modo demo nunca dispara fetch del asset 3D (persistedThreeD se fuerza a undefined)", () => {
  const source = readSource("src/components/StudyReviewView.tsx");
  assert.match(source, /demoMode \? undefined : parseThreeD/);
});

test("6 asset invalido o error de descarga durante la reapertura produce un estado controlado, nunca una excepcion sin manejar", () => {
  const source = readSource("src/components/StudyReviewView.tsx");
  assert.match(source, /instanceof ThreeDProxyAssetError/);
  assert.match(source, /setThreeDAssetState\(\{ status: "invalid" \}\)/);
  assert.match(source, /setThreeDAssetState\(\{ status: "error"/);
});

test("7 el tab 3D nunca queda deshabilitado: cada estado tiene su propio mensaje dentro del panel", () => {
  const source = readSource("src/components/StudyReviewView.tsx");
  assert.match(source, /item === "3D Reconstruction" \? false/);
});

// 8. el mesh solo acepta /api/... o un origin que coincide exactamente con API_BASE_URL
test("8 isDurableMeshAssetUrl acepta solo /api/... o el origin exacto de API_BASE_URL, nunca un host arbitrario", () => {
  assert.equal(adapter.isDurableMeshAssetUrl("/api/ai/assets/run-1/workspace/lumbar-3d-mesh.json"), "/api/ai/assets/run-1/workspace/lumbar-3d-mesh.json");
  assert.equal(adapter.isDurableMeshAssetUrl("https://backend.example/api/ai/assets/run-1/workspace/lumbar-3d-mesh.json"), "https://backend.example/api/ai/assets/run-1/workspace/lumbar-3d-mesh.json");
  assert.equal(adapter.isDurableMeshAssetUrl("https://evil.example/api/ai/assets/run-1/workspace/lumbar-3d-mesh.json"), undefined);
  assert.equal(adapter.isDurableMeshAssetUrl("https://backend.example.evil.com/api/ai/assets/run-1/workspace/lumbar-3d-mesh.json"), undefined);
  assert.equal(adapter.isDurableMeshAssetUrl("https://backend.example/outputs/multiplanar_3d/run-1/lumbar-3d-mesh.json"), undefined, "path fuera de /api/ en el origin correcto tambien se rechaza");
  assert.equal(adapter.isDurableMeshAssetUrl("ftp://backend.example/api/x"), undefined);
  assert.equal(adapter.isDurableMeshAssetUrl(""), undefined);
  assert.equal(adapter.isDurableMeshAssetUrl(undefined), undefined);
});

test("9 threeD.assets con URL de host externo se descarta durante el parseo (nunca llega al dominio canonico)", () => {
  const threeD = adapter.parseThreeD({
    enabled: true, status: "experimental_ready", sourcePlaneRunIds: {}, requiredInputs: [],
    assets: [{ assetName: "lumbar-3d-mesh.json", url: "https://evil.example/steal/lumbar-3d-mesh.json" }],
    warnings: [],
  });
  assert.equal(threeD.assets.length, 0);
});

// 10. fetchThreeDProxyAsset nunca adjunta Authorization a un origen no autorizado
test("10 fetchThreeDProxyAsset valida el origin de forma independiente antes de cualquier fetch y nunca adjunta Authorization a un host externo", () => {
  const source = readSource("src/multiplanarApi.ts");
  assert.match(source, /const sanitizedUrl = isDurableMeshAssetUrl\(url\);/);
  assert.match(source, /if \(!sanitizedUrl\) throw new BackendApiError/);
  const fetchThreeDProxyAssetBody = source.slice(source.indexOf("export async function fetchThreeDProxyAsset"));
  const sanitizedCheckIndex = fetchThreeDProxyAssetBody.indexOf("if (!sanitizedUrl)");
  const firstFetchIndex = fetchThreeDProxyAssetBody.indexOf("await fetch(");
  assert.ok(sanitizedCheckIndex >= 0 && firstFetchIndex >= 0 && sanitizedCheckIndex < firstFetchIndex, "la validacion de origin debe ocurrir antes de cualquier fetch, nunca despues");
});

// 11. el tab de reapertura se llama "Proxy 3D experimental", sin frases de reconstruccion paciente-especifica
test("11 el tab de StudyReviewView se llama Proxy 3D experimental y no queda ningun texto de reconstruccion paciente-especifica", () => {
  const source = readSource("src/components/StudyReviewView.tsx");
  assert.match(source, /\{item === "3D Reconstruction" \? "Proxy 3D experimental" : /);
  assert.ok(!source.includes("paciente-específico"), "StudyReviewView no debe contener texto de reconstruccion paciente-especifica");
  assert.ok(!source.includes("paciente-especifico"), "StudyReviewView no debe contener texto de reconstruccion paciente-especifica");
});

// 12. la reapertura nunca usa GenericAtlasPreview como resultado del estudio persistido
test("12 StudyReviewView siempre pasa proxy a SpineReconstructionPreview (nunca cae a GenericAtlasPreview en el resultado persistido)", () => {
  const source = readSource("src/components/StudyReviewView.tsx");
  assert.match(source, /<SpineReconstructionPreview proxy=\{threeDProxyViewModel\} \/>/);
  assert.ok(!source.includes("GenericAtlasPreview"), "StudyReviewView no debe importar ni referenciar GenericAtlasPreview directamente");
});

console.log(`P9-C.5 Parte B reopening tests passed: ${count}`);
